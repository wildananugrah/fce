# Apify URL Inspiration — Design Spec

**Date:** 2026-04-15

## Overview

Replace the naive `fetch()`-based URL scraper with a smart, platform-aware URL inspiration pipeline:

1. **Detect URL type** from hostname (Instagram, TikTok, Facebook, website)
2. **Route to Apify** — use the existing research actors to get rich, platform-specific data that plain `fetch()` can't access (JS-rendered pages, authenticated scrapers, engagement metrics)
3. **Summarize with Gemini** — convert raw scraped data into a structured "inspiration summary" with content angle, tone, key claims, and format clues
4. **Cache aggressively** — store raw scrapes and AI summaries in a new table keyed by URL hash, valid 24h
5. **Inject into topic/content generation** — tell the AI to use the reference as direct inspiration, with the instruction "at least half the topics should clearly reflect the reference content"
6. **UI feedback** — URL chips appear below the Additional Direction textarea as the user types, showing scraping status and summary preview

## Goals

- Users paste any URL (Instagram post, TikTok video, blog article) and get **real topic ideas inspired by it**, not just raw extra text
- Platform-specific data (Instagram captions, hashtags, engagement counts) feeds the AI's creative direction
- Snappy UX — users see scraping progress while they work, no generation blocked for minutes
- Cost-efficient — cache prevents re-scraping the same URL

## Non-Goals

- User-facing Apify actor configuration (uses the existing workspace Apify key)
- Multi-page crawling (single URL per reference, one-shot)
- Video/image transcription (uses captions only, not audio/OCR)
- Historical persistence of inspiration summaries (cache expires in 24h)

---

## 1. URL Routing

**New util:** `backend/src/utils/url-router.ts`

```typescript
export type UrlKind =
  | { type: "instagram"; url: string; postCode?: string; username?: string }
  | { type: "tiktok"; url: string; videoId?: string; username?: string }
  | { type: "facebook"; url: string }
  | { type: "youtube"; url: string; videoId?: string }
  | { type: "website"; url: string };

export function detectUrlKind(url: string): UrlKind;
```

Routing rules:
- `instagram.com`, `instagr.am` → instagram
- `tiktok.com`, `vm.tiktok.com` → tiktok
- `facebook.com`, `fb.com` → facebook
- `youtube.com`, `youtu.be` → youtube
- Everything else → website

YouTube is routed to the website crawler since there's no existing YouTube actor wired up — the video page has title/description/comments visible to a standard crawler.

---

## 2. Apify Actor Inputs

Each URL kind maps to an Apify actor and specific input shape. **New util:** `backend/src/utils/apify-actor-inputs.ts`

```typescript
export function buildActorInput(kind: UrlKind): { actorId: string; input: any };
```

- **instagram**: `apify/instagram-scraper` with `{ directUrls: [url], resultsLimit: 1 }`
- **tiktok**: `clockworks/free-tiktok-scraper` with `{ postURLs: [url], resultsPerPage: 1 }`
- **facebook**: `apify/facebook-posts-scraper` with `{ startUrls: [{ url }], maxPosts: 1 }`
- **website** / **youtube**: `apify/website-content-crawler` with `{ startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0 }`

---

## 3. Cache Table

**New Prisma model:** `UrlScrapeCache`

```prisma
model UrlScrapeCache {
  id          String   @id @default(uuid())
  urlHash     String   @unique @map("url_hash")
  url         String   @db.Text
  kind        String
  rawData     Json     @map("raw_data")
  summary     String?  @db.Text
  scrapedAt   DateTime @default(now()) @map("scraped_at")
  expiresAt   DateTime @map("expires_at")
  createdAt   DateTime @default(now()) @map("created_at")

  @@index([expiresAt])
  @@map("url_scrape_cache")
}
```

- `urlHash`: SHA-256 hex of the normalized URL (lowercase, no trailing slash)
- `expiresAt`: `scrapedAt + 24 hours`
- Rows past `expiresAt` are ignored and can be cleaned up by a periodic job later (not in scope)

---

## 4. Inspiration Summary

After scraping, the raw Apify result is passed to Gemini to produce a structured summary.

**Summary schema (JSON):**

```typescript
interface InspirationSummary {
  angle: string;        // "Educational tutorial on skincare routine"
  tone: string;         // "Friendly, confident, conversational"
  keyPoints: string[];  // ["Morning routine matters most", "Use SPF daily", ...]
  format: string;       // "Carousel with numbered steps" or "Short-form video"
  hashtags?: string[];  // From the scraped data if available
  engagementSignal?: string; // "High engagement post (50k+ likes)" — only if metrics support it
}
```

