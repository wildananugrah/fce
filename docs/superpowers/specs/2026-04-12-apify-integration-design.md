# Apify Integration Design

**Date:** 2026-04-12
**Status:** Draft
**Approach:** Apify as a New Provider (Approach A)

---

## Overview

Integrate Apify web scraping platform into FCE to provide enhanced brand scraping, competitor social intelligence, and content research capabilities. Apify runs as a new provider following the existing DI pattern, with a dedicated "Research" hub in the frontend.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| UX approach | Hybrid — brand scraping enhanced silently, new Research hub for competitor/trend features | Brand scraping already has UX; new workflows need their own space |
| Research → Generation flow | "Use as Inspiration" button | Keeps user in control of what context influences content |
| API key management | Workspace-level Apify API key | Each workspace owns their Apify costs; most scalable |
| Actor support | Extensible architecture with 6 curated defaults | Generic runner + per-actor parsers; adding actors is config-only |
| Progress UX | Status list with background runs + SSE notifications | Supports multiple concurrent scrapes; consistent with existing SSE pattern |

## Database Schema

### WorkspaceSetting

Stores per-workspace integration credentials. Apify API key encrypted at rest.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| workspaceId | UUID | FK → Workspace, unique |
| apifyApiKey | String? | Encrypted, nullable |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### ResearchRun

Tracks each Apify Actor execution.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| workspaceId | UUID | FK → Workspace |
| userId | UUID | FK → User (who triggered) |
| brandId | UUID? | FK → Brand (optional link) |
| actorType | Enum | `website_crawler`, `instagram`, `tiktok`, `facebook`, `google_trends`, `google_search` |
| actorId | String | Apify Actor ID (e.g., `apify/website-content-crawler`) |
| input | JSON | Input config sent to Apify |
| apifyRunId | String? | Apify's run ID for status tracking |
| status | Enum | `pending`, `running`, `completed`, `failed` |
| errorMessage | String? | Error details on failure |
| resultCount | Int | Number of items scraped (default 0) |
| startedAt | DateTime? | When Apify run started |
| completedAt | DateTime? | When Apify run finished |
| createdAt | DateTime | |

### ResearchResult

Individual scraped items from a run.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| runId | UUID | FK → ResearchRun |
| workspaceId | UUID | FK → Workspace |
| dataType | Enum | `page_content`, `social_post`, `trend`, `search_result` |
| title | String? | Content title |
| url | String? | Source URL |
| content | Text | Main scraped text/body |
| metadata | JSON | Platform-specific: likes, comments, hashtags, engagement, etc. |
| scrapedAt | DateTime | When the item was originally posted/published |
| createdAt | DateTime | |

### Relationships

```
Workspace 1──N ResearchRun 1──N ResearchResult
Brand 1──N ResearchRun (optional)
User 1──N ResearchRun
```

## Backend Architecture

### ApifyProvider (`backend/src/providers/apify.provider.ts`)

Wraps the official `apify-client` SDK. Stateless — API key passed per-call for multi-tenant support.

**Interface** (`backend/src/interfaces/providers/apify.interface.ts`):

```typescript
interface IApifyProvider {
  runActor(actorId: string, input: Record<string, any>, apiKey: string): Promise<{ runId: string }>;
  getRunStatus(runId: string, apiKey: string): Promise<ApifyRunStatus>;
  getRunResults(runId: string, apiKey: string): Promise<ApifyResultItem[]>;
}

interface ApifyRunStatus {
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTING" | "ABORTED" | "TIMED-OUT";
  startedAt?: string;
  finishedAt?: string;
}

interface ApifyResultItem {
  [key: string]: any; // Raw Apify dataset item — actor-specific shape
}
```

### Actor Result Parsers (`backend/src/providers/apify-parsers/`)

Each actor type gets a dedicated parser that normalizes raw Apify output into `ResearchResult` shape.

```typescript
interface IActorResultParser {
  parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
}

interface ParsedResearchResult {
  dataType: "page_content" | "social_post" | "trend" | "search_result";
  title?: string;
  url?: string;
  content: string;
  metadata: Record<string, any>;
  scrapedAt: Date;
}
```

**Parsers:**
- `website-crawler.parser.ts` — extracts title, text content, metadata from crawled pages
- `instagram.parser.ts` — extracts post text, hashtags, likes, comments, image URLs
- `tiktok.parser.ts` — extracts description, likes, shares, views, sounds
- `facebook.parser.ts` — extracts post text, reactions, comments, shares
- `google-trends.parser.ts` — extracts trending queries, interest over time
- `google-search.parser.ts` — extracts SERP titles, snippets, URLs, positions

