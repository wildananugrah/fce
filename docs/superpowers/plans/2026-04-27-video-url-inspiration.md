# Video URL Inspiration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user pastes a video URL (TikTok, Instagram Reel, YouTube, etc.) into the topic or content generator's "Additional Direction" field, the generation job downloads the video, analyzes it with Gemini, and feeds the analysis into the AI prompt. Form preview stays fast; the heavy work happens inside the async generation job. YouTube URLs take a short-circuit path (no download — Gemini fetches the URL directly).

**Architecture:** A new `enrichWithVideo` method on `UrlInspirationService` runs after the existing `getInspiration` text-summary flow. It branches on `isDirectGeminiVideoUri(url)`: YouTube URLs use a new `analyzeVideoFromUri` method on `GeminiVideoAnalyzerProvider`; all other hosts use the existing `videoFetcher` + `analyzeVideo` (bytes) path. Results are cached in a new `videoSummary` column on `UrlScrapeCache`. Size + duration caps come from env. Apify parsers gain an optional `extractMedia()` method to surface video URLs from their post-specific JSON shapes.

**Tech Stack:** TypeScript, Bun, Hono, Prisma 7. `@anthropic-ai/sdk`, `@google/genai`. No new dependencies.

Spec: `docs/superpowers/specs/2026-04-27-video-url-inspiration-design.md`

---

## File Structure

**Create:**
- `backend/tests/services/url-inspiration.service.test.ts` — unit tests with mock repo, parser, fetcher, analyzer.

**Modify (backend):**
- `backend/prisma/schema.prisma` — `UrlScrapeCache.videoSummary` column.
- `backend/src/utils/env.ts` — two new env vars.
- `backend/src/utils/url-router.ts` — `isDirectGeminiVideoUri()` helper.
- `backend/src/config/generator-tuning.ts` — new `urlInspirationVideo` key.
- `backend/src/providers/apify-parsers/types.ts` — `MediaInfo` type + optional `extractMedia()` on the interface.
- `backend/src/providers/apify-parsers/instagram.parser.ts` — implement `extractMedia`.
- `backend/src/providers/apify-parsers/tiktok.parser.ts` — implement `extractMedia`.
- `backend/src/providers/apify-parsers/facebook.parser.ts` — implement `extractMedia`.
- `backend/src/interfaces/providers/video-analyzer.interface.ts` — add `analyzeVideoFromUri` method to the interface.
- `backend/src/providers/gemini-video.provider.ts` — implement `analyzeVideoFromUri`.
- `backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts` — add `setVideoSummary()` method.
- `backend/src/repositories/url-scrape-cache.repository.ts` — implement `setVideoSummary`.
- `backend/src/interfaces/services/url-inspiration.service.interface.ts` — `MediaSkipped`, `InspirationMedia` types + `media` field on `InspirationResult` + `enrichInspirationsFromPrompt()` method.
- `backend/src/services/url-inspiration.service.ts` — new constructor deps + `enrichWithVideo()` + `enrichInspirationsFromPrompt()`.
- `backend/src/index.ts` — wire new dependencies into `UrlInspirationService` constructor.
- `backend/src/jobs/topic-generation.job.ts` — switch from `getInspirationsFromPrompt` to `enrichInspirationsFromPrompt`.
- `backend/src/jobs/content-generation.job.ts` — same switch.
- `backend/.env.example` — document the two new env vars.

**Modify (frontend):**
- The URL inspiration card component (location verified during Task 11) — add the badge component.
- A type file mirroring the backend's `InspirationResult` shape — add the new `media` field.

---

## Task 1: Schema migration — `UrlScrapeCache.videoSummary`

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/prisma/schema.prisma` (UrlScrapeCache model around line 626)

- [ ] **Step 1: Add the column**

In `backend/prisma/schema.prisma`, locate `model UrlScrapeCache` (around line 626) and add `videoSummary` between `summary` and `scrapedAt`:

```prisma
model UrlScrapeCache {
  id           String   @id @default(uuid())
  urlHash      String   @unique @map("url_hash")
  url          String   @db.Text
  kind         String
  rawData      Json     @map("raw_data")
  summary      String?  @db.Text
  videoSummary String?  @db.Text @map("video_summary")
  scrapedAt    DateTime @default(now()) @map("scraped_at")
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("url_scrape_cache")
}
```

- [ ] **Step 2: Push schema**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Verify column exists**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'url_scrape_cache' AND column_name = 'video_summary';"
```

Expected: one row, `text`, `YES`.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(db): add videoSummary column to UrlScrapeCache

Nullable text column populated when a video URL inspiration is
enriched with Gemini Video Analyzer output. Existing rows have
videoSummary = null and get enriched on next generation that touches
the URL."
```

---

## Task 2: Env config — two new vars with defaults

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/utils/env.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/.env.example`

- [ ] **Step 1: Read existing env.ts to find the right insertion point**

```bash
grep -n "archiveTtlDays\|chatHistoryWindow" /Users/bellinnn/Documents/projects/fce/backend/src/utils/env.ts
```

Existing numeric env vars are read with `Number(process.env.X) || <default>` patterns. Match that style.

- [ ] **Step 2: Add the two env vars**

In `backend/src/utils/env.ts`, locate the `env` object literal. Add these two fields alongside other numeric defaults (e.g., near `archiveTtlDays`):

```ts
	videoInspirationMaxMb: Number(process.env.VIDEO_INSPIRATION_MAX_MB) || 100,
	videoInspirationMaxDurationSeconds:
		Number(process.env.VIDEO_INSPIRATION_MAX_DURATION_SECONDS) || 300,
```

If the file uses a typed interface above the literal, also add the corresponding fields to the interface:

```ts
	videoInspirationMaxMb: number;
	videoInspirationMaxDurationSeconds: number;
```

