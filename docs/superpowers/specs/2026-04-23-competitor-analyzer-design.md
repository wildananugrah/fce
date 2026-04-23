# Competitor Analyzer — Design

**Date:** 2026-04-23
**Status:** Approved (pending user review of this document)

## Overview

A new top-level feature — **Competitor Analyzer** — that lets a project team:

1. Maintain a roster of competitor social-media **Creators** (TikTok at launch, schema ready for Instagram / YouTube / LinkedIn / Twitter / Facebook).
2. Define reusable **Analysis Configs** that bundle brand context, analysis instructions, output preferences, and an explicit creator list.
3. **Run pipelines** that scrape each creator's recent viral content via Apify, analyze video content with Google Gemini's Files API (full visual + audio understanding), and generate tailored content scripts based on the analysis + brand context.
4. Monitor progress live via SSE and browse generated scripts in a dedicated Outputs view.

The feature reuses the existing Apify provider, TikTok parser, Gemini provider, AI activity logging, per-workspace key resolution, pg-boss worker infrastructure, and SSE notification service.

## Decisions Locked In

From the brainstorming session:

1. **Top-level menu, new `menuKey: "competitor-analyzer"`** — separate from Research Hub, own icon, own tables.
2. **Full Gemini video analysis via the Files API** — upload the TikTok video, get structured visual + audio analysis.
3. **`AnalysisConfig` explicitly owns its creators** via a many-to-many join table. Niche is a free-text tag only.
4. **Generated scripts live in a dedicated `PipelineScript` table** surfaced via an "Outputs" tab inside Competitor Analyzer. No integration with the generic Content Library for v1.
5. **Project-scoped** — matches Brand Brain / Products / Topics. Uses existing `requireMenu("competitor-analyzer")` middleware.
6. **Async enrichment via pg-boss** on creator add — the form returns immediately; a background job fetches follower count + avatar; SSE updates the UI.
7. **Platform-agnostic schema** — `Creator.platform` and `PipelineContent.contentType` discriminators so adding Instagram / YouTube / etc. later is additive (new actor + parser, no migration).
8. **`CompetitorPipelineRun.configId` uses `onDelete: SetNull`** — deleting a config keeps historical run results intact.

---

## Section 1 — Data Model

Five new tables in `backend/prisma/schema.prisma`, all project-scoped. Snake-case in DB, camelCase in Prisma, soft-delete via `archivedAt` on `Creator` and `AnalysisConfig`; pipeline runs / content / scripts are immutable artifacts that cascade-delete with their run.