### Actor Registry (`backend/src/config/apify-actors.ts`)

Central config mapping actor types to Apify Actor IDs and their parsers:

```typescript
const APIFY_ACTORS = {
  website_crawler: { actorId: "apify/website-content-crawler", parser: WebsiteCrawlerParser },
  instagram:       { actorId: "apify/instagram-scraper",       parser: InstagramParser },
  tiktok:          { actorId: "...",                           parser: TikTokParser },
  facebook:        { actorId: "...",                           parser: FacebookParser },
  google_trends:   { actorId: "...",                           parser: GoogleTrendsParser },
  google_search:   { actorId: "...",                           parser: GoogleSearchParser },
}
```

Adding a new actor = new parser file + new entry in this config. No other code changes needed.

### ResearchRunJob (`backend/src/jobs/research-run.job.ts`)

Follows existing pg-boss job pattern.

**Flow:**
1. Receives `{ researchRunId }` from pg-boss queue `"research-run"`
2. Loads `ResearchRun` record + workspace's Apify API key from `WorkspaceSetting`
3. Resolves actor config from `APIFY_ACTORS` registry
4. Calls `apifyProvider.runActor(actorId, input, apiKey)`
5. Stores `apifyRunId` on the `ResearchRun` record, sets status to `running`
6. Polls `apifyProvider.getRunStatus()` with exponential backoff (1s, 2s, 4s, 8s... max 30s intervals, timeout ~5 min)
7. On completion: fetches results via `apifyProvider.getRunResults()`
8. Parses results through the actor-specific parser
9. Bulk-inserts `ResearchResult` records
10. Updates `ResearchRun`: status → `completed`, sets `resultCount`, `completedAt`
11. Sends SSE: `research_run_complete` with `{ runId, resultCount }`
12. On failure: updates status → `failed`, sets `errorMessage`, sends SSE: `research_run_failed`

### ResearchService (`backend/src/services/research.service.ts`)

Business logic layer:
- `createRun(workspaceId, userId, input)` — validates input, checks Apify key exists, creates `ResearchRun`, enqueues pg-boss job, returns run
- `listRuns(workspaceId, filters?)` — paginated list with optional filters (actorType, status, brandId)
- `getRun(runId)` — single run detail
- `getRunResults(runId, pagination)` — paginated results for a run
- `getResult(resultId)` — single result detail
- `getResultAsContext(resultId)` — formats result into a context string for content generation

### Research Routes (`backend/src/routes/research.route.ts`)

Under `/api/workspaces/:workspaceId/research`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runs` | Start a new research run |
| GET | `/runs` | List runs (filterable by actorType, status, brandId) |
| GET | `/runs/:runId` | Run detail |
| GET | `/runs/:runId/results` | Paginated results for a run |
| GET | `/runs/:runId/results/:resultId` | Single result detail |
| GET | `/runs/:runId/results/:resultId/as-context` | Result formatted as generation context |

### Workspace Settings Routes

Add to existing workspace routes or new settings route:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/settings` | Get workspace settings (masked API key) |
| PUT | `/settings/apify` | Set/update Apify API key |
| POST | `/settings/apify/test` | Test Apify API key validity |
| DELETE | `/settings/apify` | Remove Apify API key |

### Enhanced Brand Scraping

Modify existing `brand-scraping.job.ts` to add an Apify pre-step:

1. Check if workspace has an Apify API key in `WorkspaceSetting`
2. If yes: run `website_crawler` actor on the brand URL first, extract clean text content
3. Pass the extracted content (not just URL) to the AI brand scraper as enriched input
4. If no Apify key: fall back to current behavior (AI scrapes URL directly)

This is a transparent quality upgrade — no UX change, just better data for the AI to analyze.

### SSE Events

Two new event types:
- `research_run_complete` — payload: `{ runId, actorType, resultCount }`
- `research_run_failed` — payload: `{ runId, actorType, errorMessage }`

## Frontend Architecture

### Workspace Settings — Integrations Section

Add to existing workspace settings page (admin-only):
- **"Integrations"** section with Apify API key management
- Masked text input with show/hide toggle
- "Test Connection" button → calls `POST /settings/apify/test`
- Success: green checkmark + "Connected to Apify"
- Failure: red error message
- Save / Remove buttons

