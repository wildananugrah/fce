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
- **Middlewares** (`src/middlewares/`) — auth (JWT + `isSuperadmin` claim), workspace scoping, RBAC guards (`rbac.middleware.ts`), error handler, request logger

### Workspace Multi-Tenancy + Project RBAC

Workspace-scoped routes live under `/api/workspaces/:workspaceId/*`. The workspace middleware verifies user membership and injects `workspaceId` + `workspaceRole` into the Hono context.

Three-tier RBAC (`backend/src/constants/roles.ts` is the single source of truth):
- **SUPERADMIN** — global. `User.isSuperadmin = true`. Manages workspaces, projects, and users. Claim is carried in the JWT.
- **ADMIN** — workspace-scoped. `UserWorkspaceRole.role = "admin"`. Manages projects + invites + workspace settings within one workspace.
- **MEMBER** — project-scoped. Rows in `UserProjectMembership(userId, projectId)` with `isApprover: boolean` and `menuAccess: MenuKey[]`. A member only sees menus they've been granted and can only change topic/content status if `isApprover = true`.

Guard factories in `src/middlewares/rbac.middleware.ts`: `createProjectMiddleware`, `requireMenu(key)`, `requireApprover(prisma)`, `requireWorkspaceAdmin()`, `requireSuperadmin()`. Admins and superadmins bypass the menu + approver checks.

**Project model** (new): `Workspace → Project → Brand → Product → …`. `Brand.projectId` was added as nullable so existing rows are backfilled by a one-shot migration into a per-workspace "Default" project (`scripts/migrate-rbac.ts`). Every workspace has at least the Default project; it can't be archived.

### Email Verification

Standard signups stay pending until the user clicks a verification link. `User.emailVerifiedAt = null` blocks login; `AuthService.login` throws `EmailNotVerifiedError` which the route converts to a 403 with `{ verificationRequired: true, email }`.

Invitation-based signups skip verification — accepting the workspace invitation already proves address ownership, so the user is auto-verified and logged in immediately.

Tokens live in `EmailVerificationToken` (opaque, single-use, TTL configurable via `EMAIL_VERIFICATION_TOKEN_EXPIRY`, default `24h`). `verifyEmail` is idempotent — re-hitting an already-consumed token for a verified user succeeds, so StrictMode double-effects and email scanners don't burn the link. Existing users were grandfathered as verified via `scripts/migrate-email-verification.ts`.

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

### Per-Workspace AI Provider Resolution

AI provider keys and model choices live on `WorkspaceSetting` (per-workspace) rather than solely in `.env`. `AiProviderFactory` (`src/services/ai-provider-factory.service.ts`) resolves each field with this precedence: **workspace value → env default → built-in default**. Fresh provider instances are constructed per call (cheap, avoids races on `lastUsage`). Resolved settings are cached per workspace; the `PUT /api/workspaces/:id/ai-settings` endpoint calls `factory.invalidate(workspaceId)` so changes take effect without a backend restart.

`.env` keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `AI_PROVIDER`, per-generator overrides) remain as the fallback for workspaces that haven't configured their own — keeps self-host / dev environments working with a single shared key.

### AI Activity Logging

Every AI provider call (content, topic, campaign, brand scraping, product scraping, product brain, URL inspiration) is logged to the `ai_provider_logs` table via `logAiActivity()` (`backend/src/utils/ai-activity-logger.ts`). Each log row captures: workspace, user, generator type, provider, model, system/user prompt, response, input/output tokens, duration, estimated cost, and status. Used for token usage tracking (profile/workspace settings pages) and dispute resolution.

### Frontend Structure

- **Pages** (`src/pages/`) — Dashboard, Brands, Products, Generate, Campaigns, Topics, Library, Admin, Workspace Settings, plus auth pages (`LoginPage`, `SignupPage`, `VerifyPage`, `AcceptInvitationPage`).
- **Contexts** (`src/contexts/`) — `AuthContext` (JWT + refresh, carries `isSuperadmin`), `WorkspaceContext` (active workspace + role), `ProjectContext` (active project + effective `menuAccess` + `isApprover` with admin bypass).
- **Hooks** (`src/hooks/`) — `useAuth`, `useWorkspace`, `useProject`, `useSSE` for real-time job notifications, `useAvailableSkills` (cached skill list for chat @mentions).
- **Services** (`src/services/`) — API client with automatic token refresh. Throws `ApiError` with the HTTP status + parsed body so callers can inspect fields like `verificationRequired`.
- **Sidebar** (`components/layout/AppShell.tsx`) — filters nav items by `menuAccess` for non-admins; hides Workspace Settings + Admin links when the user lacks those roles.

## Code Style

- **Backend formatting:** Biome — tabs, 100 char line width, organized imports
- **Frontend formatting:** ESLint with React hooks + React Refresh rules
- **TypeScript:** Strict mode, interfaces in `src/interfaces/`, domain types in `src/types/`
- **Testing:** Mock repositories with in-memory data stores for service-level unit tests (no DB, no HTTP)

## Environment

Copy `.env.example` to `.env`. Key variables:

- `DATABASE_URL` — Postgres connection string.
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY`.
- `EMAIL_VERIFICATION_TOKEN_EXPIRY` — default `24h`. Parseable as `"30s"`, `"5m"`, `"2h"`, `"7d"`.
- `RESEND_API_KEY` + `EMAIL_FROM` — if unset, emails are logged to stdout (dev only).
- `APP_URL` — used to build verification + invitation links.
- **AI defaults (fallbacks only)**: `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`. Per-task overrides: `AI_CONTENT_PROVIDER`, `AI_CAMPAIGN_PROVIDER`, `AI_TOPIC_PROVIDER`, `AI_BRAND_SCRAPER_PROVIDER`, `AI_CHAT_PROVIDER`. Workspaces can override any of these from Workspace Settings → Integrations → AI Providers; env values kick in only when a workspace hasn't configured its own.

## One-shot migrations and CLI scripts

After pulling a schema change, run in order:

```bash
cd backend
bunx prisma db push                                  # sync schema
bun run scripts/migrate-rbac.ts                      # default project + memberships
bun run scripts/migrate-email-verification.ts        # grandfather existing users
```

User management (full reference in [docs/database-access.md](docs/database-access.md)):

```bash
bun run scripts/create-user.ts <email> <password> [fullName] [--superadmin]
bun run scripts/reset-password.ts <email> <new-password>   # or --random
bun run scripts/seed-superadmin.ts <email>                 # or --revoke
bun run scripts/fix-workspace-admin.ts <email> <workspace> # grant workspace admin
```

Or via the cheatsheet wrapper: `bash docs/db-cheatsheet.sh` (no args for help).