```prisma
// ─── Competitor Analyzer ────────────────────────────────────────

model Creator {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  projectId        String    @map("project_id")
  createdBy        String?   @map("created_by")            // user who added — used to route enrichment SSE back
  platform         String                                  // "tiktok" | "instagram" | "youtube" | "linkedin" | "twitter" | "facebook"
  profileUrl       String    @map("profile_url") @db.Text
  username         String                                  // platform-local handle, without @
  displayName      String?   @map("display_name")
  niche            String                                  // free-text tag, filtering only
  followerCount    Int?      @map("follower_count")
  avatarUrl        String?   @map("avatar_url") @db.Text
  bio              String?   @db.Text
  platformMetadata Json?     @map("platform_metadata")     // e.g. { verified, region, subscriberCount }
  enrichmentStatus String    @default("pending") @map("enrichment_status") // "pending"|"enriched"|"failed"
  enrichmentError  String?   @map("enrichment_error") @db.Text
  lastEnrichedAt   DateTime? @map("last_enriched_at")
  archivedAt       DateTime? @map("archived_at")
  createdAt        DateTime  @default(now()) @map("created_at")
  updatedAt        DateTime  @updatedAt @map("updated_at")

  workspace      Workspace               @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project        Project                 @relation(fields: [projectId], references: [id], onDelete: Cascade)
  creator        User?                   @relation("CreatorCreator", fields: [createdBy], references: [id], onDelete: SetNull)
  configMembers  AnalysisConfigCreator[]
  pipelineVideos PipelineContent[]

  @@unique([projectId, platform, username])
  @@index([projectId, platform, archivedAt])
  @@index([workspaceId])
  @@map("creators")
}

// Back-references required on existing models (Prisma won't compile without them):
//
//   model Workspace {
//     // ... existing fields
//     creators               Creator[]
//     analysisConfigs        AnalysisConfig[]
//     competitorPipelineRuns CompetitorPipelineRun[]
//   }
//
//   model Project {
//     // ... existing fields
//     creators               Creator[]
//     analysisConfigs        AnalysisConfig[]
//     competitorPipelineRuns CompetitorPipelineRun[]
//   }

model AnalysisConfig {
  id                   String    @id @default(uuid())
  workspaceId          String    @map("workspace_id")
  projectId            String    @map("project_id")
  name                 String
  targetNiche          String?   @map("target_niche")
  brandContext         String    @map("brand_context") @db.Text
  analysisInstructions String    @map("analysis_instructions") @db.Text
  outputPreferences    String    @map("output_preferences") @db.Text
  archivedAt           DateTime? @map("archived_at")
  createdAt            DateTime  @default(now()) @map("created_at")
  updatedAt            DateTime  @updatedAt @map("updated_at")

  workspace Workspace               @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project                 @relation(fields: [projectId], references: [id], onDelete: Cascade)
  creators  AnalysisConfigCreator[]
  runs      CompetitorPipelineRun[]

  @@index([projectId, archivedAt])
  @@map("analysis_configs")
}

model AnalysisConfigCreator {
  configId  String @map("config_id")
  creatorId String @map("creator_id")

  config  AnalysisConfig @relation(fields: [configId],  references: [id], onDelete: Cascade)
  creator Creator        @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@id([configId, creatorId])
  @@index([creatorId])
  @@map("analysis_config_creators")
}

model CompetitorPipelineRun {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  projectId        String    @map("project_id")
  configId         String?   @map("config_id")             // nullable — SetNull keeps run history after config delete
  userId           String    @map("user_id")
  videosPerCreator Int       @map("videos_per_creator")
  lookbackPool     Int       @map("lookback_pool")
  timeframeDays    Int       @map("timeframe_days")
  status           String    @default("pending")           // pending|scraping|analyzing|generating|completed|failed|cancelling
  stage            String?
  errorMessage     String?   @map("error_message") @db.Text
  startedAt        DateTime? @map("started_at")
  completedAt      DateTime? @map("completed_at")
  createdAt        DateTime  @default(now()) @map("created_at")

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  config    AnalysisConfig?  @relation(fields: [configId], references: [id], onDelete: SetNull)
  user      User             @relation(fields: [userId], references: [id], onDelete: Restrict)
  videos    PipelineContent[]
  scripts   PipelineScript[]

  @@index([projectId, createdAt])
  @@index([status])
  @@map("competitor_pipeline_runs")
}

model PipelineContent {
  id               String    @id @default(uuid())
  runId            String    @map("run_id")
  creatorId        String    @map("creator_id")
  platform         String                                  // denormalized from creator
  platformPostId   String    @map("platform_post_id")      // dedupe key within platform
  contentType      String    @map("content_type")          // "video"|"image"|"carousel"|"text"|"article"
  contentUrl       String    @map("content_url") @db.Text
  thumbnailUrl     String?   @map("thumbnail_url") @db.Text
  caption          String?   @db.Text
  viewCount        Int?      @map("view_count")
  likeCount        Int?      @map("like_count")
  shareCount       Int?      @map("share_count")
  commentCount     Int?      @map("comment_count")
  hashtags         Json?                                    // string[]
  postedAt         DateTime? @map("posted_at")
  platformMetadata Json?     @map("platform_metadata")      // musicName (TikTok), subtitle (YT), etc.
  analysisStatus   String    @default("pending") @map("analysis_status") // pending|running|completed|failed
  analysisJson     Json?     @map("analysis_json")
  analysisError    String?   @map("analysis_error") @db.Text
  createdAt        DateTime  @default(now()) @map("created_at")

  run     CompetitorPipelineRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  creator Creator               @relation(fields: [creatorId], references: [id], onDelete: Cascade)

  @@unique([runId, platform, platformPostId])
  @@index([runId])
  @@index([creatorId])
  @@map("pipeline_content")
}

model PipelineScript {
  id            String   @id @default(uuid())
  runId         String   @map("run_id")
  sourceVideoId String?  @map("source_video_id")            // nullable — scripts can be run-wide synthesis
  scriptNumber  Int      @map("script_number")
  title         String?
  hook          String?  @db.Text
  body          String?  @db.Text
  broll         Json?                                        // [{ scene, description }]
  cta           String?  @db.Text
  rawContent    Json     @map("raw_content")                 // full Gemini output for forward-compat
  createdAt     DateTime @default(now()) @map("created_at")

  run CompetitorPipelineRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("pipeline_scripts")
}
```

**Notable schema choices**
- `Creator.archivedAt` — archiving a creator does NOT remove `AnalysisConfigCreator` rows; the picker hides archived ones, but existing configs still reference them for historical integrity.
- `CompetitorPipelineRun.config` is `onDelete: SetNull` + nullable `configId`, so deleting a config keeps its run history queryable (the UI shows "(config deleted)" on orphan runs).
- `PipelineContent.unique([runId, platform, platformPostId])` — safe idempotent re-insert if a job retries mid-run.
- Platform-agnostic names (`viewCount`, `likeCount`) replace TikTok-specific names (`playCount`, `diggCount`); the parser normalizes.

