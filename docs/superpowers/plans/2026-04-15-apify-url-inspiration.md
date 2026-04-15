# Apify URL Inspiration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a URL inspiration pipeline that scrapes social media posts and websites via Apify, summarizes them with Gemini, caches results 24h, and injects structured inspiration into topic/content generation prompts.

**Architecture:** New `UrlInspirationService` orchestrates cache → detect → route to Apify actor → summarize via existing Gemini provider → cache. Topic/content jobs replace the naive `scrapeUrlsFromPrompt` call with the new service. Frontend adds live URL chips below Additional Direction.

**Tech Stack:** TypeScript, Hono, Prisma 7, Apify client, Gemini API, React 19, Tailwind 4

---

## File Map

See spec `docs/superpowers/specs/2026-04-15-apify-url-inspiration-design.md` section 9 for the full list.

---

### Task 1: Prisma schema — UrlScrapeCache model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the model**

Add this model anywhere in `backend/prisma/schema.prisma` (alongside other top-level models):

```prisma
model UrlScrapeCache {
  id        String   @id @default(uuid())
  urlHash   String   @unique @map("url_hash")
  url       String   @db.Text
  kind      String
  rawData   Json     @map("raw_data")
  summary   String?  @db.Text
  scrapedAt DateTime @default(now()) @map("scraped_at")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("url_scrape_cache")
}
```

- [ ] **Step 2: Push schema**

Run: `cd backend && DATABASE_URL=postgresql://fce:fce_secret@localhost:5433/fce_dashboard bunx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Regenerate Prisma client**

Run: `DATABASE_URL=postgresql://fce:fce_secret@localhost:5433/fce_dashboard bunx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add UrlScrapeCache model for apify scrape caching"
```

---

### Task 2: URL router utility

**Files:**
- Create: `backend/src/utils/url-router.ts`

- [ ] **Step 1: Write the file**

```typescript
export type UrlKindType = "instagram" | "tiktok" | "facebook" | "youtube" | "website";

export interface UrlKind {
	type: UrlKindType;
	url: string;
	normalizedUrl: string;
}

export function detectUrlKind(url: string): UrlKind {
	const normalized = normalizeUrl(url);
	let hostname = "";
	try {
		hostname = new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
	} catch {
		return { type: "website", url, normalizedUrl: normalized };
	}

	if (hostname === "instagram.com" || hostname === "instagr.am") {
		return { type: "instagram", url, normalizedUrl: normalized };
	}
	if (hostname === "tiktok.com" || hostname === "vm.tiktok.com") {
		return { type: "tiktok", url, normalizedUrl: normalized };
	}
	if (hostname === "facebook.com" || hostname === "fb.com" || hostname === "m.facebook.com") {
		return { type: "facebook", url, normalizedUrl: normalized };
	}
	if (hostname === "youtube.com" || hostname === "youtu.be" || hostname === "m.youtube.com") {
		return { type: "youtube", url, normalizedUrl: normalized };
	}
	return { type: "website", url, normalizedUrl: normalized };
}

export function normalizeUrl(url: string): string {
	const trimmed = url.trim();
	try {
		const parsed = new URL(trimmed);
		// Lowercase host, remove trailing slash, drop common tracking params
		parsed.hostname = parsed.hostname.toLowerCase();
		for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "igshid"]) {
			parsed.searchParams.delete(param);
		}
		let out = parsed.toString();
		if (out.endsWith("/") && parsed.pathname !== "/") out = out.slice(0, -1);
		return out;
	} catch {
		return trimmed;
	}
}