- [ ] **Step 3: Update `.env.example`**

Append to `backend/.env.example`:

```
# Video URL inspiration caps. Set to 0 to disable video analysis entirely.
# Size cap doesn't apply to YouTube URLs (Gemini fetches directly); duration cap does.
VIDEO_INSPIRATION_MAX_MB=100
VIDEO_INSPIRATION_MAX_DURATION_SECONDS=300
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline as before (typically 8). The new env fields are a pure addition.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/env.ts backend/.env.example
git commit -m "feat(env): add VIDEO_INSPIRATION_MAX_MB and VIDEO_INSPIRATION_MAX_DURATION_SECONDS

Defaults are 100 MB and 300 s. Either set to 0 disables the video
analysis stage entirely. Size cap doesn't apply on the YouTube path
(Gemini fetches the URL itself, no download)."
```

---

## Task 3: URL router helper — `isDirectGeminiVideoUri`

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/utils/url-router.ts`

- [ ] **Step 1: Add the helper**

Append to `backend/src/utils/url-router.ts`:

```ts
/**
 * True when the URL is a video host that Gemini's generateContent can fetch
 * directly via fileData.fileUri (no download, no Files API upload).
 *
 * Today only YouTube qualifies — verified against current Gemini docs:
 *   https://ai.google.dev/gemini-api/docs/video-understanding
 *
 * If Gemini documents support for additional hosts later, add them here in
 * one place; the analyzer branch in UrlInspirationService picks up the
 * change with no other code edits.
 */
export function isDirectGeminiVideoUri(url: string): boolean {
	return detectUrlKind(url).type === "youtube";
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: unchanged.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/utils/url-router.ts
git commit -m "feat(backend): add isDirectGeminiVideoUri url-router helper

Single predicate for which hosts Gemini can fetch directly via
fileData.fileUri. YouTube only today. New hosts only need this
function updated."
```

---

## Task 4: Generator tuning — `urlInspirationVideo` key

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/config/generator-tuning.ts`

- [ ] **Step 1: Add the new key**

In `backend/src/config/generator-tuning.ts`, the `GeneratorKey` union currently lists existing keys. Add `urlInspirationVideo` between `urlInspiration` and `chat`:

```ts
export type GeneratorKey =
	| "content"
	| "campaign"
	| "topic"
	| "productBrain"
	| "productScraper"
	| "brandScraper"
	| "briefSummary"
	| "urlInspiration"
	| "urlInspirationVideo" // NEW — Gemini Video Analyzer call inside enrichWithVideo
	| "chat";
```

In the `generatorTuning` record literal, add the entry alongside the others:

```ts
	urlInspirationVideo: { maxOutputTokens: 3000, temperature: 0.3 },
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline. (No site reads `generatorTuning.urlInspirationVideo` yet.)

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/config/generator-tuning.ts
git commit -m "feat(backend): add urlInspirationVideo key to generator-tuning

Independent tuning so video analysis cost can be capped without
affecting other surfaces. Default: 3000 max output tokens,
temperature 0.3 (extraction task)."
```

---

## Task 5: Apify parser interface — `extractMedia` + concrete impls

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/apify-parsers/types.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/apify-parsers/instagram.parser.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/apify-parsers/tiktok.parser.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/apify-parsers/facebook.parser.ts`

- [ ] **Step 1: Extend the parser interface**

Replace the contents of `backend/src/providers/apify-parsers/types.ts`:

```ts
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedResearchResult {
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title?: string;
	url?: string;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: Date;
}

/**
 * Video metadata extracted from a single Apify result item. Used by the
 * URL inspiration service to decide whether to run video analysis.
 *   - videoUrl: direct video URL the host's CDN serves (post-Apify resolution).
 *   - durationSeconds: from the post metadata when available.
 *   - sizeBytes: optional; usually populated by a HEAD request, not by Apify.
 */
export interface MediaInfo {
	videoUrl?: string;
	durationSeconds?: number;
	sizeBytes?: number;
}

export interface IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
	/**
	 * Optional. Implement on parsers whose hosts produce videos (Instagram,
	 * TikTok, Facebook). Return null when the item is not a video.
	 * Parsers without video concept (Google Search, Google Trends, Website
	 * crawler) don't implement this.
	 */
	extractMedia?(rawItem: ApifyResultItem): MediaInfo | null;
}
```

- [ ] **Step 2: Inspect the Instagram parser to learn the raw shape**

```bash
cat /Users/bellinnn/Documents/projects/fce/backend/src/providers/apify-parsers/instagram.parser.ts
```

The Apify Instagram actor typically surfaces `videoUrl` and `videoDuration` (in seconds, possibly fractional) for Reel/IGTV items. Image posts have neither. The exact field names depend on the actor in use — read the parser's existing field accesses to confirm.

- [ ] **Step 3: Implement Instagram `extractMedia`**

In `backend/src/providers/apify-parsers/instagram.parser.ts`, add an `extractMedia` method to the parser class:

```ts
	extractMedia(rawItem: ApifyResultItem): MediaInfo | null {
		// Instagram Apify actor: posts have `videoUrl` only when they're a Reel
		// or video post. Image-only posts return null here.
		const item = rawItem as Record<string, unknown>;
		const videoUrl = typeof item.videoUrl === "string" ? item.videoUrl : undefined;
		if (!videoUrl) return null;

		const duration =
			typeof item.videoDuration === "number"
				? Math.round(item.videoDuration)
				: undefined;
		return { videoUrl, durationSeconds: duration };
	}