---

## Section 2 — Backend Architecture

Follows the existing `Routes → Services → Repositories → Prisma` pattern. Jobs are separate classes wired in the composition root (`backend/src/index.ts`).

### New files

```
backend/src/
├── constants/roles.ts                          # ADD "competitor-analyzer" to MENU_KEYS
├── interfaces/
│   ├── repositories/
│   │   ├── creator.repository.interface.ts
│   │   ├── analysis-config.repository.interface.ts
│   │   └── competitor-pipeline.repository.interface.ts
│   └── services/
│       ├── creator.service.interface.ts
│       ├── analysis-config.service.interface.ts
│       └── competitor-pipeline.service.interface.ts
├── repositories/
│   ├── creator.repository.ts
│   ├── analysis-config.repository.ts
│   └── competitor-pipeline.repository.ts
├── services/
│   ├── creator.service.ts                      # CRUD + enrichment trigger
│   ├── analysis-config.service.ts              # CRUD + creator linkage
│   └── competitor-pipeline.service.ts          # Create run, list, get, cancel
├── jobs/
│   ├── creator-enrichment.job.ts               # Async profile scrape
│   └── competitor-pipeline.job.ts              # The orchestrator
├── providers/apify-parsers/
│   └── tiktok-profile.parser.ts                # New — profile endpoint shape differs from video shape
├── routes/
│   └── competitor-analyzer.routes.ts
└── types/
    └── competitor-analyzer.types.ts            # DTOs
```

### Routes

All project-scoped, all guarded by `requireMenu("competitor-analyzer")`:

```
POST   /api/workspaces/:w/projects/:p/competitor-analyzer/creators
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/creators
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/creators/:id
PATCH  /api/workspaces/:w/projects/:p/competitor-analyzer/creators/:id
DELETE /api/workspaces/:w/projects/:p/competitor-analyzer/creators/:id            # soft archive
POST   /api/workspaces/:w/projects/:p/competitor-analyzer/creators/:id/refresh    # re-enqueue enrichment

POST   /api/workspaces/:w/projects/:p/competitor-analyzer/configs
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/configs
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/configs/:id
PATCH  /api/workspaces/:w/projects/:p/competitor-analyzer/configs/:id
DELETE /api/workspaces/:w/projects/:p/competitor-analyzer/configs/:id             # hard delete (SetNull cascades on runs)
PUT    /api/workspaces/:w/projects/:p/competitor-analyzer/configs/:id/creators    # body: { creatorIds: string[] } — replaces membership
DELETE /api/workspaces/:w/projects/:p/competitor-analyzer/configs/:id/creators/:creatorId

POST   /api/workspaces/:w/projects/:p/competitor-analyzer/runs                    # body: { configId, videosPerCreator, lookbackPool, timeframeDays }
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/runs
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/runs/:id                # full detail w/ videos + scripts
POST   /api/workspaces/:w/projects/:p/competitor-analyzer/runs/:id/cancel
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/runs/:id/videos/:videoId
GET    /api/workspaces/:w/projects/:p/competitor-analyzer/runs/:id/scripts
```

### RBAC

- **New menu key `"competitor-analyzer"`** added to `MENU_KEYS` in `backend/src/constants/roles.ts` and to `ALL_MEMBER_MENUS` (so the RBAC data migration grants it to existing users).
- All routes use `requireMenu("competitor-analyzer")` — admin / superadmin bypass for free.
- No approver gating in v1.

### AI Activity Logging

Every Gemini call goes through `logAiActivity(prisma, …)` using two generator keys:

- `generator: "competitor_video_analysis"` — one log per `PipelineContent` video.
- `generator: "competitor_script_generation"` — one log per run (the whole script-gen call).

