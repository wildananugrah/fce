# Video URL Inspiration — Design

**Date:** 2026-04-27
**Status:** Proposed

## Problem

When a user pastes a TikTok / Instagram Reel / YouTube URL into the topic or content generator's "Additional Direction" field, FCE currently only fetches text metadata via the Apify scraper. The actual video content isn't analyzed, so the AI generation can't reason about hooks, pacing, visuals, audio, or anything that happens *inside* the video. Users see preview cards like "Content unavailable due to fallback scrape" because Instagram/TikTok HTML is opaque to the fallback fetcher and the Apify metadata alone is thin.

## Goal

When a URL inspiration has a video (per the Apify parser's `extractMedia` output), the topic and content generation jobs download the video, analyze it with Gemini Video Analyzer, and feed the analysis into the AI prompt as one of the inputs alongside the brand DNA, product brain, and user prompt. The form preview stays fast (text-only metadata + a "🎥 will be analyzed during generation" badge); the heavy work happens inside the async generation job.

## Non-goals

- **Video analysis in the form preview.** Preview stays at the current 1–3s metadata flow plus a badge.
- **Anthropic video support.** Anthropic doesn't have a comparable video API surface today; Anthropic-only workspaces skip video analysis with a visible reason.
- **Audio extraction or transcription as a separate stage.** Gemini Video already incorporates audio when analyzing.
- **Saving video frames or thumbnails to MinIO.** Video bytes go to Gemini's transient Files API and are discarded.
- **Per-workspace UI for tuning size/duration caps.** Env-only (`VIDEO_INSPIRATION_MAX_MB`, `VIDEO_INSPIRATION_MAX_DURATION_SECONDS`).
- **Re-analysis on cache TTL expiry mid-flight.** Cache is checked once at the start of `enrichWithVideo`.
- **YouTube long-form videos by default.** Default duration cap (300s) skips them. Workspaces that want them raise the cap.
- **Background prefetch of video analysis triggered by URL paste.** Analysis only runs inside the topic/content generation job.
- **A new dedicated `VideoInspirationService` class.** Capability lives on `UrlInspirationService` to keep the URL-handling logic in one place.

## User experience

### Form preview (unchanged in latency)

User pastes a TikTok URL. Within 1–3s the existing preview card renders with metadata + the existing text summary. A small badge appears below the card body based on what the parser detected:

| State | Badge text |
|---|---|
| No video URL in scrape | (no badge) |
| Video URL present, within caps | 🎥 Video detected — will be analyzed during generation |
| Video URL present, size > cap | 🎥 Video exceeds {sizeMb} MB (cap {capMb} MB). Try a shorter clip. |
| Video URL present, duration > cap | 🎥 Video exceeds {duration}s (cap {capSeconds}s). Try a shorter clip. |
| Video URL present, no Gemini key in workspace | 🎥 Video analysis requires Gemini. Configure a Gemini key in Workspace Settings. |

### Topic / content generation

The job processes each URL in `additionalDirection` (current limit `MAX_URLS_PER_PROMPT = 5`):

1. Look up the cached row by URL hash.
2. If `videoSummary` is already cached, use the enriched summary.
3. Otherwise, call the parser's `extractMedia(rawData)` to get `{ videoUrl?, durationSeconds? }`.
4. If no `videoUrl`, use the existing text summary.
5. If `videoUrl` present:
   - HEAD request first if `durationSeconds` is missing — extract `Content-Length`.
   - If size or duration exceeds env caps → use existing text summary with `mediaSkipped: { reason }`.
   - Else fetch bytes via the existing `videoFetcher`, hand to `GeminiVideoAnalyzerProvider`.
   - On success: re-run `summarizeInspiration` with the metadata + video description merged into the prompt. Persist the enriched summary to `UrlScrapeCache.videoSummary`. Same 24h TTL.
   - On failure: catch, log, fall back to the text summary with `mediaSkipped: { reason: "analysis failed" }`. Don't fail the parent generation job.
6. Each enriched summary becomes one of the inputs to the topic / content AI prompt.

URLs are processed sequentially within the job (not in parallel) so that worst-case latency is bounded and pg-boss queue concurrency stays predictable.

## Architecture

### Data model

Add one nullable column to `UrlScrapeCache` in `backend/prisma/schema.prisma`:

```prisma
model UrlScrapeCache {
  id           String   @id @default(uuid())
  urlHash      String   @unique @map("url_hash")
  url          String   @db.Text
  kind         String
  rawData      Json     @map("raw_data")
  summary      String?  @db.Text
  videoSummary String?  @db.Text @map("video_summary") // populated when a video was analyzed
  scrapedAt    DateTime @default(now()) @map("scraped_at")
  expiresAt    DateTime @map("expires_at")
  createdAt    DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("url_scrape_cache")
}
```

### Env config

Add to `backend/src/utils/env.ts`:

```ts
videoInspirationMaxMb: number;            // default 100
videoInspirationMaxDurationSeconds: number; // default 300
```

Surface in `.env.example` with comments. Setting either to `0` disables video analysis entirely (useful for cost-sensitive deployments).

### Apify parser interface change

Extend the `IActorResultParser` interface in `backend/src/providers/apify-parsers/types.ts`:

```ts
export interface MediaInfo {
	videoUrl?: string;
	durationSeconds?: number;
	sizeBytes?: number; // optional — mostly populated by HEAD request, not by Apify
}

export interface IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
	extractMedia?(rawItem: ApifyResultItem): MediaInfo | null;
}
```

`extractMedia` is **optional** — parsers that have no concept of video (Google Search, Google Trends) simply don't implement it. The service treats `undefined` and `null` the same: no video.

Concrete parsers:

- `instagram.parser.ts` — return `{ videoUrl: rawItem.videoUrl, durationSeconds: rawItem.videoDuration }` when the post is a Reel.
- `tiktok.parser.ts` — return `{ videoUrl: rawItem.videoUrl, durationSeconds: rawItem.videoMeta?.duration }`.
- `facebook.parser.ts` — return `{ videoUrl, durationSeconds }` when the post is a video post.
- `website-crawler.parser.ts`, `tiktok-profile.parser.ts`, `google-search.parser.ts`, `google-trends.parser.ts` — do not implement; default to no video.

The exact field names (`videoUrl`, `videoDuration`, `videoMeta.duration`, etc.) are validated against the actual Apify actor output JSON during implementation; the parser implementer adjusts to match.

### Generator tuning

Add to `backend/src/config/generator-tuning.ts`:

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
  | "urlInspirationVideo" // NEW — video analysis call inside enrichWithVideo
  | "chat";

export const generatorTuning: Record<GeneratorKey, GeneratorTuning> = {
  // ...existing...
  urlInspirationVideo: { maxOutputTokens: 3000, temperature: 0.3 },
};
```

Independent tuning so video analysis cost can be capped without affecting other surfaces.

### Service interface

Update `backend/src/interfaces/services/url-inspiration.service.interface.ts`:

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
	url: string;
	kind: string;
	summary: InspirationSummary;
	status: "fresh" | "cached" | "fallback";
	media?: InspirationMedia; // NEW
}

export interface IUrlInspirationService {
	getInspiration(workspaceId: string, url: string, userId?: string): Promise<InspirationResult>;
	enrichWithVideo(workspaceId: string, url: string, userId?: string): Promise<InspirationResult>; // NEW
}
```

`getInspiration` is unchanged in behavior — still text-only metadata flow. `enrichWithVideo` is the new entry point used by the generation jobs:

1. Calls `getInspiration` internally first (cache lookup or Apify scrape).
2. Reads cached `videoSummary` if present and returns enriched result.
3. Else extracts media via parser, applies env caps, fetches video, calls analyzer, merges, caches, returns enriched result.
4. Always returns at least a text-only result; never throws on video-stage failures.

### Composition root wiring

`backend/src/index.ts`:

- The existing `videoFetcher` closure (currently used only by `competitorPipelineJob`) and the existing `buildVideoAnalyzer(workspaceId)` closure both get passed into `UrlInspirationService` constructor.
- New constructor signature:

```ts
const urlInspirationService = new UrlInspirationService(
  prisma,
  apifyProvider,
  researchService,
  aiProviderFactory,
  urlScrapeCacheRepository,
  logger,
  videoFetcher,            // NEW
  buildVideoAnalyzer,      // NEW
  {                        // NEW
    maxMb: env.videoInspirationMaxMb,
    maxDurationSeconds: env.videoInspirationMaxDurationSeconds,
  },
);
```

### Job integration

`backend/src/jobs/topic-generation.job.ts` and `backend/src/jobs/content-generation.job.ts`:

The existing call pattern is roughly:

```ts
for (const url of urls) {
  const result = await urlInspirationService.getInspiration(workspaceId, url, userId);
  // ...append result.summary into prompt context
}
```

Change to:

```ts
for (const url of urls) {
  const result = await urlInspirationService.enrichWithVideo(workspaceId, url, userId);
  // ...append result.summary into prompt context (same shape; richer for video URLs)
}
```

No other changes to the generation jobs.

### Frontend

Existing URL inspiration components live under `frontend/src/components/url-inspiration/`. Update the preview card component to render the badge based on the new `media` field on `InspirationResult`. The badge is one short conditional block — no new components, no new context, no new API endpoint.

## Edge cases

| Scenario | Behavior |
|---|---|
| Apify parser doesn't implement `extractMedia` | Skip video stage; no badge. |
| Parser returns `videoUrl` but no `durationSeconds` | HEAD request to read `Content-Length`; if absent, skip with reason `"duration unknown"`. |
| Video URL returns 4xx/5xx (CDN block, expired) | `videoFetcher` throws; service catches, logs, returns text-only with `mediaSkipped: "fetch failed"`. |
| Video URL returns HTML (CDN block disguising as video) | `videoFetcher` already detects via `Content-Type` mismatch and throws. Same fallback. |
| Gemini Files API upload fails or polling times out | Service catches, logs, returns text-only with `mediaSkipped: "analysis failed"`. |
| Workspace has no Gemini key | Skip video stage with `mediaSkipped: "video analysis requires Gemini"`. Don't silently fall back to a different provider. |
| Multiple URLs in one prompt | Sequential processing inside the job. `MAX_URLS_PER_PROMPT = 5` already in code, unchanged. |
| Cache hit on `videoSummary` | Use cached enriched summary; skip re-fetch and re-analysis. |
| Caps set to `0` | Skip video stage entirely regardless of media. Service treats it as "feature disabled." |
| User changes caps in `.env` and restarts | New caps apply immediately. Cached `videoSummary` rows from before are still served (we don't re-evaluate against new caps for cached rows). |
| Same URL pasted in two simultaneous generations | Both calls hit `enrichWithVideo`. Race: both see cache miss, both fetch + analyze, both write `videoSummary` (last write wins, identical content). Acceptable — not worth a lock. |

## AI activity logging

Two new log rows per video-enriched URL:

- `generator: "url_inspiration_video"` — the Gemini Video Analyzer call. Includes `inputTokens`, `outputTokens`, `durationMs`, video size in metadata.
- `generator: "url_inspiration"` — the existing text-summarizer call, unchanged. (For video URLs, this call's input now includes the video description too.)

Both visible in the existing token usage / AI logs UI.

## Testing

- **Backend unit tests** in `backend/tests/services/url-inspiration.service.test.ts` (new):
  - Skips video when `extractMedia` returns null (no video URL).
  - Skips video when size cap exceeded; verifies `mediaSkipped.reason === "size cap exceeded"` and the actual + cap values.
  - Skips video when duration cap exceeded; same shape.
  - Caches `videoSummary` after success; second call returns cached result without invoking analyzer.
  - Falls back to text-only on `videoFetcher` failure.
  - Falls back to text-only on analyzer failure.
  - Skips video when no Gemini key in workspace settings.
  - Caps set to `0` disables the feature entirely.
- **Manual smoke verification** (per the existing manual-smoke pattern from prior features):
  - Paste a real TikTok URL into the topic generator. Submit. Topic uses video analysis.
  - Paste a real Instagram Reel URL. Same.
  - Paste a long YouTube URL (>5 min). Preview shows duration cap badge. Submit anyway. Generation uses text-only.
  - Paste an Instagram URL twice in two minutes. Second submit hits cache.
- **Frontend** — manual visual check of the four badge states.
- No new E2E framework — FCE has no frontend E2E setup and adding one is out of scope.

## Rollout

1. Prisma migration (one nullable column — additive, no backfill needed).
2. Env vars added with defaults that work without `.env` changes.
3. Backend code lands. URLs without videos: identical behavior to today. URLs with videos: enriched analysis on next generation.
4. Frontend update — preview badge appears. Without the backend change deployed, the `media` field is `undefined` and the badge renders nothing.
5. No data migration script required. Existing `UrlScrapeCache` rows have `videoSummary = null` by default; they get enriched on next generation that touches the URL.

## YAGNI / deferred

- Spotlight UI for tuning caps per-workspace.
- Background prefetch on URL paste.
- Anthropic video support.
- Re-analysis when caps change for previously-cached rows.
- Video frame thumbnails saved to MinIO.
- Standalone audio transcription stage.
- Per-URL skip reasons surfaced in the generation output (e.g., a "we couldn't analyze this video" line in the generated content). Reasons are surfaced in the form preview only.
- A `VideoInspirationService` class. Capability stays on `UrlInspirationService`.