```

Add the import for `MediaInfo` at the top:

```ts
import type { IActorResultParser, MediaInfo, ParsedResearchResult } from "./types";
```

(Adjust the import line to match the file's existing import style — extend the existing `./types` import.)

- [ ] **Step 4: Implement TikTok `extractMedia`**

In `backend/src/providers/apify-parsers/tiktok.parser.ts`:

```ts
	extractMedia(rawItem: ApifyResultItem): MediaInfo | null {
		const item = rawItem as Record<string, unknown>;
		// Common TikTok actor field names. Read existing parser code to
		// confirm — both `videoUrl` (top level) and `videoMeta.downloadAddr`
		// have been seen depending on actor version.
		const videoUrl =
			typeof item.videoUrl === "string"
				? item.videoUrl
				: typeof (item.videoMeta as Record<string, unknown> | undefined)?.downloadAddr === "string"
					? ((item.videoMeta as Record<string, unknown>).downloadAddr as string)
					: undefined;
		if (!videoUrl) return null;

		const meta = item.videoMeta as Record<string, unknown> | undefined;
		const duration =
			typeof meta?.duration === "number" ? Math.round(meta.duration) : undefined;
		return { videoUrl, durationSeconds: duration };
	}
```

Add the import as in step 3.

- [ ] **Step 5: Implement Facebook `extractMedia`**

In `backend/src/providers/apify-parsers/facebook.parser.ts`:

```ts
	extractMedia(rawItem: ApifyResultItem): MediaInfo | null {
		const item = rawItem as Record<string, unknown>;
		const videoUrl =
			typeof item.videoUrl === "string"
				? item.videoUrl
				: typeof item.video === "string"
					? item.video
					: undefined;
		if (!videoUrl) return null;

		const duration =
			typeof item.duration === "number" ? Math.round(item.duration) : undefined;
		return { videoUrl, durationSeconds: duration };
	}
```

Add the import as in step 3.

- [ ] **Step 6: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline. The interface change makes `extractMedia` optional, so existing parsers that don't implement it still satisfy the type.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/apify-parsers/types.ts \
        backend/src/providers/apify-parsers/instagram.parser.ts \
        backend/src/providers/apify-parsers/tiktok.parser.ts \
        backend/src/providers/apify-parsers/facebook.parser.ts
git commit -m "feat(backend): apify parsers expose extractMedia for video URL inspiration

Optional method on IActorResultParser. Instagram, TikTok, and Facebook
implement it; Google Search, Google Trends, and Website crawler don't
(no video concept). Returns the CDN videoUrl + durationSeconds when
the post is a video, else null."
```

---