Both include the pipeline `runId` in the `userPrompt` body (current `ai_provider_logs` schema has no free column for it; SQL query #4 in Section 4 uses `user_prompt LIKE '%<runId>%'` to correlate).

### Apify key + Gemini resolution

- Apify key pulled from `WorkspaceSetting.apifyApiKey` exactly like `ResearchRunJob` does.
- Gemini provider obtained via `AiProviderFactory.getContentGenerator(workspaceId)` (workspace setting → env default → built-in default).
- Missing Apify key on run start → fail fast with clear message surfaced via SSE.

### Cancel semantics

`POST /runs/:id/cancel` flips `status → "cancelling"`. The pipeline job polls that status between stages and bails with `status: "failed"` + `errorMessage: "Cancelled by user"`. Apify-side abort is NOT called in v1 (runs to completion on Apify side; cheap).

---

## Section 3 — Pipeline Orchestration Job

`backend/src/jobs/competitor-pipeline.job.ts`. One pg-boss job per pipeline run. Job expiration is bumped to **30 minutes** via `boss.send("competitor-pipeline", { runId }, { expireInHours: 0.5 })`.

### Stages

Each stage updates `status` + `stage` atomically; the job is resumable on worker crash (status check on entry).

**Stage 1 — Guard & Load** (`status: "pending" → "scraping"`)
- Load run + config + non-archived creators. Validate `creators.length >= 1` and all belong to the run's project.
- Load `WorkspaceSetting.apifyApiKey`; fail fast with clear error if absent.
- Validate input ranges (already enforced at the service layer on run creation; re-asserted here as a defensive check):
  - `videosPerCreator ∈ [1, 10]`
  - `lookbackPool ∈ [5, 50]`
  - `timeframeDays ∈ [1, 90]`
  These are v1 initial limits; can be tuned later.
- Set `startedAt = now()`, emit `competitor_pipeline_started` log + SSE event.
- Check `status === "cancelling"` before proceeding.

**Stage 2 — Scrape** (`stage: "scraping_creator_X_of_Y"`)
- For each creator (sequentially): run `clockworks/free-tiktok-scraper` with input `{ profiles: [username], resultsPerPage: lookbackPool, proxyCountryCode: "US" }`.
- Per-creator timeout: 2 min (same budget as `BrandScrapingJob`).
- Filter scraped videos to `postedAt >= now - timeframeDays`, sort by `viewCount` desc, take top `videosPerCreator`.
- Insert `PipelineContent` rows with `analysisStatus: "pending"`.
- Between creators: check `status === "cancelling"` → bail.
- If ALL creators fail → run fails overall; partial success (≥1 creator returned videos) continues.

**Stage 3 — Video Analysis** (`status: "analyzing"`, `stage: "analyzing_video_X_of_Y"`)
- For each `PipelineContent` with `contentType === "video"` (v1: all are videos, TikTok-only):
  1. Flip `analysisStatus` to `"running"`.
  2. Download video bytes via `fetch(contentUrl)` into memory. Limits: 60-sec download, 50 MB hard cap. Over-limit → fail this video, continue.
  3. Upload to Gemini Files API: `geminiProvider.uploadFile(bytes, "video/mp4")`. Poll until file status `ACTIVE` (90-sec cap).
  4. Call Gemini with a structured-JSON prompt referencing the file URI. Expected response:
     ```json
     {
       "hook": "...",
       "retentionMechanisms": ["..."],
       "pacingNotes": "...",
       "onScreenText": ["..."],
       "audioStyle": "...",
       "whyItWentViral": "...",
       "ctaAnalysis": "..."
     }
     ```
     3-minute timeout on this call.
  5. Save to `analysisJson`, flip `analysisStatus` to `"completed"`.
  6. **Delete the uploaded file** from Gemini (`geminiProvider.deleteFile(fileUri)`) to avoid storage buildup.
  7. `logAiActivity("competitor_video_analysis", …)`.
- Per-video failures are **non-fatal**: flip to `"failed"` + `analysisError`, SSE notify, continue.
- Sequential processing inside a single job. Concurrency comes from scaling pg-boss worker count, not from parallelizing inside one worker.

**Stage 4 — Script Generation** (`status: "generating"`, `stage: "generating_scripts"`)
- Gather all `PipelineContent` rows where `analysisStatus === "completed"`.
- Single Gemini call with:
  - System: "Based on these high-performing competitor videos and their analyses, generate scripts per the output preferences below."
  - User: `config.brandContext` + `config.analysisInstructions` + `config.outputPreferences` + each video's `caption`, `viewCount`, `analysisJson`.
- Expected response: JSON array `[{ scriptNumber, title, hook, body, broll[], cta, rawContent }]`. Store whatever count Gemini returns (don't reject if off by 1).
- Persist as `PipelineScript` rows, `sourceVideoId = null` (run-wide synthesis).
- `logAiActivity("competitor_script_generation", …)`.

**Stage 5 — Complete** (`status: "completed"`)
- Set `completedAt = now()`.
- Emit `competitor_pipeline_completed` log + SSE event `{ runId, videoCount, scriptCount }`.

### Cancellation checkpoints

The job re-reads `PipelineRun.status` at these points and bails (setting `status: "failed"`, `errorMessage: "Cancelled by user"`, `completedAt: now()`, SSE notify) if it sees `"cancelling"`:

1. Start of Stage 1, after loading.
2. Between creators in Stage 2.
3. Between videos in Stage 3.
4. Start of Stage 4, before the script-gen Gemini call.

In-flight work (a running Apify call, a running Gemini call) is NOT aborted — cancellation is checked at boundaries only. In practice a cancellation takes effect within the remaining budget of the current in-flight operation.

### Failure handling

| Level | Example | Behavior |
|-------|---------|----------|
| Fatal (pre-Stage 2) | Missing Apify key, config has no creators, cancellation pre-start | Run `status: "failed"`, error message, SSE notify |
| Per-creator scrape failure | One creator's Apify actor returns FAILED | Record, continue; fail run only if ALL creators fail |
| Per-video analysis failure | Download 404, Gemini reject, upload timeout | `PipelineContent.analysisStatus = "failed"`, continue pipeline |
| Script generation failure | Gemini malformed JSON | Run `status: "failed"`; video analyses remain for future "regenerate scripts" action |

### SSE events

- `competitor_pipeline_stage_changed` — `{ runId, status, stage }`
- `competitor_pipeline_video_analyzed` — `{ runId, videoId, status }`
- `competitor_pipeline_completed` — `{ runId, videoCount, scriptCount }`
- `competitor_pipeline_failed` — `{ runId, errorMessage }`
- `creator_enrichment_completed` — `{ creatorId, status }`

### Timeouts summary

| Operation | Budget |
|-----------|--------|
| Apify scrape per creator | 2 min |
| Video download | 60 sec + 50 MB cap |
| Gemini file upload + ACTIVE poll | 90 sec |
| Gemini video analysis call | 3 min |
| Gemini script generation call | 3 min |
| Total pipeline job | 30 min (pg-boss `expireInHours: 0.5`) |

### Creator Enrichment Job

Simpler. `backend/src/jobs/creator-enrichment.job.ts`:

1. Load creator + workspace Apify key.
2. Run `clockworks/free-tiktok-scraper` with `{ profiles: [username], resultsPerPage: 1 }`. The actor always returns at least one video item (when the account is public + non-empty), and that item's `authorMeta` / `authorStats` fields carry `followerCount`, `avatar`, `nickname`, `signature` (bio).
3. `TikTokProfileParser` extracts those fields from either `authorMeta` on the first item, or the run's default-dataset profile object if the account has no videos.
4. Update creator row with `followerCount`, `avatarUrl`, `displayName`, `bio`; set `enrichmentStatus: "enriched"`, `lastEnrichedAt: now()`.
5. On failure (Apify timeout, private account, parse error): `enrichmentStatus: "failed"` + `enrichmentError` message; no pg-boss retry (fails fast; user can Retry from the UI).
6. Emit `creator_enrichment_completed` SSE event in all outcomes.

---

## Section 4 — Monitoring & Observability

### 4.1 Structured logs (Winston → Loki)

Every job emits events with a stable `event` field:

```ts
// CompetitorPipelineJob
logger.info("competitor_pipeline_started",     { event: "cp_started",    runId, projectId, configId, creatorCount });
logger.info("competitor_pipeline_scrape_done", { event: "cp_scrape",     runId, creatorId, videosFound, durationMs });
logger.info("competitor_pipeline_video_done",  { event: "cp_video",      runId, videoId, durationMs, inputTokens, outputTokens });
logger.info("competitor_pipeline_scripts_done",{ event: "cp_scripts",    runId, scriptCount, durationMs, inputTokens, outputTokens });
logger.info("competitor_pipeline_completed",   { event: "cp_completed",  runId, totalDurationMs, videoCount, scriptCount });
logger.warn("competitor_pipeline_video_failed",{ event: "cp_video_fail", runId, videoId, reason });
logger.error("competitor_pipeline_failed",     { event: "cp_failed",     runId, stage, error });

// CreatorEnrichmentJob
logger.info("creator_enrichment_completed",    { event: "ce_completed",  creatorId, durationMs });
logger.error("creator_enrichment_failed",      { event: "ce_failed",     creatorId, error });
```

### 4.2 Grafana panels

New "Competitor Analyzer" row added to [monitoring/grafana/dashboards/fce-backend.json](monitoring/grafana/dashboards/fce-backend.json). All LogQL against Loki, no Prometheus counters needed.

**Panel 1 — Pipeline runs started** (stat)
```logql
sum(count_over_time({app=~"$app"} |= "cp_started" [$__range]))
```

**Panel 2 — Pipeline success rate (24h)** (stat)
```logql
sum(count_over_time({app=~"$app"} |= "cp_completed" [$__range]))
/
sum(count_over_time({app=~"$app"} |~ "cp_completed|cp_failed" [$__range]))
```

**Panel 3 — Pipeline failures by stage** (timeseries)
```logql
sum by (stage) (
  count_over_time(
    {app=~"$app"} |= "cp_failed"
    | regexp `"stage":"(?P<stage>[^"]+)"`
    [1m]
  )
)
```

**Panel 4 — Avg pipeline duration in seconds** (gauge)
```logql
avg_over_time(
  {app=~"$app"} |= "cp_completed"
  | regexp `"totalDurationMs":(?P<ms>[0-9]+)`
  | unwrap ms
  [$__range]
) / 1000
```

**Panel 5 — Video analysis latency p95** (timeseries)
```logql
quantile_over_time(0.95,
  {app=~"$app"} |= "cp_video"
  | regexp `"durationMs":(?P<ms>[0-9]+)`
  | unwrap ms
  [5m]
)
```

**Panel 6 — Video failure reasons** (table, grouped by `reason`)
```logql
{app=~"$app"} |= "cp_video_fail"
| regexp `"reason":"(?P<reason>[^"]+)"`
| line_format "{{.reason}}"
```

### 4.3 SQL operator queries

Add "Competitor Analyzer — operator queries" appendix to [docs/database-access.md](docs/database-access.md):

```sql
-- 1. Failed runs in last 24h
SELECT id, project_id, stage, error_message, started_at, completed_at
FROM competitor_pipeline_runs
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 2. "Stuck" runs (started but not completed beyond timeout budget)
SELECT id, project_id, status, stage, started_at
FROM competitor_pipeline_runs
WHERE status NOT IN ('completed','failed')
  AND started_at < NOW() - INTERVAL '45 minutes';