### Research Hub Page (`/research`)

New top-level sidebar menu item. Two sections:

**Launch Panel (top):**
- 6 actor cards in a responsive grid (2-3 columns)
- Each card: icon, title, one-line description
- Click → opens modal with actor-specific input form
- All forms include optional "Link to Brand" dropdown
- "Run Research" button submits and closes modal

**Actor Input Forms:**

| Actor | Inputs |
|-------|--------|
| Website Crawler | URL, max pages (default 10) |
| Instagram | Username or profile URL, max posts (default 50) |
| TikTok | Username or profile URL, max videos (default 50) |
| Facebook | Page URL, max posts (default 50) |
| Google Trends | Keywords (comma-separated), geo region dropdown |
| Google Search | Search query, max results (default 30) |

**Recent Runs (bottom):**
- Table with columns: Type (icon), Input summary, Brand, Status badge, Results count, User, Date
- Status badges: pending (gray), running (blue pulse), completed (green), failed (red)
- Click row → navigates to run detail
- Filters: actor type dropdown, status dropdown, brand dropdown

### Run Detail Page (`/research/:runId`)

- Header: run metadata (actor type, input, status, duration, result count)
- Results list/grid below:
  - Each card: title, content preview (first ~200 chars), source URL, platform metrics
  - Platform metrics vary by dataType (likes/comments for social, position/snippet for search, etc.)
  - **"Use as Inspiration" button** on each card
  - Click → navigates to `/generate?researchResultId=<id>`

### Generate Page Enhancement

When URL contains `researchResultId` query param:
- Fetch the research result via API
- Show dismissible info banner: "Using research as inspiration: [result title/preview]"
- Include result content as `researchContext` field in generation request
- User proceeds with normal generation flow (select brand, product, platform, etc.)
- Dismiss button removes the research context

### Empty State (No Apify Key)

Research page shows:
- Illustration + "Connect Apify to start researching"
- "Apify lets you scrape competitor social media, discover trends, and extract website content."
- "Set up Apify" button → links to workspace settings integrations section

### Frontend File Structure

```
frontend/src/pages/Research/
├── ResearchPage.tsx         — hub page with launch panel + recent runs
├── ResearchRunDetail.tsx    — run detail with results list
├── LaunchPanel.tsx          — actor card grid
├── RunList.tsx              — recent runs table with filters
└── RunFormModal.tsx         — dynamic form modal per actor type

frontend/src/services/
└── research.service.ts      — API client for research endpoints
```

## Dependency Wiring

### Composition Root Changes (`backend/src/index.ts`)

```
1. const apifyProvider = new ApifyProvider();
2. const researchRepository = new ResearchRepository(prisma);
3. const researchService = new ResearchService(researchRepository, apifyProvider, boss, logger);
4. const researchRunJob = new ResearchRunJob(prisma, apifyProvider, notificationService, logger);
5. await boss.createQueue("research-run");
6. boss.work("research-run", async (jobs) => { ... researchRunJob.handle(job.data) });
7. Mount researchRoute on workspace-scoped router
8. Pass apifyProvider to BrandScrapingJob constructor
```

### New Dependency

- `apify-client` — official Apify JavaScript SDK

### Environment Variables

- `APIFY_DEFAULT_API_KEY` (optional) — fallback for dev/testing if workspace has no key configured

## Content Generation Integration

The `ContentGenerationInput` interface gets a new optional field:

```typescript
interface ContentGenerationInput {
  // ... existing fields ...
  researchContext?: string; // Formatted research result content
}
```

The content generation prompt builder includes `researchContext` as an additional section when present:
- "The user wants you to use the following research as inspiration for the content:"
- Followed by the formatted research result

This is additive — no changes to existing generation behavior when `researchContext` is absent.

## Testing Strategy

- **Unit tests** for each result parser (given raw Apify output → expected parsed results)
- **Unit tests** for ResearchService (mock repository + mock Apify provider)
- **Unit tests** for ResearchRunJob flow (mock provider, verify status transitions + SSE notifications)
- **Integration test** for the enhanced brand scraping pre-step
- Follow existing mock repository pattern (in-memory data stores, no DB, no HTTP)

## Out of Scope (Future)

- Quota/rate limiting per workspace
- Scheduled/recurring research runs
- Custom actor support (user-provided Actor IDs)
- Research result search/filtering within results
- Bulk "Use as Inspiration" (multiple results at once)
- Research analytics/dashboards