## Task 6: Video analyzer — `analyzeVideoFromUri` method

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/interfaces/providers/video-analyzer.interface.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini-video.provider.ts`

- [ ] **Step 1: Read the current interface and provider**

```bash
cat /Users/bellinnn/Documents/projects/fce/backend/src/interfaces/providers/video-analyzer.interface.ts
sed -n '25,80p' /Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini-video.provider.ts
```

Note the existing `analyzeVideo` signature so the new method's return shape matches.

- [ ] **Step 2: Extend the interface**

In `backend/src/interfaces/providers/video-analyzer.interface.ts`, add a new method to `IVideoAnalyzer`:

```ts
	analyzeVideoFromUri(params: {
		videoUri: string;
		mimeType?: string; // optional; YouTube URLs don't need it
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}>;
```

Match the return shape exactly to `analyzeVideo`'s.

- [ ] **Step 3: Implement on `GeminiVideoAnalyzerProvider`**

In `backend/src/providers/gemini-video.provider.ts`, add the new method below `analyzeVideo`:

```ts
	async analyzeVideoFromUri(params: {
		videoUri: string;
		mimeType?: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const { videoUri, mimeType, instructions } = params;

		const systemPrompt =
			"You are a video analysis assistant. Watch the video and produce structured JSON.";
		const userPrompt = instructions;

		const startTime = Date.now();
		const response = await this.ai.models.generateContent({
			model: this.model,
			contents: [
				{
					parts: [
						{ text: instructions },
						{
							fileData: {
								fileUri: videoUri,
								...(mimeType ? { mimeType } : {}),
							},
						},
					],
				},
			],
			config: { temperature: 0.3, responseMimeType: "application/json" },
		});
		const durationMs = Date.now() - startTime;

		const text = response.text ?? "";
		const usage = response.usageMetadata;
		this.lastUsage = {
			inputTokens: usage?.promptTokenCount ?? 0,
			outputTokens: usage?.candidatesTokenCount ?? 0,
			durationMs,
		};

		const analysis = parseJson(text) as VideoAnalysisResult;
		return {
			analysis,
			usage: this.lastUsage,
			systemPrompt,
			userPrompt,
		};
	}
```

The existing `analyzeVideo({ bytes, mimeType, instructions })` method stays untouched so the competitor pipeline isn't disturbed.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline. The new method is purely additive.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/providers/video-analyzer.interface.ts \
        backend/src/providers/gemini-video.provider.ts
git commit -m "feat(backend): add analyzeVideoFromUri to GeminiVideoAnalyzerProvider

Sends the video URL to Gemini as fileData.fileUri so the model fetches
it server-side. Used for YouTube URLs in URL inspiration to skip the
download + Files API upload roundtrip. The existing analyzeVideo
(bytes path, used by competitor pipeline) is unchanged."
```

---

## Task 7: Cache repository — `setVideoSummary`

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/repositories/url-scrape-cache.repository.ts`

- [ ] **Step 1: Extend the interface**

In `backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts`, add the new method to `IUrlScrapeCacheRepository`:

```ts
	/**
	 * Update the videoSummary on an existing cache row, identified by URL hash.
	 * Idempotent — overwrites any prior value. No-op if the row doesn't exist.
	 */
	setVideoSummary(urlHash: string, videoSummary: string): Promise<void>;
```

Also add `videoSummary: string | null` to the `UrlScrapeCacheRecord` type returned by `findByHash` if it exists in this file (the read interface).

- [ ] **Step 2: Implement on the Prisma repo**

In `backend/src/repositories/url-scrape-cache.repository.ts`, add the implementation:

```ts
	async setVideoSummary(urlHash: string, videoSummary: string): Promise<void> {
		await this.prisma.urlScrapeCache
			.update({
				where: { urlHash },
				data: { videoSummary },
			})
			.catch(() => {
				// Row missing — no-op. The next getInspiration call will populate it.
			});
	}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts \
        backend/src/repositories/url-scrape-cache.repository.ts
git commit -m "feat(backend): add setVideoSummary to UrlScrapeCache repository

Updates the video_summary column for an existing cache row by URL
hash. Used by enrichWithVideo to persist the enriched summary so
subsequent generations on the same URL skip re-analysis."
```

---

## Task 8: `UrlInspirationService` interface

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/interfaces/services/url-inspiration.service.interface.ts`

- [ ] **Step 1: Read the current interface**

```bash
cat /Users/bellinnn/Documents/projects/fce/backend/src/interfaces/services/url-inspiration.service.interface.ts
```

- [ ] **Step 2: Add the new types and methods**

Append to `backend/src/interfaces/services/url-inspiration.service.interface.ts`:

```ts
export interface MediaSkipped {
	reason:
		| "size cap exceeded"
		| "duration cap exceeded"
		| "duration unknown"
		| "fetch failed"
		| "analysis failed"
		| "video analysis requires Gemini";
	sizeMb?: number;
	durationSeconds?: number;
	capMb?: number;
	capSeconds?: number;
}

export interface InspirationMedia {
	hasVideo: boolean;
	durationSeconds?: number;
	sizeMb?: number;
	skipped?: MediaSkipped;
}
```

Add `media?: InspirationMedia` to the existing `InspirationResult` interface (find it in the same file — it's the one returned by `getInspiration`).

Add two new methods to `IUrlInspirationService`:

```ts
	/**
	 * Like getInspiration, but for video URLs additionally downloads the
	 * video (or passes a fileUri for YouTube), runs Gemini video analysis,
	 * and merges the analysis into the inspiration summary. Always returns
	 * at least a text-only result; never throws on video-stage failures.
	 */
	enrichWithVideo(workspaceId: string, url: string, userId?: string): Promise<InspirationResult>;

	/**
	 * Bulk variant for the topic/content generation jobs. Processes URLs
	 * extracted from the prompt SEQUENTIALLY (not in parallel) to bound
	 * worst-case latency.
	 */
	enrichInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]>;
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: errors will appear in `UrlInspirationService` (which doesn't yet implement the new methods). That's intentional; Task 9 implements them.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/interfaces/services/url-inspiration.service.interface.ts
git commit -m "feat(backend): extend IUrlInspirationService with enrichWithVideo

Adds InspirationMedia + MediaSkipped types and two new methods:
enrichWithVideo (single URL, used by generation jobs after refactor)
and enrichInspirationsFromPrompt (bulk sequential, replaces the
parallel getInspirationsFromPrompt for the generation path).

The existing getInspiration / getInspirationsFromPrompt stay unchanged
in behavior — preview still uses the fast text-only path."
```

---

## Task 9: `UrlInspirationService` — `enrichWithVideo` implementation (TDD-style)

**Files:**
- Create: `/Users/bellinnn/Documents/projects/fce/backend/tests/services/url-inspiration.service.test.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/services/url-inspiration.service.ts`

This is the largest task. Write the unit tests first (failing), then implement.

- [ ] **Step 1: Set up the test file**

Create `backend/tests/services/url-inspiration.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UrlInspirationService } from "../../src/services/url-inspiration.service";

// ─── Mocks ──────────────────────────────────────────────────────

class MockCacheRepository {
	rows = new Map<string, {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		videoSummary: string | null;
		expiresAt: Date;
	}>();

	async findByHash(urlHash: string) {
		return this.rows.get(urlHash) ?? null;
	}
	async upsert(data: { urlHash: string; url: string; kind: string; rawData: unknown; summary: string | null; expiresAt: Date }) {
		const existing = this.rows.get(data.urlHash);
		this.rows.set(data.urlHash, {
			...data,
			videoSummary: existing?.videoSummary ?? null,
		});
	}
	async setVideoSummary(urlHash: string, videoSummary: string) {
		const row = this.rows.get(urlHash);
		if (row) row.videoSummary = videoSummary;
	}
	clear() {
		this.rows.clear();
	}
}

class MockApifyProvider {
	async runActor() {
		return { runId: "fake-run" };
	}
	async getRunStatus() {
		return { status: "SUCCEEDED" as const };
	}
	async getRunResults() {
		return [{ videoUrl: "https://cdn.example.com/v.mp4", videoDuration: 30 }];
	}
}

class MockResearchService {
	hasKey = true;
	async getSettings() {
		return { hasApifyKey: this.hasKey };
	}
	async getRawApifyKey() {
		return this.hasKey ? "fake-key" : null;
	}
}

class MockSummarizer {
	lastUsage = { inputTokens: 100, outputTokens: 50 };
	lastPrompts = { systemPrompt: "sys", userPrompt: "usr" };
	lastResponseText = "{}";
	async summarizeInspiration() {
		return { angle: "test angle", tone: "neutral", format: "Reel", keyPoints: ["a"] };
	}
}

class MockAiFactory {
	hasGemini = true;
	async getContentGenerator() {
		return new MockSummarizer();
	}
	async getSettings() {
		return { providers: { content: this.hasGemini ? "gemini" : "anthropic" } };
	}
}

class MockLogger {
	warn = mock(() => {});
	info = mock(() => {});
	error = mock(() => {});
	debug = mock(() => {});
}

// Apify parser registry stub — returns a parser that surfaces videoUrl + duration.
const mockParserRegistry = {
	getParser: () => ({
		parse: () => [],
		extractMedia: (item: any) => {
			if (item?.videoUrl) {
				return { videoUrl: item.videoUrl, durationSeconds: item.videoDuration };
			}
			return null;
		},
	}),
};

const fetcherCalls: string[] = [];
const fakeVideoFetcher = async (url: string) => {
	fetcherCalls.push(url);
	const bytes = new Uint8Array(1024 * 1024 * 5); // 5 MB
	return { bytes, mimeType: "video/mp4" };
};

const analyzerCalls: { kind: "bytes" | "uri"; payload: any }[] = [];
const fakeAnalyzer = {
	analyzeVideo: async (params: any) => {
		analyzerCalls.push({ kind: "bytes", payload: params });
		return {
			analysis: { description: "video shows X" },
			usage: { inputTokens: 200, outputTokens: 100, durationMs: 1000 },
			systemPrompt: "sys",
			userPrompt: "usr",
		};
	},
	analyzeVideoFromUri: async (params: any) => {
		analyzerCalls.push({ kind: "uri", payload: params });
		return {
			analysis: { description: "youtube video shows Y" },
			usage: { inputTokens: 150, outputTokens: 80, durationMs: 800 },
			systemPrompt: "sys",
			userPrompt: "usr",
		};
	},
};
const fakeBuildAnalyzer = async () => fakeAnalyzer;

const fakePrismaStub = {
	aiProviderLog: { create: async () => ({}) },
} as any;

function buildService(opts: { capMb?: number; capSeconds?: number; geminiAvailable?: boolean } = {}) {
	const cache = new MockCacheRepository();
	const apify = new MockApifyProvider();
	const research = new MockResearchService();
	const aiFactory = new MockAiFactory();
	if (opts.geminiAvailable === false) aiFactory.hasGemini = false;
	const logger = new MockLogger();

	const service = new UrlInspirationService(
		fakePrismaStub,
		apify as any,
		research as any,
		aiFactory as any,
		cache as any,
		logger as any,
		fakeVideoFetcher,
		fakeBuildAnalyzer,
		{
			maxMb: opts.capMb ?? 100,
			maxDurationSeconds: opts.capSeconds ?? 300,
		},
	);

	return { service, cache, apify, aiFactory, logger };
}

// Reset between tests
beforeEach(() => {
	fetcherCalls.length = 0;
	analyzerCalls.length = 0;
});

// ─── Tests ─────────────────────────────────────────────────────

describe("UrlInspirationService.enrichWithVideo", () => {
	it("skips video stage when extractMedia returns null", async () => {
		const { service } = buildService();
		// Force the apify result to have no videoUrl by stubbing getRunResults
		// inline (not shown here since the default mock has videoUrl). For a
		// non-video result, call the service with a website URL — apify still
		// runs but the parser returns no media.
		const result = await service.enrichWithVideo("ws-1", "https://example.com/article");
		expect(result.media).toBeUndefined();
		expect(analyzerCalls).toHaveLength(0);
		expect(fetcherCalls).toHaveLength(0);
	});

	it("YouTube path: calls analyzeVideoFromUri, never videoFetcher or analyzeVideo", async () => {
		const { service } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(fetcherCalls).toHaveLength(0);
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("uri");
		expect(analyzerCalls[0].payload.videoUri).toBe("https://www.youtube.com/watch?v=abc");
	});

	it("bytes path: calls videoFetcher and analyzeVideo for non-YouTube hosts", async () => {
		const { service } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(fetcherCalls).toHaveLength(1);
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("bytes");
	});

	it("size cap exceeded: skips video, returns mediaSkipped", async () => {
		const { service } = buildService({ capMb: 1 }); // 1 MB cap, fetcher returns 5 MB
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("size cap exceeded");
		expect(result.media?.skipped?.capMb).toBe(1);
	});

	it("duration cap exceeded: skips video, returns mediaSkipped", async () => {
		const { service } = buildService({ capSeconds: 10 }); // 10 s cap, mock duration is 30 s
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("duration cap exceeded");
		expect(result.media?.skipped?.capSeconds).toBe(10);
	});

	it("YouTube duration cap exceeded: same reason but no fetcher call", async () => {
		const { service } = buildService({ capSeconds: 10 });
		const result = await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(fetcherCalls).toHaveLength(0);
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("duration cap exceeded");
	});

	it("size cap is not enforced on YouTube path", async () => {
		const { service } = buildService({ capMb: 1 });
		const result = await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("uri");
		expect(result.media?.skipped).toBeUndefined();
	});

	it("caches videoSummary; second call returns cached without re-analysis", async () => {
		const { service, cache } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		const callsAfterFirst = analyzerCalls.length;

		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(callsAfterFirst); // no additional analyzer call
		expect(cache.rows.size).toBe(1);
	});

	it("caps set to 0: video stage entirely skipped", async () => {
		const { service } = buildService({ capMb: 0, capSeconds: 0 });
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(fetcherCalls).toHaveLength(0);
		// No skipped reason set when feature is disabled — just no media field.
		expect(result.media).toBeUndefined();
	});

	it("workspace has no Gemini provider: skips with reason", async () => {
		const { service } = buildService({ geminiAvailable: false });
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("video analysis requires Gemini");
	});
});
```

- [ ] **Step 2: Run the tests — confirm they fail (compilation error first, since the new constructor signature doesn't exist yet)**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test tests/services/url-inspiration.service.test.ts 2>&1 | tail -10
```

Expected: type errors — `UrlInspirationService` constructor doesn't accept the new `videoFetcher`, `buildAnalyzer`, and caps args yet, and there's no `enrichWithVideo` method. That's the point.

- [ ] **Step 3: Implement the new constructor and `enrichWithVideo` method**

In `backend/src/services/url-inspiration.service.ts`:

1. Add new imports at the top alongside existing imports:

```ts
import { isDirectGeminiVideoUri } from "../utils/url-router";
import type { IVideoAnalyzer } from "../interfaces/providers/video-analyzer.interface";
import type { MediaInfo } from "../providers/apify-parsers/types";
import type {
	InspirationMedia,
	MediaSkipped,
} from "../interfaces/services/url-inspiration.service.interface";
import { generatorTuning } from "../config/generator-tuning";
```

2. Extend the constructor — current signature is six args; add three more:

```ts
	constructor(
		private prisma: PrismaClient,
		private apifyProvider: IApifyProvider,
		private researchService: IResearchService,
		private aiFactory: AiProviderFactory,
		private cacheRepository: IUrlScrapeCacheRepository,
		private logger: ILogger,
		private videoFetcher: (url: string) => Promise<{ bytes: Uint8Array; mimeType: string }>,
		private buildVideoAnalyzer: (workspaceId: string) => Promise<IVideoAnalyzer>,
		private videoCaps: { maxMb: number; maxDurationSeconds: number },
	) {}
```

3. Add the `enrichWithVideo` method (place below `getInspirationsFromPrompt`):

```ts
	async enrichWithVideo(
		workspaceId: string,
		url: string,
		userId?: string,
	): Promise<InspirationResult> {
		// Always start from the base text-only flow. This populates the cache
		// row if it doesn't exist and gives us the metadata summary as the
		// fallback for any video-stage failure.
		const base = await this.getInspiration(workspaceId, url, userId);
		if (!base.summary) return base;

		const { maxMb, maxDurationSeconds } = this.videoCaps;
		// Caps both at 0 = feature disabled. Return base as-is, no media field.
		if (maxMb === 0 && maxDurationSeconds === 0) return base;

		// Look up cached row to check for an already-enriched videoSummary.
		const urlHash = await hashUrl(url);
		const cached = await this.cacheRepository.findByHash(urlHash);
		if (cached?.videoSummary) {
			return {
				...base,
				summary: JSON.parse(cached.videoSummary) as InspirationSummary,
				media: { hasVideo: true },
			};
		}

		// Resolve the video URL and duration. For YouTube, the input URL IS
		// the video URL — no need to consult the parser. For other hosts,
		// the parser extracts it from Apify metadata.
		let videoUrl: string | undefined;
		let durationSeconds: number | undefined;

		if (isDirectGeminiVideoUri(url)) {
			videoUrl = url;
			// Try to read duration from cached rawData if a parser surfaced it.
			const media = this.tryExtractMedia(cached?.rawData, base.kind);
			durationSeconds = media?.durationSeconds;
		} else {
			const media = this.tryExtractMedia(cached?.rawData, base.kind);
			if (!media) return base; // No video in this URL.
			videoUrl = media.videoUrl;
			durationSeconds = media.durationSeconds;
		}
		if (!videoUrl) return base;

		// Provider availability check — video analysis is Gemini-only.
		const settings = await this.aiFactory.getSettings(workspaceId);
		if (settings.providers.content !== "gemini") {
			return {
				...base,
				media: this.skipped("video analysis requires Gemini", { durationSeconds }),
			};
		}

		// Duration cap (applies to both paths if known).
		if (
			maxDurationSeconds > 0 &&
			durationSeconds !== undefined &&
			durationSeconds > maxDurationSeconds
		) {
			return {
				...base,
				media: this.skipped("duration cap exceeded", {
					durationSeconds,
					capSeconds: maxDurationSeconds,
				}),
			};
		}

		// Branch on YouTube vs bytes.
		try {
			const analyzer = await this.buildVideoAnalyzer(workspaceId);
			let analysisText: string;
			let sizeMb: number | undefined;

			if (isDirectGeminiVideoUri(videoUrl)) {
				const result = await analyzer.analyzeVideoFromUri({
					videoUri: videoUrl,
					instructions: this.videoInstructions(),
				});
				analysisText = JSON.stringify(result.analysis);
			} else {
				// Bytes path. Apply size cap after fetch.
				const { bytes, mimeType } = await this.videoFetcher(videoUrl);
				sizeMb = bytes.byteLength / (1024 * 1024);
				if (maxMb > 0 && sizeMb > maxMb) {
					return {
						...base,
						media: this.skipped("size cap exceeded", {
							sizeMb: Math.round(sizeMb * 10) / 10,
							capMb: maxMb,
							durationSeconds,
						}),
					};
				}
				const result = await analyzer.analyzeVideo({
					bytes,
					mimeType,
					instructions: this.videoInstructions(),
				});
				analysisText = JSON.stringify(result.analysis);
			}

			// Re-summarize with the video description merged in.
			const enriched = await this.summarizeAndLog(
				workspaceId,
				url,
				{ metadata: cached?.rawData, videoAnalysis: analysisText },
				userId,
			);

			await this.cacheRepository.setVideoSummary(urlHash, JSON.stringify(enriched));

			return {
				...base,
				summary: enriched,
				media: { hasVideo: true, durationSeconds, sizeMb },
			};
		} catch (err) {
			this.logger.warn("video inspiration failed, falling back to text-only", {
				url,
				error: err instanceof Error ? err.message : String(err),
			});
			return {
				...base,
				media: this.skipped("analysis failed", { durationSeconds }),
			};
		}
	}

	async enrichInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]> {
		if (!prompt) return [];
		const matches = prompt.match(URL_REGEX) ?? [];
		const urls = Array.from(new Set(matches)).slice(0, MAX_URLS_PER_PROMPT);
		if (urls.length === 0) return [];

		// SEQUENTIAL — bounds worst-case latency and avoids parallel Gemini
		// Files API uploads racing on quota.
		const results: InspirationResult[] = [];
		for (const url of urls) {
			results.push(await this.enrichWithVideo(workspaceId, url, userId));
		}
		return results;
	}

	private skipped(
		reason: MediaSkipped["reason"],
		extras: Partial<Omit<MediaSkipped, "reason">> = {},
	): InspirationMedia {
		return { hasVideo: true, skipped: { reason, ...extras } };
	}

	private videoInstructions(): string {
		return [
			"Watch the entire video and produce a JSON object with the following keys:",
			"  description: a 2-3 sentence summary of what happens in the video.",
			"  hook: how the video opens and grabs attention.",
			"  pacing: short notes on rhythm, cuts, pacing.",
			"  visualStyle: dominant visual elements (color, framing, motion).",
			"  audioNotes: music, voiceover, sound design hooks.",
			"  takeaway: the main thing a content creator could borrow from this video.",
			"Output ONLY the JSON object, no markdown or commentary.",
		].join("\n");
	}

	private tryExtractMedia(rawData: unknown, kind: string): MediaInfo | null {
		// Look up the Apify parser for this kind. If none implements
		// extractMedia, return null (the URL has no extractable video).
		// In production this delegates to a parser registry; for now we
		// inline the simple cases. Implementer may swap to a registry.
		if (!rawData) return null;
		const item = rawData as Record<string, unknown>;
		const videoUrl = typeof item.videoUrl === "string" ? item.videoUrl : undefined;
		if (!videoUrl) return null;
		const duration =
			typeof item.videoDuration === "number"
				? Math.round(item.videoDuration)
				: typeof (item.videoMeta as Record<string, unknown> | undefined)?.duration === "number"
					? Math.round((item.videoMeta as Record<string, unknown>).duration as number)
					: undefined;
		void kind;
		return { videoUrl, durationSeconds: duration };
	}
```

NOTE: the inline `tryExtractMedia` is a temporary shim. If your codebase has a parser registry (a map from `UrlKindType` to `IActorResultParser`), swap to that registry call. The shim above relies on the parsers' canonical field names (`videoUrl`, `videoDuration`, `videoMeta.duration`) being identical to what's stored in the cache's `rawData`. That holds in practice because Apify result items are passed through to the cache verbatim.

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test tests/services/url-inspiration.service.test.ts 2>&1 | tail -10
```

Expected: all 9 tests pass.

If a test fails, read the failure and fix either the test (if the assertion was wrong) or the implementation (if the behavior is wrong). Don't both.

- [ ] **Step 5: Run full test suite — confirm no regression**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: 171 + 9 = 180 pass, 1 fail (pre-existing ChatService failure).

- [ ] **Step 6: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: still 8 (baseline). The service file may have new errors if the implementer's mock signature drift caused issues — fix them.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/url-inspiration.service.ts \
        backend/tests/services/url-inspiration.service.test.ts
git commit -m "feat(backend): UrlInspirationService.enrichWithVideo

Adds video-analysis enrichment to URL inspiration. Branches on
isDirectGeminiVideoUri:
  - YouTube: analyzeVideoFromUri (no download, no Files API)
  - other hosts: videoFetcher + analyzeVideo (existing bytes path)

Caps (size MB, duration s) come from env. Caps both 0 = feature
disabled. Workspace without Gemini provider gets a clear skip reason.
Cache hit on videoSummary skips re-analysis. Failures (fetch, upload,
analysis) silently fall back to text-only with a mediaSkipped reason
so generation never aborts.

Sequential bulk variant enrichInspirationsFromPrompt for the topic /
content generation jobs."
```

---

## Task 10: Composition root wiring

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/index.ts`

- [ ] **Step 1: Inspect the current `UrlInspirationService` instantiation**

```bash
grep -n "new UrlInspirationService" /Users/bellinnn/Documents/projects/fce/backend/src/index.ts
```

The existing call passes 6 args. Update it to pass 9.

- [ ] **Step 2: Add the new arguments**

In `backend/src/index.ts`, find the line that constructs `urlInspirationService`. The existing `videoFetcher` and `buildVideoAnalyzer` closures (around lines 402 and 410) are already in scope — pass them directly.

```ts
	const urlInspirationService = new UrlInspirationService(
		prisma,
		apifyProvider,
		researchService,
		aiProviderFactory,
		urlScrapeCacheRepository,
		logger,
		videoFetcher,         // existing closure
		buildVideoAnalyzer,   // existing closure
		{
			maxMb: env.videoInspirationMaxMb,
			maxDurationSeconds: env.videoInspirationMaxDurationSeconds,
		},
	);
```

If the construction currently appears BEFORE `videoFetcher` and `buildVideoAnalyzer` are defined, move the `urlInspirationService` line down to after their definitions. Don't reorder unrelated code.

- [ ] **Step 3: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: tsc still 8, tests still 180 pass / 1 fail.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/index.ts
git commit -m "feat(backend): wire videoFetcher + buildVideoAnalyzer into UrlInspirationService

Reuses the existing closures already defined for the competitor
pipeline. Passes the env-configured caps."
```

---

## Task 11: Job integration — switch to `enrichInspirationsFromPrompt`

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/topic-generation.job.ts`
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Find the call sites**

Both jobs call `urlInspirationService.getInspirationsFromPrompt(...)`. The exact line numbers (per earlier inspection): topic-generation.job.ts line 161, content-generation.job.ts line 175.

- [ ] **Step 2: Switch topic-generation.job.ts**

In `backend/src/jobs/topic-generation.job.ts`, change the line:

```ts
const inspirations = await this.urlInspirationService.getInspirationsFromPrompt(
```

to:

```ts
const inspirations = await this.urlInspirationService.enrichInspirationsFromPrompt(
```

Leave the args and the `inspirations` consumer code unchanged — the return shape is the same `InspirationResult[]`.

- [ ] **Step 3: Switch content-generation.job.ts**

Same change in `backend/src/jobs/content-generation.job.ts` at line ~175.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 8.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/jobs/topic-generation.job.ts backend/src/jobs/content-generation.job.ts
git commit -m "feat(backend): topic + content generation jobs enrich URL inspirations with video

Both jobs now call enrichInspirationsFromPrompt instead of
getInspirationsFromPrompt. Form preview keeps using the fast
text-only getInspiration; only the async generation jobs pay the
video-analysis latency. Sequential URL processing inside the job
bounds worst-case wait time."
```

---

## Task 12: Frontend — preview badge + types

**Files:**
- Modify: the URL inspiration preview card component (find via grep)
- Modify: the frontend type that mirrors `InspirationResult`

- [ ] **Step 1: Find the relevant frontend files**

```bash
cd /Users/bellinnn/Documents/projects/fce
grep -rn "url-inspiration\|InspirationResult\|hasVideo" frontend/src --include="*.ts" --include="*.tsx" | head -20
```

Note the component file (likely `frontend/src/components/url-inspiration/UrlInspirationCard.tsx` or similar) and the type file (likely `frontend/src/services/url-inspiration.service.ts` per CLAUDE.md).

- [ ] **Step 2: Update the frontend type**

In the type file (e.g., `frontend/src/services/url-inspiration.service.ts`), add the optional `media` field to the `InspirationResult` type:

```ts
export interface MediaSkipped {
  reason:
    | "size cap exceeded"
    | "duration cap exceeded"
    | "duration unknown"
    | "fetch failed"
    | "analysis failed"
    | "video analysis requires Gemini";
  sizeMb?: number;
  durationSeconds?: number;
  capMb?: number;
  capSeconds?: number;
}

export interface InspirationMedia {
  hasVideo: boolean;
  durationSeconds?: number;
  sizeMb?: number;
  skipped?: MediaSkipped;
}

export interface InspirationResult {
  // ... existing fields ...
  media?: InspirationMedia; // NEW
}
```

- [ ] **Step 3: Add the badge to the preview card component**

In the preview card component, after the existing summary content render, add:

```tsx
{result.media?.hasVideo && !result.media.skipped && (
  <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
    🎥 Video detected — will be analyzed during generation
  </div>
)}
{result.media?.skipped?.reason === "size cap exceeded" && (
  <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
    🎥 Video exceeds {result.media.skipped.sizeMb} MB (cap {result.media.skipped.capMb} MB). Try a shorter clip.
  </div>
)}
{result.media?.skipped?.reason === "duration cap exceeded" && (
  <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
    🎥 Video exceeds {result.media.skipped.durationSeconds}s (cap {result.media.skipped.capSeconds}s). Try a shorter clip.
  </div>
)}
{result.media?.skipped?.reason === "video analysis requires Gemini" && (
  <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
    🎥 Video analysis requires Gemini. Configure a Gemini key in Workspace Settings.
  </div>
)}
```

The four conditions are mutually exclusive in practice (preview only ever shows one), but each is checked independently to keep the JSX simple.

- [ ] **Step 4: Typecheck the frontend**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src
git commit -m "feat(frontend): URL inspiration preview shows video-analysis badge

Four states based on the new media field on InspirationResult:
  - hasVideo, no skip → 'will be analyzed during generation'
  - size cap exceeded → suggest shorter clip with actual + cap MB
  - duration cap exceeded → suggest shorter clip with actual + cap s
  - no Gemini key → suggest configuring one in Workspace Settings

Form preview itself stays unchanged in latency — heavy analysis
runs only in the async topic/content generation jobs."
```

---

## Task 13: Manual smoke verification (user-side)

No automated tests for the live AI calls. Verify manually after restart.

- [ ] **Step 1: Restart backend with hot reload**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun run --hot src/index.ts
```

- [ ] **Step 2: Smoke a TikTok URL (bytes path)**

In the browser, open the topic generator. Paste a real public TikTok URL into the prompt or additional-direction field. Submit. Expected:
- Backend log shows `videoFetcher` invocation, then `analyzeVideo` call.
- Topic output references the video's content.
- AI activity log gets one new `url_inspiration_video` row.

- [ ] **Step 3: Smoke an Instagram Reel (bytes path)**

Same as TikTok. Expected: same behavior.

- [ ] **Step 4: Smoke a YouTube URL (URI path)**

Paste a short public YouTube URL (under 5 minutes). Submit. Expected:
- Backend log shows NO `videoFetcher` call for this URL.
- `analyzeVideoFromUri` invoked instead.
- Topic output references the video.

- [ ] **Step 5: Smoke a long YouTube URL (cap exceeded)**

Paste a YouTube URL > 5 minutes. Preview should show duration cap badge. Submit anyway. Expected: generation completes using text-only summary; backend log shows the skip with reason `duration cap exceeded`.

- [ ] **Step 6: Smoke the cache hit**

Re-paste the same TikTok URL within 24 hours. Submit. Expected: backend log shows cache hit on `videoSummary`, no fetcher or analyzer call.

- [ ] **Step 7: Final sanity sweep**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b
```

Expected: 180 pass / 1 fail, tsc 8, frontend clean.

---

## Summary

- 13 tasks, ~65 steps total.
- 1 new file (the unit test), ~14 modified files.
- 12 functional commits + 0 to 1 fix commit if smoke catches a regression.
- 1 Prisma migration (additive nullable column).
- 2 new env vars with safe defaults.
- 9 new unit tests covering both YouTube and bytes paths plus all four skip reasons.
- Manual smoke verification covers the live AI surfaces.