-- 3. Per-run video analysis outcome breakdown
SELECT r.id AS run_id,
       COUNT(*) FILTER (WHERE v.analysis_status = 'completed') AS ok,
       COUNT(*) FILTER (WHERE v.analysis_status = 'failed')    AS failed,
       COUNT(*) FILTER (WHERE v.analysis_status = 'pending')   AS pending
FROM competitor_pipeline_runs r
LEFT JOIN pipeline_content v ON v.run_id = r.id
WHERE r.id = '<run-id>'
GROUP BY r.id;

-- 4. Cost per run
SELECT SUM(estimated_cost) AS usd,
       SUM(input_tokens) AS in_tok,
       SUM(output_tokens) AS out_tok
FROM ai_provider_logs
WHERE generator IN ('competitor_video_analysis','competitor_script_generation')
  AND user_prompt LIKE '%<run-id>%';

-- 5. Creator enrichment queue health
SELECT enrichment_status, COUNT(*)
FROM creators
WHERE archived_at IS NULL
GROUP BY enrichment_status;

-- 6. Top-performing analyzed competitor videos (per project)
SELECT v.view_count, v.like_count, v.caption, c.username, c.platform, v.created_at
FROM pipeline_content v
JOIN creators c ON c.id = v.creator_id
WHERE c.project_id = '<project-id>' AND v.analysis_status = 'completed'
ORDER BY v.view_count DESC NULLS LAST
LIMIT 20;
```

Small wrapper script `backend/scripts/competitor-pipeline-status.ts` pretty-prints queries 1–3, matching the pattern of existing `scripts/*.ts`.

### 4.4 Frontend-side monitoring

- **Status chip** per run with color (gray / blue / green / red).
- **Live progress string** from `stage` updating via `useSSE`: *"Analyzing video 4 of 15"*.
- **Per-video cards** during analysis show spinner → check / x for partial-failure visibility.
- **Error inspector** on failed runs: expandable `errorMessage` with the `runId` displayed and copyable, so an operator can paste into Grafana Explore manually. (Grafana deep-linking deferred to v2 — see Section 7.)

### 4.5 New doc

`docs/competitor-analyzer-monitoring.md` — single page containing:

1. SSE event catalog.
2. LogQL query cookbook (the ones from 4.2, copy-pasteable).
3. SQL query cookbook (the ones from 4.3).
4. Runbook: "Pipeline is stuck" and "Run keeps failing on video analysis."

---

## Section 5 — Frontend UI

### 5.1 Routing

```
/competitor-analyzer                          → CompetitorAnalyzerPage (default tab = Creators)
/competitor-analyzer?tab=creators             → Creators
/competitor-analyzer?tab=configs              → Configs
/competitor-analyzer?tab=runs                 → Run Pipeline
/competitor-analyzer?tab=runs&runId=<id>      → Run Pipeline, specific run expanded
/competitor-analyzer?tab=outputs              → Generated Scripts
```

Tab state encoded in URL query param.

### 5.2 Component tree

```
frontend/src/
├── pages/
│   └── CompetitorAnalyzerPage.tsx
├── components/competitor-analyzer/
│   ├── CreatorsTab.tsx
│   │   ├── CreatorAddForm.tsx                # platform locked to "tiktok" for v1
│   │   ├── CreatorCard.tsx                   # avatar + username + niche + follower count + status chip
│   │   └── CreatorsEmptyState.tsx
│   ├── ConfigsTab.tsx
│   │   ├── ConfigForm.tsx
│   │   ├── ConfigCreatorPicker.tsx           # multi-select, filterable by niche
│   │   └── ConfigCard.tsx
│   ├── RunsTab.tsx
│   │   ├── RunLauncher.tsx
│   │   ├── RunsList.tsx
│   │   ├── RunDetail.tsx
│   │   ├── VideoAnalysisCard.tsx
│   │   └── RunProgressBar.tsx                # Scrape → Analyze → Generate → Done pills
│   └── OutputsTab.tsx
│       ├── ScriptsList.tsx
│       └── ScriptDetail.tsx
├── hooks/
│   └── useCompetitorAnalyzer.ts
└── services/
    └── competitor-analyzer.api.ts
```

### 5.3 Sidebar entry

[frontend/src/components/layout/AppShell.tsx](frontend/src/components/layout/AppShell.tsx) `navSections` gets a new item in the **Research** section:

```tsx
{
  label: "Research",
  items: [
    { to: "/research",            label: "Research Hub",        icon: Search,    menuKey: "research-hub" },
    { to: "/competitor-analyzer", label: "Competitor Analyzer", icon: LineChart, menuKey: "competitor-analyzer" },
  ],
}
```

### 5.4 Key UX decisions

- **Add Creator form is async with optimistic insert.** Card appears with placeholder avatar + "enriching…" chip; SSE fills in real data when the background job completes. Failed enrichment shows "—" + a Retry button.
- **Config form saves first, then an inline step-2 panel** offers the `ConfigCreatorPicker`. No modal.
- **Run Pipeline tab has two panes** when a run is selected: left = runs list, right = live detail. No selection = RunLauncher in the right pane.
- **RunLauncher disables "Run Pipeline"** for a config that already has an active (non-terminal) run, with a tooltip. Different configs run concurrently.
- **Outputs tab is read-only for v1.** Per-script "Copy" button only; no edit, no favorite, no export.
- **No delete in Outputs.** Scripts cascade-delete with the run.

### 5.5 SSE wiring

`useCompetitorAnalyzer` subscribes to `useSSE` and handles the 5 event types from Section 3. Re-fetches on mount to recover cached state after navigation.

### 5.6 Design language

Matches existing FCE dashboard: light-indigo palette, `Button` / `Input` / `Modal` / `Spinner` UI atoms. Status chips reuse the color classes used in `CampaignsPage` / `ContentLibraryPage`.

---

## Section 6 — Testing

### 6.1 Unit tests

Bun test runner, in-memory fakes for Prisma + mocks for providers. Following `tests/auth.test.ts` pattern.

**`tests/creator.service.test.ts`**
- Create creator → enqueues enrichment job, `enrichmentStatus: "pending"`.
- Duplicate `(projectId, platform, username)` → `ConflictError`.
- List excludes archived by default; `?includeArchived=true` flag returns them.
- Archive → `archivedAt` set; `AnalysisConfigCreator` rows untouched.
- Refresh → re-enqueues enrichment, status flips to `"pending"`.

**`tests/analysis-config.service.test.ts`**
- CRUD happy paths.
- Replace creators — transactional delete + insert of join rows.
- Delete config with runs — runs keep `configId: null` (verified on re-fetch).

**`tests/competitor-pipeline.service.test.ts`**
- Create run validates: config exists, config has ≥1 non-archived creator, input ranges (`videosPerCreator ∈ [1,10]`, `lookbackPool ∈ [5,50]`, `timeframeDays ∈ [1,90]`), workspace has Apify key.
- Create run enqueues pg-boss job, returns `status: "pending"`.
- Cancel — flips to `"cancelling"` only from non-terminal statuses.
- Get — includes videos + scripts ordered.

### 6.2 Job tests

**`tests/creator-enrichment.job.test.ts`**
- Happy path: profile JSON → fields populated, status `"enriched"`, SSE event.
- Apify timeout → status `"failed"`, error recorded, no throw.
- Missing Apify key → status `"failed"`.

**`tests/competitor-pipeline.job.test.ts`**
- Happy path (2 creators × 2 videos, 4 completed analyses, scripts generated).
- One creator's Apify fails → partial success, other creator's videos analyzed.
- All creators fail Apify → run `status: "failed"`.
- One video analysis fails → that video marked failed, pipeline continues, script gen runs on successes.
- Video download >50 MB → skipped, fail that video, continue.
- Cancellation between stages → bails with `"Cancelled by user"`.
- Script gen malformed JSON → run fails, video analyses remain.

Mocks: `IApifyProvider` (canned responses), `AiProviderFactory` (fake Gemini), in-memory `PrismaClient` fake, notification captor, no-op logger.

Fixtures in `backend/tests/fixtures/competitor/`:
- `tiktok-profile-response.json`
- `tiktok-videos-response.json` (20 videos, varied views + dates)
- `gemini-video-analysis.json`
- `gemini-scripts.json`

### 6.3 Parser tests

`tests/tiktok-profile.parser.test.ts` — asserts extraction of `followerCount` / `avatarUrl` / `bio`; fixture for private / deleted accounts.

### 6.4 Route smoke tests

`tests/competitor-analyzer.routes.test.ts` — Hono test client exercising happy-path CRUD, asserting auth + workspace + project middleware wiring. Real `PrismaClient` against test database, truncated between tests. Does NOT exercise the full pipeline.

### 6.5 Frontend tests

**None in v1.** No existing frontend test pattern to match. Manual smoke-test checklist in `docs/competitor-analyzer-monitoring.md`:

1. Add creator → "enriching…" chip → avatar + follower count populate.
2. Create config → link creators → save.
3. Launch pipeline → live progress updates every few seconds.
4. Open completed video card → analysis text renders.
5. Switch to Outputs tab → scripts appear.
6. Grant/revoke `competitor-analyzer` to a MEMBER → sidebar hides/shows.
7. Remove Apify key → run fails with clear message → fix key → retry.

### 6.6 Seed script

`backend/scripts/seed-competitor-analyzer.ts` — creates a default `AnalysisConfig` with 3 sample TikTok creators for local dev smoke-testing. Pattern matches `scripts/seed-superadmin.ts`.

---

## Section 7 — Out of Scope (v1)

Explicitly deferred:

1. **Non-TikTok platforms** (Instagram, YouTube, LinkedIn, Twitter, Facebook). Schema is ready — adding one is new actor config + parser + text-only analysis branch for non-video platforms.
2. **"Regenerate scripts only"** — re-run Stage 4 without re-scraping.
3. **"Reanalyze one video"** — re-run Stage 3 for a single video.
4. **Promote a script to Content Library** — map `PipelineScript` into `GenerationRequest` + `GenerationOutput`.
5. **Creator bulk import** (CSV / paste list).
6. **Creator detail page** — historical per-creator analytics.
7. **Per-run cost estimation before Run.** `AiProviderLog` captures actuals after the fact.
8. **Config duplication / templating.**
9. **Apify-side run abort on cancel.**
10. **Workspace-level quota / limits** (max runs/month, max creators/project).
11. **Slack / email digest** on pipeline completion.
12. **Frontend component tests.**
13. **Engagement-over-time charts** in Outputs / Videos view.
14. **Multi-language-specific UI** — inherits existing `defaultScrapeLanguage` user setting at the AI-prompt level.
15. **Grafana Explore deep-link from the UI** — requires exposing `GRAFANA_URL` to the frontend (new config endpoint). For v1 the UI displays the `runId` copyable so operators jump to Grafana manually.

---

## Migration & Rollout

One-shot migration:

```bash
cd backend
bunx prisma db push                              # apply schema
bun run scripts/seed-competitor-analyzer.ts     # optional: create demo data in local dev
```

**RBAC:** Only constant updates — no data migration required:

- Add `"competitor-analyzer"` to `MENU_KEYS` in `backend/src/constants/roles.ts`.
- Add `"competitor-analyzer"` to `ALL_MEMBER_MENUS` so future runs of `scripts/migrate-rbac.ts` grant it to newly-backfilled memberships.

Existing `UserProjectMembership.menuAccess` rows are NOT retroactively modified. Workspace admins grant the new menu explicitly per member via Workspace Settings → Projects → member editor. This is deliberate: the feature touches billable APIs (Apify + Gemini video upload) and granting access per user avoids surprise bills.

Admins and superadmins see the menu automatically via the `hasFullAccess` bypass in `AppShell.tsx` and `requireMenu`.

No table backfills needed — all new tables.

## File Change Summary

| Area | Files |
|------|-------|
| Schema | `backend/prisma/schema.prisma` (5 new models) |
| Constants | `backend/src/constants/roles.ts` (add `competitor-analyzer` to `MENU_KEYS` + `ALL_MEMBER_MENUS`) |
| Interfaces | 6 new interface files |
| Repositories | 3 new repos |
| Services | 3 new services |
| Jobs | 2 new jobs (enrichment, pipeline) |
| Parsers | 1 new parser (TikTok profile) |
| Routes | 1 new route file, mounted in composition root |
| Types | 1 new types file (DTOs) |
| Tests | 5 new test files + fixtures |
| Frontend page | `CompetitorAnalyzerPage.tsx` + 4 tabs + ~12 components |
| Frontend hook | `useCompetitorAnalyzer.ts` |
| Frontend API | `competitor-analyzer.api.ts` |
| Sidebar | `AppShell.tsx` (add nav item under Research) |
| Grafana | `monitoring/grafana/dashboards/fce-backend.json` (new row) |
| Docs | `docs/competitor-analyzer-monitoring.md` (new), `docs/database-access.md` (appendix) |
| Migration / seed | `backend/scripts/seed-competitor-analyzer.ts`, update `scripts/migrate-rbac.ts` |