**Summarizer prompt:**

```
You are a content strategist. Analyze the following social media post / article
and extract its creative essence so another creator can generate similar ideas.

SOURCE DATA:
{rawJson}

Return JSON with these fields (no markdown, no explanation):
- angle (string): What is this post about? What's the hook?
- tone (string): Tone and style (e.g., "Educational, warm, confident")
- keyPoints (array of strings): 2-5 core claims or messages from the post
- format (string): Format clues — carousel, reel, article, etc.
- hashtags (array of strings): Top hashtags used (if any)
- engagementSignal (string, optional): Only include if engagement metrics
  suggest this was a standout post (e.g., "High engagement: 50k+ likes")
```

**Summarizer call uses the existing `GeminiProvider`** — no new config, no new API key. A new method is added:

```typescript
// On GeminiProvider (implements a new IInspirationSummarizer interface)
async summarizeInspiration(rawData: any): Promise<InspirationSummary>
```

---

## 5. UrlInspirationService

Orchestrates the full pipeline. **New service:** `backend/src/services/url-inspiration.service.ts`

```typescript
interface IUrlInspirationService {
  // Main entry point. Checks cache → scrapes via Apify → summarizes → caches.
  getInspiration(
    workspaceId: string,
    url: string,
  ): Promise<{
    url: string;
    kind: UrlKind["type"];
    summary: InspirationSummary | null;
    status: "cached" | "scraped" | "failed";
    error?: string;
  }>;

  // Extract URLs from a free-text prompt and get inspiration for each.
  getInspirationsFromPrompt(
    workspaceId: string,
    prompt: string,
  ): Promise<Array<{ url: string; summary: InspirationSummary | null; status: string }>>;
}
```

Internal flow for each URL:
1. Compute `urlHash` from normalized URL
2. Look up cache — if a row exists with `expiresAt > now`, return the cached summary
3. Detect URL kind
4. Fetch workspace Apify key via `ResearchService.getSettings(workspaceId)`
5. Build actor input, call `apifyProvider.runActor()` with `waitForFinish: 90`
6. If Apify times out or fails → fall back to plain `fetch()` scraper (`scrapeUrlsFromPrompt` logic)
7. Run parser for the actor type (reuse existing `APIFY_ACTORS[type].parser`)
8. Call `geminiProvider.summarizeInspiration(rawData)`
9. Write row to `UrlScrapeCache` with 24h expiry
10. Return the summary

Failures at any step return `{ status: "failed", error }` — the service never throws. Generation continues without the URL's contribution.

---

## 6. Topic/Content Generation Integration

Both `topic-generation.job.ts` and `content-generation.job.ts` currently call `scrapeUrlsFromPrompt()`. Replace with:

```typescript
const inspirations = await this.urlInspirationService.getInspirationsFromPrompt(
  workspaceId,
  prompt,
);
const successful = inspirations.filter((i) => i.summary);
if (successful.length > 0) {
  const block = successful
    .map((i) => {
      const s = i.summary!;
      return `Reference from ${i.url}:
- Angle: ${s.angle}
- Tone: ${s.tone}
- Key points: ${s.keyPoints.join("; ")}
- Format: ${s.format}${s.hashtags?.length ? `\n- Hashtags: ${s.hashtags.join(" ")}` : ""}${s.engagementSignal ? `\n- Engagement: ${s.engagementSignal}` : ""}`;
    })
    .join("\n\n---\n\n");
  enrichedPrompt = `${prompt ?? ""}\n\n=== REFERENCE INSPIRATION ===\n${block}`;
}
```

**New prompt builder instruction** (added to topic generation prompt when references are present):

> **IMPORTANT: Reference inspiration is provided above.** Use it as direct creative inspiration. Derive topic angles, themes, and claims from it. **At least half of the generated topics should clearly reflect the reference content** — not copy it, but build on its angle, tone, or themes for this brand.

---

## 7. Preview Endpoint

**New route:** `POST /api/workspaces/:id/url-inspiration/preview`

```
Body: { url: string }
Returns: { url, kind, summary, status, error? }
```

Called by the frontend as the user pastes URLs in the Additional Direction textarea (debounced). Delegates to `UrlInspirationService.getInspiration()`. Benefits from the 24h cache.

---

## 8. Frontend — URL Chips

