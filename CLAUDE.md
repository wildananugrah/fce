# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FCE (Framework Content Engine) is a full-stack SaaS dashboard for AI-powered content generation and marketing campaign management. Teams can manage brands/products with versioned "brain" configurations and generate social media content via AI providers (Anthropic Claude, Google Gemini).

## Tech Stack

- **Backend:** TypeScript, Bun runtime, Hono framework, Prisma 7 ORM, pg-boss job queue
- **Frontend:** TypeScript, React 19, Vite 8, Tailwind CSS 4, React Router 7
- **Database:** PostgreSQL (port 5433), MinIO (S3-compatible object storage)
- **Observability:** Winston + Loki, Prometheus, Grafana, Jaeger, OpenTelemetry Collector

## Common Commands

### Backend (`cd backend`)
```bash
bun run --hot src/index.ts        # Dev server with hot reload (port 3001)
bun test                          # Run all unit tests (Bun test runner)
bun test tests/auth.test.ts       # Run a single test file
bunx biome check --write .        # Format + lint (Biome)
bunx tsc --noEmit                 # Type check only
bunx prisma db push               # Sync schema to database
bunx prisma db seed               # Seed database
bunx prisma studio                # Open Prisma Studio UI
```

### Frontend (`cd frontend`)
```bash
npm run dev                       # Vite dev server (port 5173)
npm run build                     # TypeScript check + production build
npm run lint                      # ESLint
npm run typecheck                 # tsc --noEmit
```

### Infrastructure
```bash
docker-compose up -d              # Start PostgreSQL + MinIO
cd monitoring && make up          # Start observability stack (Grafana, Loki, Prometheus, Jaeger)
```

## Architecture

### Backend Layered Architecture

```
Routes → Services → Repositories → Prisma → PostgreSQL
                  → Jobs (pg-boss) → AI Providers
```

- **Composition root** in `backend/src/index.ts` — all dependencies are wired via constructor injection (no service locators)
- **Routes** (`src/routes/`) handle HTTP, delegate to services
- **Services** (`src/services/`) contain business logic, are framework-agnostic
- **Repositories** (`src/repositories/`) abstract Prisma data access behind interfaces (`src/interfaces/`)
- **Jobs** (`src/jobs/`) handle async AI generation via pg-boss queue workers
- **Providers** (`src/providers/`) wrap external services (Anthropic, Gemini, Winston logger)
- **Middlewares** (`src/middlewares/`) — auth (JWT), workspace scoping, error handler, request logger

### Workspace Multi-Tenancy

All workspace-scoped routes live under `/api/workspaces/:workspaceId/*`. The workspace middleware verifies user membership and injects `workspaceId` into the Hono context. Roles: admin, editor, viewer.

### AI Generation Pipeline

Frontend form → `GenerationService` enqueues pg-boss job → Worker calls AI provider → Results saved to `GenerationOutput` → SSE pushes notification to frontend via `NotificationService`.

Same pattern applies to campaigns, topics, and brand scraping jobs.

### Brand/Product Brain Versions

Brands and products have versioned "brain" configurations (personality, tone, audience, messaging rules). Each entity tracks an `activeBrainVersionId` for rollback support.

### URL Scraping Strategies

Different features use different URL fetch strategies depending on their latency tolerance and content requirements:

**Brand/Product brain auto-fill** (`scrape-preview` routes) — **Jina Reader only**
- Primary: [Jina Reader](https://jina.ai/reader/) at `https://r.jina.ai/<url>` returns clean markdown for most websites (1–3s, free tier)
- Fallback: direct `fetch()` + HTML stripping if Jina is unavailable
- **Does NOT use Apify** — brand brain auto-fill is a synchronous UI action where users wait on a spinner, so the 30–90s Apify run is too slow
- Implementation: `backend/src/utils/url-fetcher.ts` (`fetchUrlContent`, `fetchMultipleUrls`)

**URL inspiration** (Additional Direction field in topic/content generation) — **Apify + cache**
- Primary: Apify actor routed by hostname (Instagram, TikTok, Facebook, website-content-crawler)
- Fallback: plain `fetch()` + HTML stripping if Apify is unavailable
- Results cached 24h in `url_scrape_cache` table keyed by SHA-256 URL hash
- Async-tolerant — runs inside a pg-boss generation job where users already expect a wait
- Implementation: `backend/src/services/url-inspiration.service.ts`

**Reference link uploads** (Brand/Product references tab) — **pg-boss background job**
- User adds a link → stored as `BrandDocument` → background job scrapes page, stores chunks
- Uses direct `fetch()` with Cloudflare-friendly User-Agent, falls back to storing the URL as a single chunk if scraping fails
- Implementation: `backend/src/jobs/link-scraping.job.ts`

### AI Activity Logging

Every AI provider call (content, topic, campaign, brand scraping, product scraping, product brain, URL inspiration) is logged to the `ai_provider_logs` table via `logAiActivity()` (`backend/src/utils/ai-activity-logger.ts`). Each log row captures: workspace, user, generator type, provider, model, system/user prompt, response, input/output tokens, duration, estimated cost, and status. Used for token usage tracking (profile/workspace settings pages) and dispute resolution.

### Frontend Structure

- **Pages** (`src/pages/`) — 12 pages (Dashboard, Brands, Products, Generate, Campaigns, Topics, Library, etc.)
- **Contexts** (`src/contexts/`) — `AuthContext` (JWT + refresh), `WorkspaceContext` (active workspace)
- **Hooks** (`src/hooks/`) — `useAuth`, `useWorkspace`, `useSSE` for real-time job notifications
- **Services** (`src/services/`) — API client with automatic token refresh

## Code Style

- **Backend formatting:** Biome — tabs, 100 char line width, organized imports
- **Frontend formatting:** ESLint with React hooks + React Refresh rules
- **TypeScript:** Strict mode, interfaces in `src/interfaces/`, domain types in `src/types/`
- **Testing:** Mock repositories with in-memory data stores for service-level unit tests (no DB, no HTTP)

## Environment

Copy `.env.example` to `.env`. Key variables: `DATABASE_URL`, `AI_PROVIDER` (anthropic/gemini), `ANTHROPIC_API_KEY`/`GEMINI_API_KEY`. Per-task AI provider overrides available via `AI_CONTENT_PROVIDER`, `AI_CAMPAIGN_PROVIDER`, `AI_TOPIC_PROVIDER`, `AI_BRAND_SCRAPER_PROVIDER`.