export async function hashUrl(url: string): Promise<string> {
	const normalized = normalizeUrl(url);
	const buf = new TextEncoder().encode(normalized);
	const hashBuf = await crypto.subtle.digest("SHA-256", buf);
	return Array.from(new Uint8Array(hashBuf))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/utils/url-router.ts
git commit -m "feat: add URL router with hostname-based kind detection"
```

---

### Task 3: Apify actor input builder

**Files:**
- Create: `backend/src/utils/apify-actor-inputs.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { UrlKind } from "./url-router";

export interface ApifyActorCall {
	actorId: string;
	input: Record<string, unknown>;
}

export function buildActorInput(kind: UrlKind): ApifyActorCall {
	switch (kind.type) {
		case "instagram":
			return {
				actorId: "apify/instagram-scraper",
				input: { directUrls: [kind.url], resultsLimit: 1, resultsType: "posts" },
			};
		case "tiktok":
			return {
				actorId: "clockworks/free-tiktok-scraper",
				input: { postURLs: [kind.url], resultsPerPage: 1, shouldDownloadVideos: false },
			};
		case "facebook":
			return {
				actorId: "apify/facebook-posts-scraper",
				input: { startUrls: [{ url: kind.url }], maxPosts: 1 },
			};
		case "youtube":
		case "website":
			return {
				actorId: "apify/website-content-crawler",
				input: {
					startUrls: [{ url: kind.url }],
					maxCrawlPages: 1,
					maxCrawlDepth: 0,
					crawlerType: "playwright:adaptive",
				},
			};
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/utils/apify-actor-inputs.ts
git commit -m "feat: add Apify actor input builder keyed by URL kind"
```

---

### Task 4: Inspiration summarizer interface + Gemini implementation

**Files:**
- Create: `backend/src/interfaces/providers/inspiration-summarizer.interface.ts`
- Modify: `backend/src/providers/gemini.provider.ts`

- [ ] **Step 1: Create the interface**

```typescript
export interface InspirationSummary {
	angle: string;
	tone: string;
	keyPoints: string[];
	format: string;
	hashtags?: string[];
	engagementSignal?: string;
}

export interface IInspirationSummarizer {
	summarizeInspiration(rawData: unknown): Promise<InspirationSummary>;
}
```

- [ ] **Step 2: Implement in GeminiProvider**

Add to `backend/src/providers/gemini.provider.ts`:

1. Add to the class implements list:
```typescript
export class GeminiProvider
    implements IContentGenerator, ICampaignGenerator, ITopicGenerator, IBrandScraper, IInspirationSummarizer
```

2. Add the import at the top:
```typescript
import type { IInspirationSummarizer, InspirationSummary } from "../interfaces/providers/inspiration-summarizer.interface";
```

3. Add the new method at the end of the class:

```typescript
async summarizeInspiration(rawData: unknown): Promise<InspirationSummary> {
    const systemPrompt = `You are a content strategist. Analyze social media posts and articles to extract their creative essence so another creator can generate similar ideas.

You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

    const userPrompt = `Analyze the following source data and extract its creative essence.

SOURCE DATA:
${JSON.stringify(rawData).slice(0, 6000)}

Return JSON with these fields:
- angle (string): What is this post about? What's the hook?
- tone (string): Tone and style (e.g., "Educational, warm, confident")
- keyPoints (array of strings): 2-5 core claims or messages from the post
- format (string): Format clues — carousel, reel, article, short video, long-form post, etc.
- hashtags (array of strings, optional): Top hashtags used if present in source data
- engagementSignal (string, optional): Only include if engagement metrics suggest a standout post (e.g., "High engagement: 50k+ likes")`;

    const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
            temperature: 0,
            systemInstruction: systemPrompt,
        },
        contents: userPrompt,
    });

    this.lastUsage = {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    };

    const text = response.text ?? "";
    try {
        return parseJsonResponse(text) as InspirationSummary;
    } catch (_err) {
        throw new Error(`GeminiProvider: Failed to parse inspiration summary. Raw: ${text}`);
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/providers/inspiration-summarizer.interface.ts backend/src/providers/gemini.provider.ts
git commit -m "feat: add InspirationSummarizer interface and Gemini implementation"
```

---

### Task 5: UrlScrapeCache repository

**Files:**
- Create: `backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts`
- Create: `backend/src/repositories/url-scrape-cache.repository.ts`

- [ ] **Step 1: Create the interface**

```typescript
export interface CachedScrape {
	id: string;
	urlHash: string;
	url: string;
	kind: string;
	rawData: unknown;
	summary: string | null;
	scrapedAt: Date;
	expiresAt: Date;
}

export interface IUrlScrapeCacheRepository {
	findByHash(urlHash: string): Promise<CachedScrape | null>;
	upsert(data: {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		expiresAt: Date;
	}): Promise<void>;
}
```

- [ ] **Step 2: Create the implementation**

```typescript
import type { PrismaClient } from "@prisma/client";
import type {
	CachedScrape,
	IUrlScrapeCacheRepository,
} from "../interfaces/repositories/url-scrape-cache.repository.interface";

export class UrlScrapeCacheRepository implements IUrlScrapeCacheRepository {
	constructor(private prisma: PrismaClient) {}

	async findByHash(urlHash: string): Promise<CachedScrape | null> {
		const row = await this.prisma.urlScrapeCache.findUnique({ where: { urlHash } });
		if (!row) return null;
		if (row.expiresAt < new Date()) return null;
		return row as unknown as CachedScrape;
	}

	async upsert(data: {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		expiresAt: Date;
	}): Promise<void> {
		await this.prisma.urlScrapeCache.upsert({
			where: { urlHash: data.urlHash },
			update: {
				url: data.url,
				kind: data.kind,
				rawData: data.rawData as any,
				summary: data.summary,
				scrapedAt: new Date(),
				expiresAt: data.expiresAt,
			},
			create: {
				urlHash: data.urlHash,
				url: data.url,
				kind: data.kind,
				rawData: data.rawData as any,
				summary: data.summary,
				expiresAt: data.expiresAt,
			},
		});
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts backend/src/repositories/url-scrape-cache.repository.ts
git commit -m "feat: add UrlScrapeCache repository"
```

---

### Task 6: UrlInspirationService

**Files:**
- Create: `backend/src/interfaces/services/url-inspiration.service.interface.ts`
- Create: `backend/src/services/url-inspiration.service.ts`

- [ ] **Step 1: Create the interface**

```typescript
import type { InspirationSummary } from "../providers/inspiration-summarizer.interface";

export interface InspirationResult {
	url: string;
	kind: string;
	summary: InspirationSummary | null;
	status: "cached" | "scraped" | "fallback" | "failed";
	error?: string;
}

export interface IUrlInspirationService {
	getInspiration(workspaceId: string, url: string): Promise<InspirationResult>;
	getInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
	): Promise<InspirationResult[]>;
}
```

- [ ] **Step 2: Create the implementation**

```typescript
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { IInspirationSummarizer, InspirationSummary } from "../interfaces/providers/inspiration-summarizer.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IUrlScrapeCacheRepository } from "../interfaces/repositories/url-scrape-cache.repository.interface";
import type { IResearchService } from "../interfaces/services/research.service.interface";
import type {
	InspirationResult,
	IUrlInspirationService,
} from "../interfaces/services/url-inspiration.service.interface";
import { buildActorInput } from "../utils/apify-actor-inputs";
import { detectUrlKind, hashUrl, normalizeUrl } from "../utils/url-router";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const APIFY_WAIT_SECONDS = 90;
const MAX_URLS_PER_PROMPT = 5;
const URL_REGEX = /https?:\/\/[^\s<>"]+/g;

export class UrlInspirationService implements IUrlInspirationService {
	constructor(
		private apifyProvider: IApifyProvider,
		private researchService: IResearchService,
		private summarizer: IInspirationSummarizer,
		private cacheRepository: IUrlScrapeCacheRepository,
		private logger: ILogger,
	) {}

	async getInspiration(workspaceId: string, url: string): Promise<InspirationResult> {
		try {
			const kind = detectUrlKind(url);
			const urlHash = await hashUrl(url);

			// Cache lookup
			const cached = await this.cacheRepository.findByHash(urlHash);
			if (cached && cached.summary) {
				return {
					url: cached.url,
					kind: cached.kind,
					summary: JSON.parse(cached.summary) as InspirationSummary,
					status: "cached",
				};
			}

			// Fetch workspace Apify key
			const settings = await this.researchService.getSettings(workspaceId);
			if (!settings?.hasApifyKey) {
				this.logger.warn("No Apify key for URL inspiration, using fallback", { workspaceId, url });
				return this.fallbackFetch(url, kind.type, urlHash);
			}

			// Get the raw key
			const apiKey = await this.researchService.getRawApifyKey(workspaceId);
			if (!apiKey) {
				return this.fallbackFetch(url, kind.type, urlHash);
			}

			// Run Apify actor
			const { actorId, input } = buildActorInput(kind);
			let rawData: unknown;
			try {
				const { runId } = await this.apifyProvider.runActor(actorId, input, apiKey);
				// Poll until finish or timeout
				const deadline = Date.now() + APIFY_WAIT_SECONDS * 1000;
				while (Date.now() < deadline) {
					const status = await this.apifyProvider.getRunStatus(runId, apiKey);
					if (status.status === "SUCCEEDED") {
						const results = await this.apifyProvider.getRunResults(runId, apiKey);
						rawData = results[0] ?? null;
						break;
					}
					if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status.status)) {
						throw new Error(`Apify run ${status.status}`);
					}
					await new Promise((resolve) => setTimeout(resolve, 2000));
				}
				if (!rawData) throw new Error("Apify run timeout");
			} catch (err) {
				this.logger.warn("Apify scrape failed, using fallback", {
					url,
					error: err instanceof Error ? err.message : String(err),
				});
				return this.fallbackFetch(url, kind.type, urlHash);
			}

			// Summarize with Gemini
			const summary = await this.summarizer.summarizeInspiration(rawData);

			// Cache
			await this.cacheRepository.upsert({
				urlHash,
				url: normalizeUrl(url),
				kind: kind.type,
				rawData,
				summary: JSON.stringify(summary),
				expiresAt: new Date(Date.now() + CACHE_TTL_MS),
			});

			return { url, kind: kind.type, summary, status: "scraped" };
		} catch (err) {
			this.logger.warn("URL inspiration failed", {
				url,
				error: err instanceof Error ? err.message : String(err),
			});
			return {
				url,
				kind: "website",
				summary: null,
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async getInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
	): Promise<InspirationResult[]> {
		if (!prompt) return [];
		const matches = prompt.match(URL_REGEX) ?? [];
		const urls = Array.from(new Set(matches)).slice(0, MAX_URLS_PER_PROMPT);
		if (urls.length === 0) return [];

		const results = await Promise.all(
			urls.map((url) => this.getInspiration(workspaceId, url)),
		);
		return results;
	}

	private async fallbackFetch(
		url: string,
		kindType: string,
		urlHash: string,
	): Promise<InspirationResult> {
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
				},
				signal: AbortSignal.timeout(10_000),
				redirect: "follow",
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const html = await response.text();
			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 3000);
			if (!text) throw new Error("Empty text extracted");

			const summary = await this.summarizer.summarizeInspiration({ url, text });
			await this.cacheRepository.upsert({
				urlHash,
				url: normalizeUrl(url),
				kind: kindType,
				rawData: { url, text, fallback: true },
				summary: JSON.stringify(summary),
				expiresAt: new Date(Date.now() + CACHE_TTL_MS),
			});
			return { url, kind: kindType, summary, status: "fallback" };
		} catch (err) {
			return {
				url,
				kind: kindType,
				summary: null,
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
```

Note: `IResearchService` needs a `getRawApifyKey` method. We'll add it in Task 7.

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/services/url-inspiration.service.interface.ts backend/src/services/url-inspiration.service.ts
git commit -m "feat: add UrlInspirationService orchestrating cache + apify + summarizer"
```

---

### Task 7: Expose raw Apify key from ResearchService

**Files:**
- Modify: `backend/src/interfaces/services/research.service.interface.ts`
- Modify: `backend/src/services/research.service.ts`

- [ ] **Step 1: Add to interface**

Add this method signature to the existing interface:

```typescript
getRawApifyKey(workspaceId: string): Promise<string | null>;
```

- [ ] **Step 2: Implement**

Add this method to the `ResearchService` class:

```typescript
async getRawApifyKey(workspaceId: string): Promise<string | null> {
    const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
    return settings?.apifyApiKey ?? null;
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/services/research.service.interface.ts backend/src/services/research.service.ts
git commit -m "feat: expose raw Apify key from research service for internal use"
```

---

### Task 8: Preview route + wiring

**Files:**
- Create: `backend/src/routes/url-inspiration.route.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Create the route**

```typescript
import { Hono } from "hono";
import type { IUrlInspirationService } from "../interfaces/services/url-inspiration.service.interface";

type Variables = {
	userId: string;
	workspaceId: string;
};

export function createUrlInspirationRoutes(service: IUrlInspirationService) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/preview", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { url } = body;
		if (!url || typeof url !== "string") {
			return c.json({ error: "url is required" }, 400);
		}
		const result = await service.getInspiration(workspaceId, url);
		return c.json({ data: result });
	});

	return app;
}
```

- [ ] **Step 2: Wire in index.ts**

In `backend/src/index.ts`, add the imports:

```typescript
import { UrlScrapeCacheRepository } from "./repositories/url-scrape-cache.repository";
import { UrlInspirationService } from "./services/url-inspiration.service";
import { createUrlInspirationRoutes } from "./routes/url-inspiration.route";
```

In the service construction area (where `ResearchService` is instantiated), add after it:

```typescript
const urlScrapeCacheRepository = new UrlScrapeCacheRepository(prisma);
const urlInspirationService = new UrlInspirationService(
    apifyProvider,
    researchService,
    resolveContentGenerator() as any, // Gemini provider now implements IInspirationSummarizer
    urlScrapeCacheRepository,
    logger,
);
```

Then in the workspace-scoped routes section (where other workspace routes are mounted), add:

```typescript
workspaceScoped.route("/url-inspiration", createUrlInspirationRoutes(urlInspirationService));
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/url-inspiration.route.ts backend/src/index.ts
git commit -m "feat: wire url-inspiration route and service in composition root"
```

---

### Task 9: Inject inspirations into topic and content generation jobs

**Files:**
- Modify: `backend/src/jobs/topic-generation.job.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Update topic-generation.job.ts**

Add the import:
```typescript
import type { IUrlInspirationService } from "../interfaces/services/url-inspiration.service.interface";
```

Add a constructor parameter:
```typescript
constructor(
    private prisma: PrismaClient,
    private topicGenerator: ITopicGenerator,
    private notificationService: INotificationService,
    private logger: ILogger,
    private urlInspirationService: IUrlInspirationService,
) {}
```

Replace the existing URL scraping block (the `scrapeUrlsFromPrompt` call) with:

```typescript
// Get URL inspirations via Apify + Gemini summarizer
const inspirations = await this.urlInspirationService.getInspirationsFromPrompt(workspaceId, prompt);
const successfulInspirations = inspirations.filter((i) => i.summary !== null);
let enrichedPrompt = prompt;
if (successfulInspirations.length > 0) {
    const block = successfulInspirations
        .map((i) => {
            const s = i.summary!;
            const parts = [
                `Reference from ${i.url} (${i.kind}):`,
                `- Angle: ${s.angle}`,
                `- Tone: ${s.tone}`,
                `- Key points: ${s.keyPoints.join("; ")}`,
                `- Format: ${s.format}`,
            ];
            if (s.hashtags?.length) parts.push(`- Hashtags: ${s.hashtags.join(" ")}`);
            if (s.engagementSignal) parts.push(`- Engagement: ${s.engagementSignal}`);
            return parts.join("\n");
        })
        .join("\n\n---\n\n");
    enrichedPrompt = `${prompt ?? ""}\n\n=== REFERENCE INSPIRATION ===\n${block}\n\nIMPORTANT: Use the reference inspiration above as direct creative direction. Derive topic angles, themes, and claims from it. At least half of the generated topics should clearly reflect the reference content — not copy it, but build on its angle, tone, or themes for this brand.`;
    this.logger.info("URL inspirations injected into topic generation", {
        workspaceId,
        count: successfulInspirations.length,
    });
}
```

Remove the import of `scrapeUrlsFromPrompt` if it becomes unused.

- [ ] **Step 2: Update content-generation.job.ts**

Same pattern — add constructor param, replace the `scrapeUrlsFromPrompt` block with the inspiration block above (using `request.prompt` instead of `prompt`).

- [ ] **Step 3: Wire the new constructor arg in index.ts**

Find where `TopicGenerationJob` and `ContentGenerationJob` are instantiated. Add `urlInspirationService` as the last constructor argument.

- [ ] **Step 4: Commit**

```bash
git add backend/src/jobs/topic-generation.job.ts backend/src/jobs/content-generation.job.ts backend/src/index.ts
git commit -m "feat: inject URL inspirations into topic and content generation prompts"
```

---

### Task 10: Frontend — API client + chips component

**Files:**
- Create: `frontend/src/services/url-inspiration.service.ts`
- Create: `frontend/src/components/url-inspiration/UrlInspirationChips.tsx`

- [ ] **Step 1: Create API client**

```typescript
import { api } from "./api";

export interface InspirationSummary {
    angle: string;
    tone: string;
    keyPoints: string[];
    format: string;
    hashtags?: string[];
    engagementSignal?: string;
}

export interface InspirationResult {
    url: string;
    kind: string;
    summary: InspirationSummary | null;
    status: "cached" | "scraped" | "fallback" | "failed";
    error?: string;
}

export const urlInspirationApi = {
    async preview(workspaceId: string, url: string): Promise<InspirationResult> {
        const res = await api<{ data: InspirationResult }>(
            `/api/workspaces/${workspaceId}/url-inspiration/preview`,
            {
                method: "POST",
                body: JSON.stringify({ url }),
            },
        );
        return ((res as any).data ?? res) as InspirationResult;
    },
};
```

- [ ] **Step 2: Create the chips component**

```tsx
import { useEffect, useState, useMemo } from "react";
import { Loader2, Check, AlertCircle, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { urlInspirationApi, type InspirationResult } from "../../services/url-inspiration.service";

interface Props {
    workspaceId: string;
    prompt: string;
}

const URL_REGEX = /https?:\/\/[^\s<>"]+/g;

export function UrlInspirationChips({ workspaceId, prompt }: Props) {
    const [inspirations, setInspirations] = useState<Map<string, InspirationResult & { loading: boolean }>>(new Map());
    const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

    // Extract unique URLs from prompt
    const urls = useMemo(() => {
        const matches = prompt.match(URL_REGEX) ?? [];
        return Array.from(new Set(matches)).slice(0, 5);
    }, [prompt]);

    // Debounce fetch — when urls change, fetch any new ones
    useEffect(() => {
        const timer = setTimeout(() => {
            for (const url of urls) {
                if (!inspirations.has(url)) {
                    setInspirations((prev) => new Map(prev).set(url, {
                        url,
                        kind: "website",
                        summary: null,
                        status: "scraped",
                        loading: true,
                    }));
                    urlInspirationApi
                        .preview(workspaceId, url)
                        .then((result) => {
                            setInspirations((prev) => new Map(prev).set(url, { ...result, loading: false }));
                        })
                        .catch(() => {
                            setInspirations((prev) => new Map(prev).set(url, {
                                url,
                                kind: "website",
                                summary: null,
                                status: "failed",
                                loading: false,
                                error: "Preview failed",
                            }));
                        });
                }
            }
            // Drop inspirations for URLs no longer in the prompt
            setInspirations((prev) => {
                const next = new Map(prev);
                for (const key of next.keys()) {
                    if (!urls.includes(key)) next.delete(key);
                }
                return next;
            });
        }, 800);
        return () => clearTimeout(timer);
    }, [urls, workspaceId]);

    if (urls.length === 0) return null;

    return (
        <div className="mt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
                {urls.map((url) => {
                    const insp = inspirations.get(url);
                    let hostname = "link";
                    try { hostname = new URL(url).hostname.replace(/^www\./, ""); } catch {}
                    const icon = insp?.loading ? (
                        <Loader2 size={11} className="animate-spin text-gray-400" />
                    ) : insp?.status === "failed" ? (
                        <AlertCircle size={11} className="text-red-500" />
                    ) : insp?.summary ? (
                        <Check size={11} className="text-green-500" />
                    ) : (
                        <Globe size={11} className="text-gray-400" />
                    );
                    const isExpanded = expandedUrl === url;
                    return (
                        <button
                            key={url}
                            type="button"
                            onClick={() => insp?.summary && setExpandedUrl(isExpanded ? null : url)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md hover:border-indigo-300 transition-colors max-w-[220px]"
                            title={insp?.summary?.angle ?? url}
                        >
                            {icon}
                            <span className="truncate text-gray-600">{hostname}</span>
                            {insp?.summary && (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
                        </button>
                    );
                })}
            </div>
            {expandedUrl && inspirations.get(expandedUrl)?.summary && (
                <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg text-[11px] space-y-1.5">
                    <p className="font-semibold text-indigo-700 truncate">{expandedUrl}</p>
                    <p><span className="font-medium text-gray-700">Angle:</span> <span className="text-gray-600">{inspirations.get(expandedUrl)!.summary!.angle}</span></p>
                    <p><span className="font-medium text-gray-700">Tone:</span> <span className="text-gray-600">{inspirations.get(expandedUrl)!.summary!.tone}</span></p>
                    <p><span className="font-medium text-gray-700">Format:</span> <span className="text-gray-600">{inspirations.get(expandedUrl)!.summary!.format}</span></p>
                    <div>
                        <span className="font-medium text-gray-700">Key points:</span>
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                            {inspirations.get(expandedUrl)!.summary!.keyPoints.map((p, i) => (
                                <li key={i} className="text-gray-600">{p}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/url-inspiration.service.ts frontend/src/components/url-inspiration/UrlInspirationChips.tsx
git commit -m "feat: add URL inspiration chips component with live preview"
```

---

### Task 11: Mount chips in TopicsPage and GeneratePage

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add to TopicsPage**

Add the import:
```typescript
import { UrlInspirationChips } from "../components/url-inspiration/UrlInspirationChips";
```

Below the Additional Direction textarea (find the closing `</textarea>` in the Additional Direction section), add:

```tsx
{activeWorkspace && (
    <UrlInspirationChips workspaceId={activeWorkspace.id} prompt={topicPrompt} />
)}
```

- [ ] **Step 2: Add to GeneratePage**

Same import, and mount below the custom prompt textarea:

```tsx
{activeWorkspace && (
    <UrlInspirationChips workspaceId={activeWorkspace.id} prompt={customPrompt} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx frontend/src/pages/GeneratePage.tsx
git commit -m "feat: mount UrlInspirationChips below Additional Direction textareas"
```

---

### Task 12: Remove the old url-prompt-scraper

**Files:**
- Delete: `backend/src/utils/url-prompt-scraper.ts`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -r "url-prompt-scraper" backend/src`
Expected: no output (or only the file itself)

- [ ] **Step 2: Delete the file**

```bash
rm backend/src/utils/url-prompt-scraper.ts
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old url-prompt-scraper helper replaced by UrlInspirationService"
```

---

### Task 13: Verification

- [ ] **Step 1: Backend type check**

Run: `cd backend && bunx tsc --noEmit`
Expected: no errors in the new/modified files (pre-existing errors elsewhere are acceptable)

- [ ] **Step 2: Backend tests**

Run: `cd backend && bun test`
Expected: all tests pass

- [ ] **Step 3: Frontend build**

Run: `cd frontend && bun run build`
Expected: build succeeds

- [ ] **Step 4: Biome format**

Run: `cd backend && bunx biome check --write .`
Expected: formatted

- [ ] **Step 5: Final commit if formatting**

```bash
git add -A
git commit -m "chore: format with biome"
```