Below the Additional Direction textarea on both TopicsPage and GeneratePage, show chips for each detected URL.

**Component:** `frontend/src/components/url-inspiration/UrlInspirationChips.tsx`

**Behavior:**
- `useEffect` on prompt text, debounced 800ms, extracts URLs via the same regex
- For each new URL not already in the local state, POSTs to the preview endpoint
- Shows a chip per URL with:
  - Favicon (via `https://www.google.com/s2/favicons?domain={hostname}`)
  - Hostname
  - Status icon: spinner (scraping) / checkmark (ready) / alert (failed)
- Hovering a ready chip shows a tooltip with the `angle` field
- Clicking a chip toggles an expanded card showing the full summary

**State:**
```typescript
Map<string, {
  url: string;
  kind: string;
  summary: InspirationSummary | null;
  status: "scraping" | "ready" | "failed";
}>
```

---

## 9. Files Map

### Backend
| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/prisma/schema.prisma` (modify) | Add `UrlScrapeCache` model |
| Create | `backend/src/utils/url-router.ts` | `detectUrlKind()` |
| Create | `backend/src/utils/apify-actor-inputs.ts` | `buildActorInput()` |
| Create | `backend/src/interfaces/providers/inspiration-summarizer.interface.ts` | `IInspirationSummarizer` |
| Modify | `backend/src/providers/gemini.provider.ts` | Implement `summarizeInspiration()` |
| Create | `backend/src/interfaces/services/url-inspiration.service.interface.ts` | Service interface |
| Create | `backend/src/services/url-inspiration.service.ts` | Orchestrator |
| Create | `backend/src/interfaces/repositories/url-scrape-cache.repository.interface.ts` | Repo interface |
| Create | `backend/src/repositories/url-scrape-cache.repository.ts` | Prisma queries |
| Create | `backend/src/routes/url-inspiration.route.ts` | `POST /preview` endpoint |
| Modify | `backend/src/index.ts` | Wire service, route, dependency injection |
| Modify | `backend/src/jobs/topic-generation.job.ts` | Replace `scrapeUrlsFromPrompt` with `urlInspirationService.getInspirationsFromPrompt` |
| Modify | `backend/src/jobs/content-generation.job.ts` | Same replacement |
| Modify | `backend/src/utils/prompt-builder.ts` | New "REFERENCE INSPIRATION" section + "at least half the topics" instruction when a reference block is detected in the prompt |

### Frontend
| Action | File | Purpose |
|--------|------|---------|
| Create | `frontend/src/services/url-inspiration.service.ts` | API client |
| Create | `frontend/src/components/url-inspiration/UrlInspirationChips.tsx` | Chip list with live scraping |
| Modify | `frontend/src/pages/TopicsPage.tsx` | Mount `<UrlInspirationChips />` below textarea |
| Modify | `frontend/src/pages/GeneratePage.tsx` | Same |

---

## 10. Behavior when Apify Key is Missing

If the workspace has no Apify API key configured:
- Instagram/TikTok/Facebook URLs → skip Apify, **fall back to plain `fetch()`** (current behavior — usually fails on these platforms, but at least the URL text is available)
- Website URLs → always use plain `fetch()` since Apify is overkill
- Log a warning once per request: *"No Apify key configured — social URLs will be extracted via plain fetch (may be blocked)"*

No hard error. The user gets degraded results but generation still works.

---

## 11. Cost & Performance

**Per unique URL (first time):**
- 1 Apify run: ~$0.001–$0.01 depending on actor
- 1 Gemini summary call: ~$0.0001 (Gemini 2.x Flash rates)
- Total: **~$0.002 per URL** on average

**Subsequent uses within 24h:** $0 (cache hit)

**Latency:**
- Apify sync run: 30–90 seconds (bounded by `waitForFinish: 90`)
- Summary: 1–3 seconds
- Total first-time: **~60 seconds typical**
- Cache hit: <50ms
- Generation proceeds even if inspirations fail, so worst case just degrades to current behavior

---

## 12. Testing

- Unit test `detectUrlKind()` with various URL shapes
- Unit test `UrlScrapeCacheRepository` (create, find by hash, expire)
- Unit test `UrlInspirationService.getInspirationsFromPrompt()` with a mock Apify provider and mock summarizer, asserting: cache hit → no Apify call, cache miss → Apify + summary + cache write, Apify failure → fallback path
- No E2E test for the live Apify path (that would hit real API quotas)
