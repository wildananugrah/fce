# Competitor Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-scoped Competitor Analyzer feature that lets teams curate social-media creators, define analysis configs, and run pipelines that scrape competitor videos via Apify, analyze them with Google Gemini's Files API, and generate tailored scripts.

**Architecture:** New `Creator` / `AnalysisConfig` / `CompetitorPipelineRun` / `PipelineContent` / `PipelineScript` tables scoped by workspace + project. Backend follows existing layered pattern (Routes → Services → Repositories → Prisma). Async work via pg-boss jobs: `CreatorEnrichmentJob` (profile fetch) and `CompetitorPipelineJob` (5-stage orchestrator: scrape → analyze video → generate scripts). Reuses existing `IApifyProvider`, `AiProviderFactory`, `INotificationService`. Frontend adds one `CompetitorAnalyzerPage` with 4 tabs, live progress via existing `useSSE` hook. Platform-agnostic schema so Instagram / YouTube / LinkedIn / Twitter / Facebook are additive later.

**Tech Stack:** TypeScript, Bun runtime, Hono, Prisma 7, pg-boss, Apify client, Google Gemini (Files API via `@google/genai`), React 19, Vite 8, Tailwind 4, Winston + Loki, Grafana.

**Spec:** [docs/superpowers/specs/2026-04-23-competitor-analyzer-design.md](../specs/2026-04-23-competitor-analyzer-design.md)

---

## File Map

### Backend — new files
- `backend/src/interfaces/repositories/creator.repository.interface.ts`
- `backend/src/interfaces/repositories/analysis-config.repository.interface.ts`
- `backend/src/interfaces/repositories/competitor-pipeline.repository.interface.ts`
- `backend/src/interfaces/services/creator.service.interface.ts`
- `backend/src/interfaces/services/analysis-config.service.interface.ts`
- `backend/src/interfaces/services/competitor-pipeline.service.interface.ts`
- `backend/src/repositories/creator.repository.ts`
- `backend/src/repositories/analysis-config.repository.ts`
- `backend/src/repositories/competitor-pipeline.repository.ts`
- `backend/src/services/creator.service.ts`
- `backend/src/services/analysis-config.service.ts`
- `backend/src/services/competitor-pipeline.service.ts`
- `backend/src/jobs/creator-enrichment.job.ts`
- `backend/src/jobs/competitor-pipeline.job.ts`
- `backend/src/providers/apify-parsers/tiktok-profile.parser.ts`
- `backend/src/routes/competitor-analyzer.route.ts`
- `backend/src/types/competitor-analyzer.types.ts`

### Backend — modified files
- `backend/prisma/schema.prisma` (5 new models + back-references on `Workspace` + `Project`)
- `backend/src/constants/roles.ts` (add `competitor-analyzer` menu key)
- `backend/src/index.ts` (wire repos, services, jobs, routes, pg-boss workers)
- `backend/scripts/migrate-rbac.ts` (add new menu to `ALL_MEMBER_MENUS` — no data backfill)

### Backend — test files
- `backend/tests/helpers/mock-creator.repository.ts`
- `backend/tests/helpers/mock-analysis-config.repository.ts`
- `backend/tests/helpers/mock-competitor-pipeline.repository.ts`
- `backend/tests/services/creator.service.test.ts`
- `backend/tests/services/analysis-config.service.test.ts`
- `backend/tests/services/competitor-pipeline.service.test.ts`
- `backend/tests/jobs/creator-enrichment.job.test.ts`
- `backend/tests/jobs/competitor-pipeline.job.test.ts`
- `backend/tests/parsers/tiktok-profile.parser.test.ts`
- `backend/tests/fixtures/competitor/tiktok-profile-response.json`
- `backend/tests/fixtures/competitor/tiktok-videos-response.json`
- `backend/tests/fixtures/competitor/gemini-video-analysis.json`
- `backend/tests/fixtures/competitor/gemini-scripts.json`

### Frontend — new files
- `frontend/src/pages/CompetitorAnalyzerPage.tsx`
- `frontend/src/components/competitor-analyzer/CreatorAddForm.tsx`
- `frontend/src/components/competitor-analyzer/CreatorCard.tsx`
- `frontend/src/components/competitor-analyzer/CreatorsEmptyState.tsx`
- `frontend/src/components/competitor-analyzer/CreatorsTab.tsx`
- `frontend/src/components/competitor-analyzer/ConfigForm.tsx`
- `frontend/src/components/competitor-analyzer/ConfigCreatorPicker.tsx`
- `frontend/src/components/competitor-analyzer/ConfigCard.tsx`
- `frontend/src/components/competitor-analyzer/ConfigsTab.tsx`
- `frontend/src/components/competitor-analyzer/RunLauncher.tsx`
- `frontend/src/components/competitor-analyzer/RunsList.tsx`
- `frontend/src/components/competitor-analyzer/RunProgressBar.tsx`
- `frontend/src/components/competitor-analyzer/VideoAnalysisCard.tsx`
- `frontend/src/components/competitor-analyzer/RunDetail.tsx`
- `frontend/src/components/competitor-analyzer/RunsTab.tsx`
- `frontend/src/components/competitor-analyzer/ScriptDetail.tsx`
- `frontend/src/components/competitor-analyzer/ScriptsList.tsx`
- `frontend/src/components/competitor-analyzer/OutputsTab.tsx`
- `frontend/src/hooks/useCompetitorAnalyzer.ts`
- `frontend/src/services/competitor-analyzer.api.ts`

### Frontend — modified files
- `frontend/src/App.tsx` (register route)
- `frontend/src/components/layout/AppShell.tsx` (sidebar entry under Research)
- `frontend/src/contexts/ProjectContext.tsx` (add `"competitor-analyzer"` to `MenuKey` union if not done by constants export)

### Docs & ops
- `docs/competitor-analyzer-monitoring.md` (new)
- `docs/database-access.md` (appendix with SQL queries)
- `monitoring/grafana/dashboards/fce-backend.json` (new row)
- `backend/scripts/seed-competitor-analyzer.ts` (new)
- `backend/scripts/competitor-pipeline-status.ts` (new)

---

## Prerequisites (one-time, before starting)

- Docker services running: `docker-compose up -d` (Postgres on 5433, MinIO).
- Backend deps installed: `cd backend && bun install`.
- Frontend deps installed: `cd frontend && npm install`.
- `.env` present with `DATABASE_URL`, `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` for local testing.
- At least one workspace in the DB with an `apifyApiKey` set in `WorkspaceSetting` (tests mock this; manual smoke testing requires a real Apify token).

---

## Phase 1 — Schema & Constants

Lay the database foundation and RBAC menu key. Everything else depends on these.

---

### Task 1.1: Add Prisma models for Competitor Analyzer

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add the 5 new models at the bottom of `schema.prisma`**

Open `backend/prisma/schema.prisma` and append at the end of the file:

```prisma
// ─── Competitor Analyzer ────────────────────────────────────────

model Creator {
  id               String    @id @default(uuid())
  workspaceId      String    @map("workspace_id")
  projectId        String    @map("project_id")
  // User who added this creator. Used by the enrichment job to route SSE
  // notifications back to the right browser tab. Nullable = SetNull on user
  // delete so historical creators survive.
  createdBy        String?   @map("created_by")
  platform         String                                  // "tiktok" | "instagram" | "youtube" | "linkedin" | "twitter" | "facebook"
  profileUrl       String    @map("profile_url") @db.Text
  username         String
  displayName      String?   @map("display_name")
  niche            String
  followerCount    Int?      @map("follower_count")
  avatarUrl        String?   @map("avatar_url") @db.Text
  bio              String?   @db.Text
  platformMetadata Json?     @map("platform_metadata")
  enrichmentStatus String    @default("pending") @map("enrichment_status")
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
  configId         String?   @map("config_id")
  userId           String    @map("user_id")
  videosPerCreator Int       @map("videos_per_creator")
  lookbackPool     Int       @map("lookback_pool")
  timeframeDays    Int       @map("timeframe_days")
  status           String    @default("pending")
  stage            String?
  errorMessage     String?   @map("error_message") @db.Text
  startedAt        DateTime? @map("started_at")
  completedAt      DateTime? @map("completed_at")
  createdAt        DateTime  @default(now()) @map("created_at")

  workspace Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project   Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  config    AnalysisConfig?   @relation(fields: [configId], references: [id], onDelete: SetNull)
  user      User              @relation(fields: [userId], references: [id], onDelete: Restrict)
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
  platform         String
  platformPostId   String    @map("platform_post_id")
  contentType      String    @map("content_type")
  contentUrl       String    @map("content_url") @db.Text
  thumbnailUrl     String?   @map("thumbnail_url") @db.Text
  caption          String?   @db.Text
  viewCount        Int?      @map("view_count")
  likeCount        Int?      @map("like_count")
  shareCount       Int?      @map("share_count")
  commentCount     Int?      @map("comment_count")
  hashtags         Json?
  postedAt         DateTime? @map("posted_at")
  platformMetadata Json?     @map("platform_metadata")
  analysisStatus   String    @default("pending") @map("analysis_status")
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
  sourceVideoId String?  @map("source_video_id")
  scriptNumber  Int      @map("script_number")
  title         String?
  hook          String?  @db.Text
  body          String?  @db.Text
  broll         Json?
  cta           String?  @db.Text
  rawContent    Json     @map("raw_content")
  createdAt     DateTime @default(now()) @map("created_at")

  run CompetitorPipelineRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("pipeline_scripts")
}
```

- [ ] **Step 2: Add back-references to `Workspace` model**

Find the `model Workspace {` block in the same file and add these lines inside the relations section (order doesn't matter, but keep them grouped with existing relations like `brands`, `projects`):

```prisma
  creators               Creator[]
  analysisConfigs        AnalysisConfig[]
  competitorPipelineRuns CompetitorPipelineRun[]
```

- [ ] **Step 3: Add back-references to `Project` model**

Find the `model Project {` block and add inside it:

```prisma
  creators               Creator[]
  analysisConfigs        AnalysisConfig[]
  competitorPipelineRuns CompetitorPipelineRun[]
```

- [ ] **Step 3b: Add back-references to `User` model**

Find the `model User {` block and add inside it (the `@relation("CreatorCreator")` name disambiguates from other creator-like relations):

```prisma
  createdCreators        Creator[]               @relation("CreatorCreator")
  competitorPipelineRuns CompetitorPipelineRun[]
```

- [ ] **Step 4: Push the schema to the database**

Run: `cd backend && bunx prisma db push`

Expected output includes: `Your database is now in sync with your Prisma schema.`

If it fails with a connection error, verify `docker-compose up -d` is running and `DATABASE_URL` in `backend/.env` points to `postgresql://...:5433/...`.

- [ ] **Step 5: Regenerate Prisma client**

Run: `cd backend && bunx prisma generate`

Expected: `✔ Generated Prisma Client`

- [ ] **Step 6: Verify types compile**

Run: `cd backend && bunx tsc --noEmit`

Expected: exits with code 0 (no output).

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(schema): add competitor analyzer models"
```

---

### Task 1.2: Add `competitor-analyzer` menu key constant

**Files:**
- Modify: `backend/src/constants/roles.ts`

- [ ] **Step 1: Add the menu key**

Open `backend/src/constants/roles.ts`. Find the `MENU_KEYS` array and add `"competitor-analyzer"` as the last entry:

```typescript
export const MENU_KEYS = [
	"brand-brain",
	"product-brain",
	"topic-generator",
	"content-generator",
	"campaign-generator",
	"topic-library",
	"content-library",
	"learning-center",
	"research-hub",
	"competitor-analyzer",
] as const;
```

- [ ] **Step 2: Verify `ALL_MEMBER_MENUS` auto-picks it up**

The constant `ALL_MEMBER_MENUS = [...MENU_KEYS]` on the same file already spreads `MENU_KEYS`, so it automatically includes the new entry. Confirm by reading the file — no edit needed here.

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/constants/roles.ts
git commit -m "feat(rbac): add competitor-analyzer menu key"
```

---

## Phase 2 — DTOs, Interfaces, Repositories

Define the shapes used across the backend layer + Prisma-backed repositories + in-memory mocks for tests.

---

### Task 2.1: Create DTO types file

**Files:**
- Create: `backend/src/types/competitor-analyzer.types.ts`

- [ ] **Step 1: Write the types**

```typescript
import type {
	AnalysisConfig,
	CompetitorPipelineRun,
	Creator,
	PipelineContent,
	PipelineScript,
} from "@prisma/client";

// ─── Creator ───────────────────────────────────────────────────

export interface CreateCreatorInput {
	profileUrl: string;
	username: string;
	platform: string; // "tiktok" only in v1 — enforced at service layer
	niche: string;
}

export interface UpdateCreatorInput {
	profileUrl?: string;
	niche?: string;
}

export interface CreatorFilters {
	platform?: string;
	niche?: string;
	includeArchived?: boolean;
}

// ─── Analysis Config ───────────────────────────────────────────

export interface CreateAnalysisConfigInput {
	name: string;
	targetNiche?: string;
	brandContext: string;
	analysisInstructions: string;
	outputPreferences: string;
}

export interface UpdateAnalysisConfigInput {
	name?: string;
	targetNiche?: string;
	brandContext?: string;
	analysisInstructions?: string;
	outputPreferences?: string;
}

export type AnalysisConfigWithCreators = AnalysisConfig & {
	creators: (Creator & { enrichmentStatus: string })[];
	_count?: { runs: number };
};

// ─── Pipeline Run ──────────────────────────────────────────────

export interface CreatePipelineRunInput {
	configId: string;
	videosPerCreator: number;
	lookbackPool: number;
	timeframeDays: number;
}

export type PipelineRunWithVideosAndScripts = CompetitorPipelineRun & {
	videos: PipelineContent[];
	scripts: PipelineScript[];
	config: AnalysisConfig | null;
};

// Input-validation constants — enforced at service layer & re-asserted in the job.
export const PIPELINE_INPUT_LIMITS = {
	videosPerCreatorMin: 1,
	videosPerCreatorMax: 10,
	lookbackPoolMin: 5,
	lookbackPoolMax: 50,
	timeframeDaysMin: 1,
	timeframeDaysMax: 90,
} as const;

// Terminal statuses — once a run is in any of these, no further transitions.
export const PIPELINE_TERMINAL_STATUSES = new Set(["completed", "failed"]);

// ─── Gemini Video Analysis Response Shape ──────────────────────

export interface VideoAnalysisResult {
	hook: string;
	retentionMechanisms: string[];
	pacingNotes: string;
	onScreenText: string[];
	audioStyle: string;
	whyItWentViral: string;
	ctaAnalysis: string;
}

// ─── Gemini Script Generation Response Shape ───────────────────

export interface GeneratedScript {
	scriptNumber: number;
	title?: string;
	hook: string;
	body: string;
	broll?: Array<{ scene: string; description: string }>;
	cta: string;
	sourceVideoId?: string;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`

Expected: exits clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/types/competitor-analyzer.types.ts
git commit -m "feat(types): add competitor analyzer DTOs"
```

---

### Task 2.2: Creator repository interface

**Files:**
- Create: `backend/src/interfaces/repositories/creator.repository.interface.ts`

- [ ] **Step 1: Write the interface**

```typescript
import type { Creator } from "@prisma/client";
import type { CreateCreatorInput, CreatorFilters, UpdateCreatorInput } from "../../types/competitor-analyzer.types";

export interface ICreatorRepository {
	create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator>;

	findById(id: string): Promise<Creator | null>;

	findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]>;

	findByIds(ids: string[]): Promise<Creator[]>;

	update(id: string, data: UpdateCreatorInput): Promise<Creator>;

	updateEnrichment(
		id: string,
		data: {
			enrichmentStatus: "pending" | "enriched" | "failed";
			enrichmentError?: string | null;
			followerCount?: number | null;
			avatarUrl?: string | null;
			displayName?: string | null;
			bio?: string | null;
			platformMetadata?: any;
			lastEnrichedAt?: Date | null;
		},
	): Promise<Creator>;

	archive(id: string): Promise<Creator>;

	existsByUsername(projectId: string, platform: string, username: string): Promise<boolean>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/repositories/creator.repository.interface.ts
git commit -m "feat(interface): creator repository"
```

---

### Task 2.3: Analysis Config repository interface

**Files:**
- Create: `backend/src/interfaces/repositories/analysis-config.repository.interface.ts`

- [ ] **Step 1: Write the interface**

```typescript
import type { AnalysisConfig } from "@prisma/client";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../types/competitor-analyzer.types";

export interface IAnalysisConfigRepository {
	create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig>;

	findById(id: string): Promise<AnalysisConfigWithCreators | null>;

	findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]>;

	update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig>;

	delete(id: string): Promise<void>;

	/** Replaces the entire creator membership list atomically. */
	replaceCreators(configId: string, creatorIds: string[]): Promise<void>;

	/** Remove a single creator from a config. */
	removeCreator(configId: string, creatorId: string): Promise<void>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/repositories/analysis-config.repository.interface.ts
git commit -m "feat(interface): analysis config repository"
```

---

### Task 2.4: Competitor Pipeline repository interface

**Files:**
- Create: `backend/src/interfaces/repositories/competitor-pipeline.repository.interface.ts`

- [ ] **Step 1: Write the interface**

```typescript
import type { CompetitorPipelineRun, PipelineContent, PipelineScript } from "@prisma/client";
import type { PipelineRunWithVideosAndScripts } from "../../types/competitor-analyzer.types";

export interface ICompetitorPipelineRepository {
	createRun(data: {
		workspaceId: string;
		projectId: string;
		configId: string;
		userId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	}): Promise<CompetitorPipelineRun>;

	findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null>;

	findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]>;

	updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun>;

	getRunStatus(id: string): Promise<string | null>;

	createContent(data: Array<{
		runId: string;
		creatorId: string;
		platform: string;
		platformPostId: string;
		contentType: string;
		contentUrl: string;
		thumbnailUrl?: string | null;
		caption?: string | null;
		viewCount?: number | null;
		likeCount?: number | null;
		shareCount?: number | null;
		commentCount?: number | null;
		hashtags?: any;
		postedAt?: Date | null;
		platformMetadata?: any;
	}>): Promise<PipelineContent[]>;

	findContentByRun(runId: string): Promise<PipelineContent[]>;

	findContentById(id: string): Promise<PipelineContent | null>;

	updateContent(
		id: string,
		data: Partial<PipelineContent>,
	): Promise<PipelineContent>;

	createScripts(runId: string, scripts: Array<{
		scriptNumber: number;
		sourceVideoId?: string | null;
		title?: string | null;
		hook?: string | null;
		body?: string | null;
		broll?: any;
		cta?: string | null;
		rawContent: any;
	}>): Promise<PipelineScript[]>;

	findScriptsByRun(runId: string): Promise<PipelineScript[]>;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/repositories/competitor-pipeline.repository.interface.ts
git commit -m "feat(interface): competitor pipeline repository"
```

---

### Task 2.5: Creator repository (Prisma implementation)

**Files:**
- Create: `backend/src/repositories/creator.repository.ts`

- [ ] **Step 1: Write the repository**

```typescript
import type { Creator, PrismaClient } from "@prisma/client";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../types/competitor-analyzer.types";

export class CreatorRepository implements ICreatorRepository {
	constructor(private prisma: PrismaClient) {}

	async create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator> {
		return this.prisma.creator.create({
			data: {
				workspaceId: data.workspaceId,
				projectId: data.projectId,
				createdBy: data.createdBy,
				platform: data.input.platform,
				profileUrl: data.input.profileUrl,
				username: data.input.username,
				niche: data.input.niche,
			},
		});
	}

	async findById(id: string): Promise<Creator | null> {
		return this.prisma.creator.findUnique({ where: { id } });
	}

	async findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		const where: any = { projectId };
		if (!filters?.includeArchived) where.archivedAt = null;
		if (filters?.platform) where.platform = filters.platform;
		if (filters?.niche) where.niche = { contains: filters.niche, mode: "insensitive" };
		return this.prisma.creator.findMany({
			where,
			orderBy: [{ createdAt: "desc" }],
		});
	}

	async findByIds(ids: string[]): Promise<Creator[]> {
		if (ids.length === 0) return [];
		return this.prisma.creator.findMany({ where: { id: { in: ids } } });
	}

	async update(id: string, data: UpdateCreatorInput): Promise<Creator> {
		return this.prisma.creator.update({ where: { id }, data });
	}

	async updateEnrichment(
		id: string,
		data: {
			enrichmentStatus: "pending" | "enriched" | "failed";
			enrichmentError?: string | null;
			followerCount?: number | null;
			avatarUrl?: string | null;
			displayName?: string | null;
			bio?: string | null;
			platformMetadata?: any;
			lastEnrichedAt?: Date | null;
		},
	): Promise<Creator> {
		return this.prisma.creator.update({ where: { id }, data: data as any });
	}

	async archive(id: string): Promise<Creator> {
		return this.prisma.creator.update({
			where: { id },
			data: { archivedAt: new Date() },
		});
	}

	async existsByUsername(
		projectId: string,
		platform: string,
		username: string,
	): Promise<boolean> {
		const found = await this.prisma.creator.findUnique({
			where: { projectId_platform_username: { projectId, platform, username } },
		});
		return found !== null;
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/creator.repository.ts
git commit -m "feat(repo): creator repository"
```

---

### Task 2.6: Analysis Config repository (Prisma)

**Files:**
- Create: `backend/src/repositories/analysis-config.repository.ts`

- [ ] **Step 1: Write the repository**

```typescript
import type { AnalysisConfig, PrismaClient } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../types/competitor-analyzer.types";

export class AnalysisConfigRepository implements IAnalysisConfigRepository {
	constructor(private prisma: PrismaClient) {}

	async create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig> {
		return this.prisma.analysisConfig.create({
			data: {
				workspaceId: data.workspaceId,
				projectId: data.projectId,
				name: data.input.name,
				targetNiche: data.input.targetNiche ?? null,
				brandContext: data.input.brandContext,
				analysisInstructions: data.input.analysisInstructions,
				outputPreferences: data.input.outputPreferences,
			},
		});
	}

	async findById(id: string): Promise<AnalysisConfigWithCreators | null> {
		const config = await this.prisma.analysisConfig.findUnique({
			where: { id },
			include: {
				creators: { include: { creator: true } },
				_count: { select: { runs: true } },
			},
		});
		if (!config) return null;
		return {
			...config,
			creators: config.creators.map((cc) => cc.creator),
		} as AnalysisConfigWithCreators;
	}

	async findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		const configs = await this.prisma.analysisConfig.findMany({
			where: { projectId, archivedAt: null },
			include: {
				creators: { include: { creator: true } },
				_count: { select: { runs: true } },
			},
			orderBy: { updatedAt: "desc" },
		});
		return configs.map((config) => ({
			...config,
			creators: config.creators.map((cc) => cc.creator),
		})) as AnalysisConfigWithCreators[];
	}

	async update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		return this.prisma.analysisConfig.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.analysisConfig.delete({ where: { id } });
	}

	async replaceCreators(configId: string, creatorIds: string[]): Promise<void> {
		await this.prisma.$transaction([
			this.prisma.analysisConfigCreator.deleteMany({ where: { configId } }),
			this.prisma.analysisConfigCreator.createMany({
				data: creatorIds.map((creatorId) => ({ configId, creatorId })),
				skipDuplicates: true,
			}),
		]);
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		await this.prisma.analysisConfigCreator.delete({
			where: { configId_creatorId: { configId, creatorId } },
		});
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/analysis-config.repository.ts
git commit -m "feat(repo): analysis config repository"
```

---

### Task 2.7: Competitor Pipeline repository (Prisma)

**Files:**
- Create: `backend/src/repositories/competitor-pipeline.repository.ts`

- [ ] **Step 1: Write the repository**

```typescript
import type {
	CompetitorPipelineRun,
	PipelineContent,
	PipelineScript,
	PrismaClient,
} from "@prisma/client";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { PipelineRunWithVideosAndScripts } from "../types/competitor-analyzer.types";

export class CompetitorPipelineRepository implements ICompetitorPipelineRepository {
	constructor(private prisma: PrismaClient) {}

	async createRun(data: {
		workspaceId: string;
		projectId: string;
		configId: string;
		userId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	}): Promise<CompetitorPipelineRun> {
		return this.prisma.competitorPipelineRun.create({ data });
	}

	async findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null> {
		return this.prisma.competitorPipelineRun.findUnique({
			where: { id },
			include: {
				videos: { orderBy: { createdAt: "asc" } },
				scripts: { orderBy: { scriptNumber: "asc" } },
				config: true,
			},
		}) as Promise<PipelineRunWithVideosAndScripts | null>;
	}

	async findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.prisma.competitorPipelineRun.findMany({
			where: { projectId },
			orderBy: { createdAt: "desc" },
		});
	}

	async updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun> {
		return this.prisma.competitorPipelineRun.update({ where: { id }, data: data as any });
	}

	async getRunStatus(id: string): Promise<string | null> {
		const run = await this.prisma.competitorPipelineRun.findUnique({
			where: { id },
			select: { status: true },
		});
		return run?.status ?? null;
	}

	async createContent(data: any[]): Promise<PipelineContent[]> {
		if (data.length === 0) return [];
		await this.prisma.pipelineContent.createMany({ data, skipDuplicates: true });
		const runIds = [...new Set(data.map((d) => d.runId))];
		return this.prisma.pipelineContent.findMany({
			where: { runId: { in: runIds } },
			orderBy: { createdAt: "asc" },
		});
	}

	async findContentByRun(runId: string): Promise<PipelineContent[]> {
		return this.prisma.pipelineContent.findMany({
			where: { runId },
			orderBy: { createdAt: "asc" },
		});
	}

	async findContentById(id: string): Promise<PipelineContent | null> {
		return this.prisma.pipelineContent.findUnique({ where: { id } });
	}

	async updateContent(
		id: string,
		data: Partial<PipelineContent>,
	): Promise<PipelineContent> {
		return this.prisma.pipelineContent.update({ where: { id }, data: data as any });
	}

	async createScripts(
		runId: string,
		scripts: any[],
	): Promise<PipelineScript[]> {
		if (scripts.length === 0) return [];
		await this.prisma.pipelineScript.createMany({
			data: scripts.map((s) => ({ ...s, runId })),
		});
		return this.prisma.pipelineScript.findMany({
			where: { runId },
			orderBy: { scriptNumber: "asc" },
		});
	}

	async findScriptsByRun(runId: string): Promise<PipelineScript[]> {
		return this.prisma.pipelineScript.findMany({
			where: { runId },
			orderBy: { scriptNumber: "asc" },
		});
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/competitor-pipeline.repository.ts
git commit -m "feat(repo): competitor pipeline repository"
```

---

### Task 2.8: Mock Creator repository (for unit tests)

**Files:**
- Create: `backend/tests/helpers/mock-creator.repository.ts`

- [ ] **Step 1: Write the mock**

```typescript
import type { Creator } from "@prisma/client";
import type { ICreatorRepository } from "../../src/interfaces/repositories/creator.repository.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../../src/types/competitor-analyzer.types";

export class MockCreatorRepository implements ICreatorRepository {
	public creators: Creator[] = [];

	async create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator> {
		const row: Creator = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			createdBy: data.createdBy,
			platform: data.input.platform,
			profileUrl: data.input.profileUrl,
			username: data.input.username,
			displayName: null,
			niche: data.input.niche,
			followerCount: null,
			avatarUrl: null,
			bio: null,
			platformMetadata: null,
			enrichmentStatus: "pending",
			enrichmentError: null,
			lastEnrichedAt: null,
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as Creator;
		this.creators.push(row);
		return row;
	}

	async findById(id: string): Promise<Creator | null> {
		return this.creators.find((c) => c.id === id) ?? null;
	}

	async findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		let rows = this.creators.filter((c) => c.projectId === projectId);
		if (!filters?.includeArchived) rows = rows.filter((c) => c.archivedAt === null);
		if (filters?.platform) rows = rows.filter((c) => c.platform === filters.platform);
		if (filters?.niche) {
			const q = filters.niche.toLowerCase();
			rows = rows.filter((c) => c.niche.toLowerCase().includes(q));
		}
		return rows;
	}

	async findByIds(ids: string[]): Promise<Creator[]> {
		return this.creators.filter((c) => ids.includes(c.id));
	}

	async update(id: string, data: UpdateCreatorInput): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async updateEnrichment(id: string, data: any): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async archive(id: string): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		row.archivedAt = new Date();
		return row;
	}

	async existsByUsername(
		projectId: string,
		platform: string,
		username: string,
	): Promise<boolean> {
		return this.creators.some(
			(c) => c.projectId === projectId && c.platform === platform && c.username === username,
		);
	}

	clear(): void {
		this.creators = [];
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/helpers/mock-creator.repository.ts
git commit -m "test(helpers): mock creator repository"
```

---

### Task 2.9: Mock Analysis Config + Competitor Pipeline repositories

**Files:**
- Create: `backend/tests/helpers/mock-analysis-config.repository.ts`
- Create: `backend/tests/helpers/mock-competitor-pipeline.repository.ts`

- [ ] **Step 1: Write the analysis config mock**

```typescript
// backend/tests/helpers/mock-analysis-config.repository.ts
import type { AnalysisConfig, Creator } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../../src/interfaces/repositories/analysis-config.repository.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../src/types/competitor-analyzer.types";

export class MockAnalysisConfigRepository implements IAnalysisConfigRepository {
	public configs: AnalysisConfig[] = [];
	public joinRows: Array<{ configId: string; creatorId: string }> = [];
	/** Set by tests that want findById/findByProject to expose creators. */
	public creatorStore: Creator[] = [];

	async create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig> {
		const row: AnalysisConfig = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			name: data.input.name,
			targetNiche: data.input.targetNiche ?? null,
			brandContext: data.input.brandContext,
			analysisInstructions: data.input.analysisInstructions,
			outputPreferences: data.input.outputPreferences,
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as AnalysisConfig;
		this.configs.push(row);
		return row;
	}

	async findById(id: string): Promise<AnalysisConfigWithCreators | null> {
		const config = this.configs.find((c) => c.id === id);
		if (!config) return null;
		const creatorIds = this.joinRows.filter((j) => j.configId === id).map((j) => j.creatorId);
		const creators = this.creatorStore.filter((c) => creatorIds.includes(c.id));
		return { ...config, creators } as AnalysisConfigWithCreators;
	}

	async findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		return Promise.all(
			this.configs
				.filter((c) => c.projectId === projectId && c.archivedAt === null)
				.map(async (c) => (await this.findById(c.id)) as AnalysisConfigWithCreators),
		);
	}

	async update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		const row = this.configs.find((c) => c.id === id);
		if (!row) throw new Error("Config not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async delete(id: string): Promise<void> {
		this.configs = this.configs.filter((c) => c.id !== id);
		this.joinRows = this.joinRows.filter((j) => j.configId !== id);
	}

	async replaceCreators(configId: string, creatorIds: string[]): Promise<void> {
		this.joinRows = this.joinRows.filter((j) => j.configId !== configId);
		for (const creatorId of creatorIds) {
			this.joinRows.push({ configId, creatorId });
		}
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		this.joinRows = this.joinRows.filter(
			(j) => !(j.configId === configId && j.creatorId === creatorId),
		);
	}

	clear(): void {
		this.configs = [];
		this.joinRows = [];
		this.creatorStore = [];
	}
}
```

- [ ] **Step 2: Write the pipeline mock**

```typescript
// backend/tests/helpers/mock-competitor-pipeline.repository.ts
import type { CompetitorPipelineRun, PipelineContent, PipelineScript } from "@prisma/client";
import type { ICompetitorPipelineRepository } from "../../src/interfaces/repositories/competitor-pipeline.repository.interface";
import type { PipelineRunWithVideosAndScripts } from "../../src/types/competitor-analyzer.types";

export class MockCompetitorPipelineRepository implements ICompetitorPipelineRepository {
	public runs: CompetitorPipelineRun[] = [];
	public videos: PipelineContent[] = [];
	public scripts: PipelineScript[] = [];

	async createRun(data: any): Promise<CompetitorPipelineRun> {
		const row: CompetitorPipelineRun = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			configId: data.configId,
			userId: data.userId,
			videosPerCreator: data.videosPerCreator,
			lookbackPool: data.lookbackPool,
			timeframeDays: data.timeframeDays,
			status: "pending",
			stage: null,
			errorMessage: null,
			startedAt: null,
			completedAt: null,
			createdAt: new Date(),
		} as CompetitorPipelineRun;
		this.runs.push(row);
		return row;
	}

	async findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null> {
		const run = this.runs.find((r) => r.id === id);
		if (!run) return null;
		return {
			...run,
			videos: this.videos.filter((v) => v.runId === id),
			scripts: this.scripts.filter((s) => s.runId === id),
			config: null,
		} as PipelineRunWithVideosAndScripts;
	}

	async findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.runs.filter((r) => r.projectId === projectId);
	}

	async updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun> {
		const row = this.runs.find((r) => r.id === id);
		if (!row) throw new Error("Run not found");
		Object.assign(row, data);
		return row;
	}

	async getRunStatus(id: string): Promise<string | null> {
		return this.runs.find((r) => r.id === id)?.status ?? null;
	}

	async createContent(data: any[]): Promise<PipelineContent[]> {
		for (const d of data) {
			const row: PipelineContent = {
				id: crypto.randomUUID(),
				runId: d.runId,
				creatorId: d.creatorId,
				platform: d.platform,
				platformPostId: d.platformPostId,
				contentType: d.contentType,
				contentUrl: d.contentUrl,
				thumbnailUrl: d.thumbnailUrl ?? null,
				caption: d.caption ?? null,
				viewCount: d.viewCount ?? null,
				likeCount: d.likeCount ?? null,
				shareCount: d.shareCount ?? null,
				commentCount: d.commentCount ?? null,
				hashtags: d.hashtags ?? null,
				postedAt: d.postedAt ?? null,
				platformMetadata: d.platformMetadata ?? null,
				analysisStatus: "pending",
				analysisJson: null,
				analysisError: null,
				createdAt: new Date(),
			} as PipelineContent;
			this.videos.push(row);
		}
		return [...this.videos];
	}

	async findContentByRun(runId: string): Promise<PipelineContent[]> {
		return this.videos.filter((v) => v.runId === runId);
	}

	async findContentById(id: string): Promise<PipelineContent | null> {
		return this.videos.find((v) => v.id === id) ?? null;
	}

	async updateContent(
		id: string,
		data: Partial<PipelineContent>,
	): Promise<PipelineContent> {
		const row = this.videos.find((v) => v.id === id);
		if (!row) throw new Error("Content not found");
		Object.assign(row, data);
		return row;
	}

	async createScripts(runId: string, scripts: any[]): Promise<PipelineScript[]> {
		for (const s of scripts) {
			const row: PipelineScript = {
				id: crypto.randomUUID(),
				runId,
				sourceVideoId: s.sourceVideoId ?? null,
				scriptNumber: s.scriptNumber,
				title: s.title ?? null,
				hook: s.hook ?? null,
				body: s.body ?? null,
				broll: s.broll ?? null,
				cta: s.cta ?? null,
				rawContent: s.rawContent,
				createdAt: new Date(),
			} as PipelineScript;
			this.scripts.push(row);
		}
		return this.scripts.filter((s) => s.runId === runId);
	}

	async findScriptsByRun(runId: string): Promise<PipelineScript[]> {
		return this.scripts.filter((s) => s.runId === runId);
	}

	clear(): void {
		this.runs = [];
		this.videos = [];
		this.scripts = [];
	}
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/helpers/mock-analysis-config.repository.ts backend/tests/helpers/mock-competitor-pipeline.repository.ts
git commit -m "test(helpers): mock analysis config + pipeline repositories"
```

---

## Phase 3 — Services (TDD)

Services encode business logic. Follow strict TDD: write test → verify fail → implement → verify pass → commit.

---

### Task 3.1: Creator service interface

**Files:**
- Create: `backend/src/interfaces/services/creator.service.interface.ts`

- [ ] **Step 1: Write the interface**

```typescript
import type { Creator } from "@prisma/client";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../../types/competitor-analyzer.types";

export interface ICreatorService {
	create(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreateCreatorInput,
	): Promise<Creator>;
	list(projectId: string, filters?: CreatorFilters): Promise<Creator[]>;
	get(id: string): Promise<Creator>;
	update(id: string, input: UpdateCreatorInput): Promise<Creator>;
	archive(id: string): Promise<Creator>;
	refreshEnrichment(id: string): Promise<Creator>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/interfaces/services/creator.service.interface.ts
git commit -m "feat(interface): creator service"
```

---

### Task 3.2: Creator service test (write failing tests first)

**Files:**
- Create: `backend/tests/services/creator.service.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { afterEach, describe, expect, it } from "bun:test";
import { CreatorService } from "../../src/services/creator.service";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockBoss = { send: async () => "job-id-stub" } as any;
const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CreatorService", () => {
	const repo = new MockCreatorRepository();
	const bossCalls: Array<{ queue: string; data: any }> = [];
	const bossCapturing = {
		send: async (queue: string, data: any) => {
			bossCalls.push({ queue, data });
			return "job-id";
		},
	} as any;

	const service = new CreatorService(repo, bossCapturing, mockLogger);

	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		repo.clear();
		bossCalls.length = 0;
	});

	describe("create", () => {
		it("creates a creator with pending enrichment and enqueues the job", async () => {
			const creator = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "https://tiktok.com/@acme",
				username: "acme",
				niche: "fitness",
			});

			expect(creator.username).toBe("acme");
			expect(creator.enrichmentStatus).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("creator-enrichment");
			expect(bossCalls[0].data).toEqual({ creatorId: creator.id });
		});

		it("rejects non-tiktok platforms in v1", async () => {
			await expect(
				service.create(workspaceId, projectId, userId, {
					platform: "instagram",
					profileUrl: "https://instagram.com/acme",
					username: "acme",
					niche: "fitness",
				}),
			).rejects.toThrow("Platform not supported");
		});

		it("rejects duplicate (projectId, platform, username)", async () => {
			await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "https://tiktok.com/@acme",
				username: "acme",
				niche: "fitness",
			});
			await expect(
				service.create(workspaceId, projectId, userId, {
					platform: "tiktok",
					profileUrl: "https://tiktok.com/@acme",
					username: "acme",
					niche: "fitness",
				}),
			).rejects.toThrow("already exists");
		});
	});

	describe("list", () => {
		it("excludes archived by default", async () => {
			const a = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u1",
				username: "u1",
				niche: "n",
			});
			await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u2",
				username: "u2",
				niche: "n",
			});
			await service.archive(a.id);

			const rows = await service.list(projectId);
			expect(rows).toHaveLength(1);
			expect(rows[0].username).toBe("u2");
		});

		it("includes archived when filter set", async () => {
			const a = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u1",
				username: "u1",
				niche: "n",
			});
			await service.archive(a.id);

			const rows = await service.list(projectId, { includeArchived: true });
			expect(rows).toHaveLength(1);
		});
	});

	describe("archive", () => {
		it("sets archivedAt but keeps record", async () => {
			const created = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "url",
				username: "u",
				niche: "n",
			});
			const archived = await service.archive(created.id);
			expect(archived.archivedAt).toBeInstanceOf(Date);
			const still = await service.get(created.id);
			expect(still.id).toBe(created.id);
		});
	});

	describe("refreshEnrichment", () => {
		it("flips status back to pending and re-enqueues", async () => {
			const created = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "url",
				username: "u",
				niche: "n",
			});
			// Simulate a previous enrichment completed.
			await repo.updateEnrichment(created.id, {
				enrichmentStatus: "enriched",
				followerCount: 1000,
			});
			bossCalls.length = 0;

			const refreshed = await service.refreshEnrichment(created.id);

			expect(refreshed.enrichmentStatus).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("creator-enrichment");
		});
	});
});
```

- [ ] **Step 2: Run the test and verify it FAILS (the service doesn't exist yet)**

Run: `cd backend && bun test tests/services/creator.service.test.ts`

Expected: FAIL — `Cannot find module '../../src/services/creator.service'` or similar.

- [ ] **Step 3: Commit the failing test**

```bash
git add backend/tests/services/creator.service.test.ts
git commit -m "test(creator): add failing service tests"
```

---

### Task 3.3: Creator service implementation

**Files:**
- Create: `backend/src/services/creator.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import type { Creator } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { ICreatorService } from "../interfaces/services/creator.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../types/competitor-analyzer.types";

const SUPPORTED_PLATFORMS_V1 = new Set(["tiktok"]);

export class CreatorService implements ICreatorService {
	constructor(
		private creatorRepository: ICreatorRepository,
		private boss: PgBoss,
		private logger: ILogger,
	) {}

	async create(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreateCreatorInput,
	): Promise<Creator> {
		if (!SUPPORTED_PLATFORMS_V1.has(input.platform)) {
			throw new Error(`Platform not supported in v1: ${input.platform}`);
		}

		const cleanUsername = input.username.trim().replace(/^@/, "");
		if (!cleanUsername) throw new Error("Username is required");

		const exists = await this.creatorRepository.existsByUsername(
			projectId,
			input.platform,
			cleanUsername,
		);
		if (exists) {
			throw new Error(`Creator @${cleanUsername} already exists on ${input.platform}`);
		}

		const creator = await this.creatorRepository.create({
			workspaceId,
			projectId,
			createdBy: userId,
			input: { ...input, username: cleanUsername },
		});

		await this.boss.send("creator-enrichment", { creatorId: creator.id });
		this.logger.info("Creator created and enrichment enqueued", {
			creatorId: creator.id,
			platform: creator.platform,
		});

		return creator;
	}

	async list(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		return this.creatorRepository.findByProject(projectId, filters);
	}

	async get(id: string): Promise<Creator> {
		const creator = await this.creatorRepository.findById(id);
		if (!creator) throw new Error("Creator not found");
		return creator;
	}

	async update(id: string, input: UpdateCreatorInput): Promise<Creator> {
		await this.get(id); // throws if missing
		return this.creatorRepository.update(id, input);
	}

	async archive(id: string): Promise<Creator> {
		await this.get(id);
		return this.creatorRepository.archive(id);
	}

	async refreshEnrichment(id: string): Promise<Creator> {
		await this.get(id);
		const updated = await this.creatorRepository.updateEnrichment(id, {
			enrichmentStatus: "pending",
			enrichmentError: null,
		});
		await this.boss.send("creator-enrichment", { creatorId: id });
		this.logger.info("Creator enrichment refresh enqueued", { creatorId: id });
		return updated;
	}
}
```

- [ ] **Step 2: Run the test and verify it PASSES**

Run: `cd backend && bun test tests/services/creator.service.test.ts`

Expected: `✓ 7 pass`, `0 fail`.

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/creator.service.ts
git commit -m "feat(service): creator CRUD + enrichment trigger"
```

---

### Task 3.4: Analysis Config service interface + tests

**Files:**
- Create: `backend/src/interfaces/services/analysis-config.service.interface.ts`
- Create: `backend/tests/services/analysis-config.service.test.ts`

- [ ] **Step 1: Write the interface**

```typescript
// backend/src/interfaces/services/analysis-config.service.interface.ts
import type { AnalysisConfig } from "@prisma/client";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../types/competitor-analyzer.types";

export interface IAnalysisConfigService {
	create(
		workspaceId: string,
		projectId: string,
		input: CreateAnalysisConfigInput,
	): Promise<AnalysisConfig>;
	list(projectId: string): Promise<AnalysisConfigWithCreators[]>;
	get(id: string): Promise<AnalysisConfigWithCreators>;
	update(id: string, input: UpdateAnalysisConfigInput): Promise<AnalysisConfig>;
	delete(id: string): Promise<void>;
	replaceCreators(configId: string, creatorIds: string[], projectId: string): Promise<void>;
	removeCreator(configId: string, creatorId: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing tests**

```typescript
// backend/tests/services/analysis-config.service.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { AnalysisConfigService } from "../../src/services/analysis-config.service";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("AnalysisConfigService", () => {
	const configRepo = new MockAnalysisConfigRepository();
	const creatorRepo = new MockCreatorRepository();
	const service = new AnalysisConfigService(configRepo, creatorRepo, mockLogger);
	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();

	afterEach(() => {
		configRepo.clear();
		creatorRepo.clear();
	});

	describe("create", () => {
		it("requires name and brandContext", async () => {
			await expect(
				service.create(workspaceId, projectId, userId, {
					name: "",
					brandContext: "ctx",
					analysisInstructions: "do it",
					outputPreferences: "3 scripts",
				}),
			).rejects.toThrow("Name is required");

			await expect(
				service.create(workspaceId, projectId, userId, {
					name: "my config",
					brandContext: "",
					analysisInstructions: "do it",
					outputPreferences: "3 scripts",
				}),
			).rejects.toThrow("Brand context is required");
		});

		it("creates with trimmed values", async () => {
			const c = await service.create(workspaceId, projectId, userId, {
				name: "  Test  ",
				brandContext: "  ctx  ",
				analysisInstructions: "instr",
				outputPreferences: "prefs",
			});
			expect(c.name).toBe("Test");
			expect(c.brandContext).toBe("ctx");
		});
	});

	describe("replaceCreators", () => {
		it("rejects creators that don't belong to the project", async () => {
			const c = await service.create(workspaceId, projectId, userId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			// Creator belongs to a DIFFERENT project.
			const otherProjectId = crypto.randomUUID();
			const stray = await creatorRepo.create({
				workspaceId,
				projectId: otherProjectId,
				input: {
					platform: "tiktok",
					profileUrl: "u",
					username: "stray",
					niche: "x",
				},
			});
			await expect(service.replaceCreators(c.id, [stray.id], projectId)).rejects.toThrow(
				"do not belong to this project",
			);
		});

		it("replaces membership atomically", async () => {
			const c = await service.create(workspaceId, projectId, userId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			const a = await creatorRepo.create({
				workspaceId,
				projectId,
				input: { platform: "tiktok", profileUrl: "u1", username: "a", niche: "x" },
			});
			const b = await creatorRepo.create({
				workspaceId,
				projectId,
				input: { platform: "tiktok", profileUrl: "u2", username: "b", niche: "x" },
			});

			await service.replaceCreators(c.id, [a.id, b.id], projectId);
			expect(configRepo.joinRows.filter((j) => j.configId === c.id)).toHaveLength(2);

			await service.replaceCreators(c.id, [a.id], projectId);
			const rows = configRepo.joinRows.filter((j) => j.configId === c.id);
			expect(rows).toHaveLength(1);
			expect(rows[0].creatorId).toBe(a.id);
		});
	});

	describe("delete", () => {
		it("deletes the config (runs survive via SetNull — DB-level concern, not service)", async () => {
			const c = await service.create(workspaceId, projectId, userId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			await service.delete(c.id);
			await expect(service.get(c.id)).rejects.toThrow("not found");
		});
	});
});
```

- [ ] **Step 3: Run tests, verify FAIL**

Run: `cd backend && bun test tests/services/analysis-config.service.test.ts`
Expected: FAIL (no service yet).

- [ ] **Step 4: Commit failing tests**

```bash
git add backend/src/interfaces/services/analysis-config.service.interface.ts backend/tests/services/analysis-config.service.test.ts
git commit -m "test(analysis-config): add failing tests + interface"
```

---

### Task 3.5: Analysis Config service implementation

**Files:**
- Create: `backend/src/services/analysis-config.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import type { AnalysisConfig } from "@prisma/client";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { IAnalysisConfigService } from "../interfaces/services/analysis-config.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../types/competitor-analyzer.types";

export class AnalysisConfigService implements IAnalysisConfigService {
	constructor(
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private logger: ILogger,
	) {}

	async create(
		workspaceId: string,
		projectId: string,
		input: CreateAnalysisConfigInput,
	): Promise<AnalysisConfig> {
		const name = input.name.trim();
		const brandContext = input.brandContext.trim();
		if (!name) throw new Error("Name is required");
		if (!brandContext) throw new Error("Brand context is required");
		if (!input.analysisInstructions.trim()) throw new Error("Analysis instructions required");
		if (!input.outputPreferences.trim()) throw new Error("Output preferences required");

		return this.configRepository.create({
			workspaceId,
			projectId,
			input: {
				name,
				targetNiche: input.targetNiche?.trim() || undefined,
				brandContext,
				analysisInstructions: input.analysisInstructions.trim(),
				outputPreferences: input.outputPreferences.trim(),
			},
		});
	}

	async list(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		return this.configRepository.findByProject(projectId);
	}

	async get(id: string): Promise<AnalysisConfigWithCreators> {
		const config = await this.configRepository.findById(id);
		if (!config) throw new Error("Config not found");
		return config;
	}

	async update(id: string, input: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		await this.get(id);
		return this.configRepository.update(id, input);
	}

	async delete(id: string): Promise<void> {
		await this.get(id);
		await this.configRepository.delete(id);
	}

	async replaceCreators(configId: string, creatorIds: string[], projectId: string): Promise<void> {
		await this.get(configId);

		if (creatorIds.length === 0) {
			await this.configRepository.replaceCreators(configId, []);
			return;
		}

		const creators = await this.creatorRepository.findByIds(creatorIds);
		const belongToProject = creators.every((c) => c.projectId === projectId);
		if (!belongToProject || creators.length !== creatorIds.length) {
			throw new Error("One or more creators do not belong to this project");
		}

		await this.configRepository.replaceCreators(configId, creatorIds);
		this.logger.info("Config creators replaced", {
			configId,
			count: creatorIds.length,
		});
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		await this.get(configId);
		await this.configRepository.removeCreator(configId, creatorId);
	}
}
```

- [ ] **Step 2: Run tests, verify PASS**

Run: `cd backend && bun test tests/services/analysis-config.service.test.ts`
Expected: all pass.

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/analysis-config.service.ts
git commit -m "feat(service): analysis config CRUD + creator linkage"
```

---

### Task 3.6: Competitor Pipeline service interface + tests

**Files:**
- Create: `backend/src/interfaces/services/competitor-pipeline.service.interface.ts`
- Create: `backend/tests/services/competitor-pipeline.service.test.ts`

- [ ] **Step 1: Write the interface**

```typescript
// backend/src/interfaces/services/competitor-pipeline.service.interface.ts
import type { CompetitorPipelineRun } from "@prisma/client";
import type {
	CreatePipelineRunInput,
	PipelineRunWithVideosAndScripts,
} from "../../types/competitor-analyzer.types";

export interface ICompetitorPipelineService {
	createRun(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreatePipelineRunInput,
	): Promise<CompetitorPipelineRun>;
	listRuns(projectId: string): Promise<CompetitorPipelineRun[]>;
	getRun(id: string): Promise<PipelineRunWithVideosAndScripts>;
	cancelRun(id: string): Promise<CompetitorPipelineRun>;
}
```

- [ ] **Step 2: Write failing tests**

```typescript
// backend/tests/services/competitor-pipeline.service.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { CompetitorPipelineService } from "../../src/services/competitor-pipeline.service";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockCompetitorPipelineRepository } from "../helpers/mock-competitor-pipeline.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CompetitorPipelineService", () => {
	const pipelineRepo = new MockCompetitorPipelineRepository();
	const configRepo = new MockAnalysisConfigRepository();
	const creatorRepo = new MockCreatorRepository();
	const bossCalls: Array<{ queue: string; data: any; opts?: any }> = [];
	const boss = {
		send: async (queue: string, data: any, opts?: any) => {
			bossCalls.push({ queue, data, opts });
			return "job-id";
		},
	} as any;

	// Apify key lookup: the service needs a way to verify the workspace has a key.
	// We pass a simple lookup function.
	const apifyKeys = new Map<string, string>();
	const apifyKeyLookup = async (wsId: string) => apifyKeys.get(wsId) ?? null;

	const service = new CompetitorPipelineService(
		pipelineRepo,
		configRepo,
		creatorRepo,
		boss,
		apifyKeyLookup,
		mockLogger,
	);

	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		pipelineRepo.clear();
		configRepo.clear();
		creatorRepo.clear();
		bossCalls.length = 0;
		apifyKeys.clear();
	});

	async function seedConfigWithCreator(): Promise<{ configId: string; creatorId: string }> {
		const config = await configRepo.create({
			workspaceId,
			projectId,
			input: {
				name: "Fitness config",
				brandContext: "ctx",
				analysisInstructions: "instr",
				outputPreferences: "3 scripts",
			},
		});
		const creator = await creatorRepo.create({
			workspaceId,
			projectId,
			input: { platform: "tiktok", profileUrl: "u", username: "c1", niche: "fitness" },
		});
		configRepo.creatorStore = creatorRepo.creators;
		configRepo.joinRows.push({ configId: config.id, creatorId: creator.id });
		return { configId: config.id, creatorId: creator.id };
	}

	describe("createRun", () => {
		it("fails fast if workspace has no Apify key", async () => {
			const { configId } = await seedConfigWithCreator();
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("Apify API key not configured");
		});

		it("fails if config has no creators", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const config = await configRepo.create({
				workspaceId,
				projectId,
				input: {
					name: "empty",
					brandContext: "b",
					analysisInstructions: "i",
					outputPreferences: "o",
				},
			});
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId: config.id,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("at least one creator");
		});

		it("rejects out-of-range inputs", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 0,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("videosPerCreator");
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 1,
					timeframeDays: 30,
				}),
			).rejects.toThrow("lookbackPool");
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 500,
				}),
			).rejects.toThrow("timeframeDays");
		});

		it("creates a pending run and enqueues the job", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			expect(run.status).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("competitor-pipeline");
			expect(bossCalls[0].data).toEqual({ runId: run.id });
			expect(bossCalls[0].opts).toEqual({ expireInSeconds: 1800 });
		});
	});

	describe("cancelRun", () => {
		it("flips status from pending to cancelling", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			const cancelled = await service.cancelRun(run.id);
			expect(cancelled.status).toBe("cancelling");
		});

		it("refuses to cancel a terminal run", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			await pipelineRepo.updateRun(run.id, { status: "completed" });
			await expect(service.cancelRun(run.id)).rejects.toThrow("terminal");
		});
	});
});
```

- [ ] **Step 3: Run tests, verify FAIL**

Run: `cd backend && bun test tests/services/competitor-pipeline.service.test.ts`
Expected: FAIL — service doesn't exist.

- [ ] **Step 4: Commit failing tests**

```bash
git add backend/src/interfaces/services/competitor-pipeline.service.interface.ts backend/tests/services/competitor-pipeline.service.test.ts
git commit -m "test(pipeline): add failing pipeline service tests"
```

---

### Task 3.7: Competitor Pipeline service implementation

**Files:**
- Create: `backend/src/services/competitor-pipeline.service.ts`

- [ ] **Step 1: Write the service**

```typescript
import type { CompetitorPipelineRun } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { ICompetitorPipelineService } from "../interfaces/services/competitor-pipeline.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import {
	PIPELINE_INPUT_LIMITS,
	PIPELINE_TERMINAL_STATUSES,
	type CreatePipelineRunInput,
	type PipelineRunWithVideosAndScripts,
} from "../types/competitor-analyzer.types";

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

export class CompetitorPipelineService implements ICompetitorPipelineService {
	constructor(
		private pipelineRepository: ICompetitorPipelineRepository,
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private boss: PgBoss,
		private apifyKeyLookup: ApifyKeyLookup,
		private logger: ILogger,
	) {}

	async createRun(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreatePipelineRunInput,
	): Promise<CompetitorPipelineRun> {
		// 1. Validate input ranges.
		this.validateInputRanges(input);

		// 2. Workspace must have an Apify key.
		const apifyKey = await this.apifyKeyLookup(workspaceId);
		if (!apifyKey) {
			throw new Error("Apify API key not configured. Set it in workspace settings.");
		}

		// 3. Config must exist, belong to project, and have ≥1 non-archived creator.
		const config = await this.configRepository.findById(input.configId);
		if (!config) throw new Error("Config not found");
		if (config.projectId !== projectId) throw new Error("Config does not belong to this project");
		const activeCreators = config.creators.filter((c) => c.archivedAt === null);
		if (activeCreators.length === 0) {
			throw new Error("Config must have at least one creator to run a pipeline");
		}

		// 4. Create the run record.
		const run = await this.pipelineRepository.createRun({
			workspaceId,
			projectId,
			configId: input.configId,
			userId,
			videosPerCreator: input.videosPerCreator,
			lookbackPool: input.lookbackPool,
			timeframeDays: input.timeframeDays,
		});

		// 5. Enqueue — 30 min expiration budget.
		await this.boss.send(
			"competitor-pipeline",
			{ runId: run.id },
			{ expireInSeconds: 1800 },
		);

		this.logger.info("Competitor pipeline run enqueued", {
			runId: run.id,
			projectId,
			configId: input.configId,
			creatorCount: activeCreators.length,
		});

		return run;
	}

	async listRuns(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.pipelineRepository.findRunsByProject(projectId);
	}

	async getRun(id: string): Promise<PipelineRunWithVideosAndScripts> {
		const run = await this.pipelineRepository.findRunById(id);
		if (!run) throw new Error("Run not found");
		return run;
	}

	async cancelRun(id: string): Promise<CompetitorPipelineRun> {
		const run = await this.pipelineRepository.findRunById(id);
		if (!run) throw new Error("Run not found");
		if (PIPELINE_TERMINAL_STATUSES.has(run.status)) {
			throw new Error("Cannot cancel a run already in a terminal state");
		}
		return this.pipelineRepository.updateRun(id, { status: "cancelling" });
	}

	private validateInputRanges(input: CreatePipelineRunInput): void {
		const {
			videosPerCreatorMin,
			videosPerCreatorMax,
			lookbackPoolMin,
			lookbackPoolMax,
			timeframeDaysMin,
			timeframeDaysMax,
		} = PIPELINE_INPUT_LIMITS;

		if (input.videosPerCreator < videosPerCreatorMin || input.videosPerCreator > videosPerCreatorMax) {
			throw new Error(
				`videosPerCreator must be between ${videosPerCreatorMin} and ${videosPerCreatorMax}`,
			);
		}
		if (input.lookbackPool < lookbackPoolMin || input.lookbackPool > lookbackPoolMax) {
			throw new Error(
				`lookbackPool must be between ${lookbackPoolMin} and ${lookbackPoolMax}`,
			);
		}
		if (input.timeframeDays < timeframeDaysMin || input.timeframeDays > timeframeDaysMax) {
			throw new Error(
				`timeframeDays must be between ${timeframeDaysMin} and ${timeframeDaysMax}`,
			);
		}
	}
}
```

- [ ] **Step 2: Run tests, verify PASS**

Run: `cd backend && bun test tests/services/competitor-pipeline.service.test.ts`
Expected: all pass.

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/competitor-pipeline.service.ts
git commit -m "feat(service): competitor pipeline create/list/get/cancel"
```

---

## Phase 4 — Parsers, Test Fixtures, and the Enrichment Job

Before we build the pipeline job (big), we need: the TikTok profile parser, test fixtures captured from real Apify/Gemini responses, and the simpler enrichment job.

---

### Task 4.1: Test fixtures

**Files:**
- Create: `backend/tests/fixtures/competitor/tiktok-profile-response.json`
- Create: `backend/tests/fixtures/competitor/tiktok-videos-response.json`
- Create: `backend/tests/fixtures/competitor/gemini-video-analysis.json`
- Create: `backend/tests/fixtures/competitor/gemini-scripts.json`

- [ ] **Step 1: Create fixture — TikTok profile response**

Create `backend/tests/fixtures/competitor/tiktok-profile-response.json`. Content is an array of items (the clockworks scraper always returns ≥1 video item per profile). We model ONE item with `authorMeta` + `authorStats` fields the parser reads:

```json
[
  {
    "id": "7321234567890123456",
    "text": "sample caption",
    "createTime": 1711584000,
    "webVideoUrl": "https://www.tiktok.com/@acme/video/7321234567890123456",
    "authorMeta": {
      "id": "user123",
      "name": "acme",
      "nickName": "Acme Fitness",
      "signature": "We help you get stronger.",
      "avatar": "https://p16-sign-va.tiktokcdn.com/acme_avatar.jpg"
    },
    "authorStats": {
      "followerCount": 125000,
      "followingCount": 42,
      "heart": 3100000,
      "videoCount": 218
    }
  }
]
```

- [ ] **Step 2: Create fixture — TikTok videos response (20 videos, varied dates and views)**

Create `backend/tests/fixtures/competitor/tiktok-videos-response.json`. Use a small generator inline: copy this content verbatim (20 items covering recent + stale + high/low view counts):

```json
[
  { "id": "v1",  "text": "Viral hook 1",  "createTime": 1711584000, "webVideoUrl": "https://tiktok.com/@acme/video/v1",  "playCount": 2500000, "diggCount": 120000, "shareCount": 8000, "commentCount": 4200, "hashtags": [{ "name": "fitness" }, { "name": "gym" }], "musicMeta": { "musicName": "Pump It" }, "videoMeta": { "downloadAddr": "https://tiktok.cdn/v1.mp4" }, "covers": { "default": "https://tiktok.cdn/v1.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v2",  "text": "Viral hook 2",  "createTime": 1711497600, "webVideoUrl": "https://tiktok.com/@acme/video/v2",  "playCount": 1800000, "diggCount": 90000,  "shareCount": 5000, "commentCount": 3100, "hashtags": [{ "name": "workout" }], "musicMeta": { "musicName": "Go" }, "videoMeta": { "downloadAddr": "https://tiktok.cdn/v2.mp4" }, "covers": { "default": "https://tiktok.cdn/v2.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v3",  "text": "Mid video",     "createTime": 1711411200, "webVideoUrl": "https://tiktok.com/@acme/video/v3",  "playCount": 420000,  "diggCount": 21000,  "shareCount": 1200, "commentCount": 800,  "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v3.mp4" }, "covers": { "default": "https://tiktok.cdn/v3.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v4",  "text": "Tip video",     "createTime": 1711324800, "webVideoUrl": "https://tiktok.com/@acme/video/v4",  "playCount": 210000,  "diggCount": 10000,  "shareCount": 600,  "commentCount": 400,  "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v4.mp4" }, "covers": { "default": "https://tiktok.cdn/v4.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v5",  "text": "Mid ok",        "createTime": 1711238400, "webVideoUrl": "https://tiktok.com/@acme/video/v5",  "playCount": 150000,  "diggCount": 7500,   "shareCount": 500,  "commentCount": 300,  "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v5.mp4" }, "covers": { "default": "https://tiktok.cdn/v5.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v6",  "text": "Low",           "createTime": 1711152000, "webVideoUrl": "https://tiktok.com/@acme/video/v6",  "playCount": 80000,   "diggCount": 4000,   "shareCount": 200,  "commentCount": 150,  "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v6.mp4" }, "covers": { "default": "https://tiktok.cdn/v6.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v7",  "text": "Low",           "createTime": 1711065600, "webVideoUrl": "https://tiktok.com/@acme/video/v7",  "playCount": 45000,   "diggCount": 2200,   "shareCount": 100,  "commentCount": 80,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v7.mp4" }, "covers": { "default": "https://tiktok.cdn/v7.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v8",  "text": "Stale viral",   "createTime": 1693526400, "webVideoUrl": "https://tiktok.com/@acme/video/v8",  "playCount": 5000000, "diggCount": 240000, "shareCount": 20000, "commentCount": 9000, "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v8.mp4" }, "covers": { "default": "https://tiktok.cdn/v8.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v9",  "text": "Stale",         "createTime": 1693440000, "webVideoUrl": "https://tiktok.com/@acme/video/v9",  "playCount": 100000,  "diggCount": 5000,   "shareCount": 300,  "commentCount": 200,  "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v9.mp4" }, "covers": { "default": "https://tiktok.cdn/v9.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v10", "text": "Fresh low",     "createTime": 1710979200, "webVideoUrl": "https://tiktok.com/@acme/video/v10", "playCount": 20000,   "diggCount": 1000,   "shareCount": 40,   "commentCount": 30,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v10.mp4" }, "covers": { "default": "https://tiktok.cdn/v10.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v11", "text": "f",             "createTime": 1710892800, "webVideoUrl": "https://tiktok.com/@acme/video/v11", "playCount": 18000,   "diggCount": 800,    "shareCount": 30,   "commentCount": 20,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v11.mp4" }, "covers": { "default": "https://tiktok.cdn/v11.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v12", "text": "f",             "createTime": 1710806400, "webVideoUrl": "https://tiktok.com/@acme/video/v12", "playCount": 16000,   "diggCount": 700,    "shareCount": 25,   "commentCount": 18,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v12.mp4" }, "covers": { "default": "https://tiktok.cdn/v12.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v13", "text": "f",             "createTime": 1710720000, "webVideoUrl": "https://tiktok.com/@acme/video/v13", "playCount": 14000,   "diggCount": 600,    "shareCount": 20,   "commentCount": 15,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v13.mp4" }, "covers": { "default": "https://tiktok.cdn/v13.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v14", "text": "f",             "createTime": 1710633600, "webVideoUrl": "https://tiktok.com/@acme/video/v14", "playCount": 12000,   "diggCount": 500,    "shareCount": 18,   "commentCount": 12,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v14.mp4" }, "covers": { "default": "https://tiktok.cdn/v14.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v15", "text": "f",             "createTime": 1710547200, "webVideoUrl": "https://tiktok.com/@acme/video/v15", "playCount": 10000,   "diggCount": 400,    "shareCount": 15,   "commentCount": 10,   "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v15.mp4" }, "covers": { "default": "https://tiktok.cdn/v15.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v16", "text": "f",             "createTime": 1710460800, "webVideoUrl": "https://tiktok.com/@acme/video/v16", "playCount": 8000,    "diggCount": 300,    "shareCount": 10,   "commentCount": 8,    "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v16.mp4" }, "covers": { "default": "https://tiktok.cdn/v16.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v17", "text": "f",             "createTime": 1710374400, "webVideoUrl": "https://tiktok.com/@acme/video/v17", "playCount": 6000,    "diggCount": 200,    "shareCount": 8,    "commentCount": 6,    "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v17.mp4" }, "covers": { "default": "https://tiktok.cdn/v17.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v18", "text": "f",             "createTime": 1710288000, "webVideoUrl": "https://tiktok.com/@acme/video/v18", "playCount": 5000,    "diggCount": 150,    "shareCount": 6,    "commentCount": 5,    "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v18.mp4" }, "covers": { "default": "https://tiktok.cdn/v18.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v19", "text": "f",             "createTime": 1710201600, "webVideoUrl": "https://tiktok.com/@acme/video/v19", "playCount": 4000,    "diggCount": 100,    "shareCount": 4,    "commentCount": 4,    "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v19.mp4" }, "covers": { "default": "https://tiktok.cdn/v19.jpg" }, "authorMeta": { "name": "acme" } },
  { "id": "v20", "text": "f",             "createTime": 1710115200, "webVideoUrl": "https://tiktok.com/@acme/video/v20", "playCount": 3000,    "diggCount": 80,     "shareCount": 3,    "commentCount": 3,    "hashtags": [], "videoMeta": { "downloadAddr": "https://tiktok.cdn/v20.mp4" }, "covers": { "default": "https://tiktok.cdn/v20.jpg" }, "authorMeta": { "name": "acme" } }
]
```

- [ ] **Step 3: Create fixture — Gemini video analysis response**

Create `backend/tests/fixtures/competitor/gemini-video-analysis.json`:

```json
{
  "hook": "Opens with a loud sound and a close-up of a kettlebell swing — grabs attention in under 1 second.",
  "retentionMechanisms": [
    "Rapid cuts every 1.5 seconds",
    "Text overlay asks a question at 0:03 to keep viewer watching for the answer",
    "Reveal at 0:11 resolves the question"
  ],
  "pacingNotes": "Very fast cuts front-loaded; slows in the middle reveal; fast cuts again at the end to drive CTA.",
  "onScreenText": ["How do you get strong arms?", "Do THIS for 30 days", "Save this!"],
  "audioStyle": "Upbeat hip-hop track at 140 BPM; voice-over in punchy short sentences.",
  "whyItWentViral": "Combines an instantly visible workout result with a clear, actionable 30-day promise — triggers both curiosity and skepticism, boosting comments and saves.",
  "ctaAnalysis": "Soft CTA 'Save this!' rather than 'Follow me' — higher save-rate which the algorithm rewards."
}
```

- [ ] **Step 4: Create fixture — Gemini scripts response**

Create `backend/tests/fixtures/competitor/gemini-scripts.json`:

```json
[
  {
    "scriptNumber": 1,
    "title": "Kettlebell 30-Day Challenge",
    "hook": "You only need one kettlebell to change your arms in 30 days.",
    "body": "Day 1–10: 50 swings a day. Day 11–20: add 20 Turkish get-ups. Day 21–30: finisher sets. Form tips on each day.",
    "broll": [
      { "scene": "0:00–0:02", "description": "Close-up of kettlebell slamming into frame." },
      { "scene": "0:02–0:08", "description": "Quick cuts of each exercise." },
      { "scene": "0:08–0:12", "description": "Before/after shot of trainer." }
    ],
    "cta": "Save this for Day 1."
  },
  {
    "scriptNumber": 2,
    "title": "The 3-Move Arm Finisher",
    "hook": "If your arms aren't growing, you're skipping THIS.",
    "body": "Three unconventional arm moves: bottom-half curls, isometric holds, eccentric extensions. 3 sets each, twice a week.",
    "broll": [
      { "scene": "0:00–0:03", "description": "Trainer pointing at triceps." },
      { "scene": "0:03–0:15", "description": "Demo of each move." }
    ],
    "cta": "Follow for part 2."
  },
  {
    "scriptNumber": 3,
    "title": "Why Your Form Is Wrong",
    "hook": "Stop doing curls like this.",
    "body": "Common curl mistake demonstration, then fix. Emphasise wrist and elbow alignment.",
    "broll": [
      { "scene": "0:00–0:02", "description": "Wrong form in slow-mo." },
      { "scene": "0:02–0:10", "description": "Correct form in slow-mo with arrows." }
    ],
    "cta": "Share with a gym buddy."
  }
]
```

- [ ] **Step 5: Commit fixtures**

```bash
git add backend/tests/fixtures/competitor/
git commit -m "test(fixtures): competitor analyzer sample responses"
```

---

### Task 4.2: TikTok profile parser (for enrichment)

**Files:**
- Create: `backend/src/providers/apify-parsers/tiktok-profile.parser.ts`
- Create: `backend/tests/parsers/tiktok-profile.parser.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/parsers/tiktok-profile.parser.test.ts
import { describe, expect, it } from "bun:test";
import fixtureProfile from "../fixtures/competitor/tiktok-profile-response.json";
import { TikTokProfileParser } from "../../src/providers/apify-parsers/tiktok-profile.parser";

describe("TikTokProfileParser", () => {
	const parser = new TikTokProfileParser();

	it("extracts profile fields from the first item's authorMeta + authorStats", () => {
		const profile = parser.parse(fixtureProfile as any);
		expect(profile).toEqual({
			username: "acme",
			displayName: "Acme Fitness",
			avatarUrl: "https://p16-sign-va.tiktokcdn.com/acme_avatar.jpg",
			followerCount: 125000,
			bio: "We help you get stronger.",
			platformMetadata: {
				videoCount: 218,
				followingCount: 42,
				totalHearts: 3100000,
			},
		});
	});

	it("returns null when no items", () => {
		expect(parser.parse([])).toBeNull();
	});

	it("handles missing stats gracefully (private/deleted account)", () => {
		const profile = parser.parse([
			{
				authorMeta: { name: "u", nickName: "U" },
			},
		] as any);
		expect(profile).toEqual({
			username: "u",
			displayName: "U",
			avatarUrl: null,
			followerCount: null,
			bio: null,
			platformMetadata: {
				videoCount: null,
				followingCount: null,
				totalHearts: null,
			},
		});
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `cd backend && bun test tests/parsers/tiktok-profile.parser.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the parser**

```typescript
// backend/src/providers/apify-parsers/tiktok-profile.parser.ts
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedTikTokProfile {
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	followerCount: number | null;
	bio: string | null;
	platformMetadata: {
		videoCount: number | null;
		followingCount: number | null;
		totalHearts: number | null;
	};
}

export class TikTokProfileParser {
	parse(rawItems: ApifyResultItem[]): ParsedTikTokProfile | null {
		if (!rawItems || rawItems.length === 0) return null;
		const first = rawItems[0];
		const meta = first.authorMeta ?? {};
		const stats = first.authorStats ?? {};

		const username = meta.name ?? null;
		if (!username) return null;

		return {
			username,
			displayName: meta.nickName ?? null,
			avatarUrl: meta.avatar ?? null,
			followerCount: stats.followerCount ?? null,
			bio: meta.signature ?? null,
			platformMetadata: {
				videoCount: stats.videoCount ?? null,
				followingCount: stats.followingCount ?? null,
				totalHearts: stats.heart ?? null,
			},
		};
	}
}
```

- [ ] **Step 4: Run tests, verify PASS**

Run: `cd backend && bun test tests/parsers/tiktok-profile.parser.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/providers/apify-parsers/tiktok-profile.parser.ts backend/tests/parsers/tiktok-profile.parser.test.ts
git commit -m "feat(parser): TikTok profile parser for enrichment"
```

---

### Task 4.3: Creator enrichment job — failing test

**Files:**
- Create: `backend/tests/jobs/creator-enrichment.job.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fixtureProfile from "../fixtures/competitor/tiktok-profile-response.json";
import { CreatorEnrichmentJob } from "../../src/jobs/creator-enrichment.job";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CreatorEnrichmentJob", () => {
	let creatorRepo: MockCreatorRepository;
	let apify: MockApifyProvider;
	let notifications: Array<{ userId: string; event: any }>;

	// ApifyKeyLookup signature matches the service.
	const apifyKeys = new Map<string, string>();

	beforeEach(() => {
		creatorRepo = new MockCreatorRepository();
		apify = new MockApifyProvider();
		notifications = [];
		apifyKeys.clear();
	});

	afterEach(() => {
		creatorRepo.clear();
	});

	function buildJob(): CreatorEnrichmentJob {
		const notifService = {
			notify: (userId: string, event: any) => notifications.push({ userId, event }),
		} as any;
		notifications.length = 0;
		// Override mock apify to return our fixture data from getRunResults.
		(apify as any).getRunResults = async () => fixtureProfile;

		return new CreatorEnrichmentJob(
			creatorRepo,
			apify,
			async (wsId: string) => apifyKeys.get(wsId) ?? null,
			notifService,
			mockLogger,
		);
	}

	it("fails fast when no Apify key", async () => {
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
		expect(after?.enrichmentError).toContain("Apify API key");
	});

	it("happy path: enriches with follower count + avatar + bio", async () => {
		apifyKeys.set("ws", "apify_test");
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("enriched");
		expect(after?.followerCount).toBe(125000);
		expect(after?.avatarUrl).toContain("acme_avatar");
		expect(after?.bio).toContain("stronger");
		expect(notifications[0]?.userId).toBe("user-1");
		expect(notifications[0]?.event?.type).toBe("creator_enrichment_completed");
	});

	it("marks as failed when Apify actor throws", async () => {
		apifyKeys.set("ws", "apify_test");
		apify.shouldFail = true;
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
		expect(after?.enrichmentError).toBeDefined();
	});

	it("marks as failed when profile parser returns null (no items)", async () => {
		apifyKeys.set("ws", "apify_test");
		(apify as any).getRunResults = async () => [];
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
	});
});
```

- [ ] **Step 2: Ensure jobs test dir exists**

Run: `mkdir -p backend/tests/jobs`
Expected: no output (or silent success).

- [ ] **Step 3: Run, verify FAIL**

Run: `cd backend && bun test tests/jobs/creator-enrichment.job.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Commit failing test**

```bash
git add backend/tests/jobs/creator-enrichment.job.test.ts
git commit -m "test(job): add failing creator enrichment tests"
```

---

### Task 4.4: Creator enrichment job implementation

**Files:**
- Create: `backend/src/jobs/creator-enrichment.job.ts`

- [ ] **Step 1: Write the job**

```typescript
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { TikTokProfileParser } from "../providers/apify-parsers/tiktok-profile.parser";

interface CreatorEnrichmentJobData {
	creatorId: string;
}

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

const APIFY_TIKTOK_ACTOR = "clockworks/free-tiktok-scraper";
const APIFY_POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 min
const APIFY_POLL_MAX_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export class CreatorEnrichmentJob {
	constructor(
		private creatorRepository: ICreatorRepository,
		private apifyProvider: IApifyProvider,
		private apifyKeyLookup: ApifyKeyLookup,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: CreatorEnrichmentJobData): Promise<void> {
		const { creatorId } = data;
		const start = Date.now();

		const creator = await this.creatorRepository.findById(creatorId);
		if (!creator) {
			this.logger.error("creator_enrichment_failed", {
				event: "ce_failed",
				creatorId,
				error: "Creator not found",
			});
			return;
		}

		const notifyTarget = creator.createdBy ?? creator.workspaceId;
		// ^ Fallback to workspaceId if a creator was seeded without a user (e.g.
		// from the seed script); NotificationService silently no-ops when no SSE
		// connection matches, which is fine for batch scripts.

		const apifyKey = await this.apifyKeyLookup(creator.workspaceId);
		if (!apifyKey) {
			await this.fail(creatorId, notifyTarget, "Apify API key not configured");
			return;
		}

		try {
			const { runId } = await this.apifyProvider.runActor(
				APIFY_TIKTOK_ACTOR,
				{ profiles: [creator.username], resultsPerPage: 1 },
				apifyKey,
			);

			// Poll for completion.
			let delay = 1000;
			const startPoll = Date.now();
			while (Date.now() - startPoll < APIFY_POLL_TIMEOUT_MS) {
				await sleep(delay);
				const status = await this.apifyProvider.getRunStatus(runId, apifyKey);
				if (status.status === "SUCCEEDED") break;
				if (status.status === "FAILED" || status.status === "ABORTED" || status.status === "TIMED-OUT") {
					await this.fail(creatorId, notifyTarget, `Apify actor ${status.status}`);
					return;
				}
				delay = Math.min(delay * 2, APIFY_POLL_MAX_DELAY_MS);
			}

			const items = await this.apifyProvider.getRunResults(runId, apifyKey);
			const profile = new TikTokProfileParser().parse(items);
			if (!profile) {
				await this.fail(
					creatorId,
					notifyTarget,
					"Profile not found — account may be private or deleted",
				);
				return;
			}

			await this.creatorRepository.updateEnrichment(creatorId, {
				enrichmentStatus: "enriched",
				enrichmentError: null,
				followerCount: profile.followerCount,
				avatarUrl: profile.avatarUrl,
				displayName: profile.displayName,
				bio: profile.bio,
				platformMetadata: profile.platformMetadata,
				lastEnrichedAt: new Date(),
			});

			this.notificationService.notify(notifyTarget, {
				type: "creator_enrichment_completed",
				data: { creatorId, status: "enriched" },
			});

			this.logger.info("creator_enrichment_completed", {
				event: "ce_completed",
				creatorId,
				durationMs: Date.now() - start,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await this.fail(creatorId, notifyTarget, msg);
		}
	}

	private async fail(creatorId: string, notifyTarget: string, error: string): Promise<void> {
		await this.creatorRepository.updateEnrichment(creatorId, {
			enrichmentStatus: "failed",
			enrichmentError: error,
			lastEnrichedAt: new Date(),
		});
		this.notificationService.notify(notifyTarget, {
			type: "creator_enrichment_completed",
			data: { creatorId, status: "failed" },
		});
		this.logger.error("creator_enrichment_failed", {
			event: "ce_failed",
			creatorId,
			error,
		});
	}
}
```

- [ ] **Step 2: Run, verify PASS**

Run: `cd backend && bun test tests/jobs/creator-enrichment.job.test.ts`
Expected: all pass.

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/jobs/creator-enrichment.job.ts
git commit -m "feat(job): creator enrichment async profile scrape"
```

---

## Phase 5 — Pipeline Job (Gemini Files API + Orchestration)

The heaviest task. We introduce a thin Gemini Files API wrapper, then build the 5-stage orchestrator.

---

### Task 5.1: Gemini video analyzer provider interface

**Files:**
- Create: `backend/src/interfaces/providers/video-analyzer.interface.ts`

- [ ] **Step 1: Write the interface**

```typescript
import type { VideoAnalysisResult, GeneratedScript } from "../../types/competitor-analyzer.types";

export interface VideoAnalyzerUsage {
	inputTokens: number;
	outputTokens: number;
}

export interface IVideoAnalyzer {
	/**
	 * Uploads `bytes` to Gemini's Files API, polls for ACTIVE, runs structured
	 * analysis, and deletes the file. Returns structured analysis.
	 *
	 * Throws on: download/upload errors, timeouts, malformed JSON response.
	 */
	analyzeVideo(params: {
		bytes: Uint8Array;
		mimeType: string;
		instructions: string;
	}): Promise<{ analysis: VideoAnalysisResult; usage: VideoAnalyzerUsage; systemPrompt: string; userPrompt: string }>;

	/**
	 * One call that takes all prior analyses + the Config's brand context and
	 * generates a list of scripts.
	 */
	generateScripts(params: {
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
		videoAnalyses: Array<{
			caption: string | null;
			viewCount: number | null;
			analysis: VideoAnalysisResult;
		}>;
	}): Promise<{ scripts: GeneratedScript[]; usage: VideoAnalyzerUsage; systemPrompt: string; userPrompt: string }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/interfaces/providers/video-analyzer.interface.ts
git commit -m "feat(interface): video analyzer (Gemini Files API)"
```

---

### Task 5.2: Gemini video analyzer provider implementation

**Files:**
- Create: `backend/src/providers/gemini-video.provider.ts`

- [ ] **Step 1: Write the provider**

This uses `@google/genai` (already a dependency — see existing `gemini.provider.ts`). The Files API flow: `ai.files.upload(...)` → poll `ai.files.get(name)` until `state === "ACTIVE"` → pass file reference in `generateContent`.

```typescript
import { GoogleGenAI } from "@google/genai";
import type {
	IVideoAnalyzer,
	VideoAnalyzerUsage,
} from "../interfaces/providers/video-analyzer.interface";
import type {
	GeneratedScript,
	VideoAnalysisResult,
} from "../types/competitor-analyzer.types";

const FILE_UPLOAD_ACTIVE_TIMEOUT_MS = 90_000;
const VIDEO_ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function parseJson(text: string): any {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
	else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
	if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
	return JSON.parse(cleaned.trim());
}

export class GeminiVideoAnalyzerProvider implements IVideoAnalyzer {
	public lastUsage: VideoAnalyzerUsage | null = null;

	private ai: GoogleGenAI;
	private model: string;

	constructor(apiKey: string, model: string) {
		this.ai = new GoogleGenAI({ apiKey });
		this.model = model;
	}

	async analyzeVideo(params: {
		bytes: Uint8Array;
		mimeType: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const { bytes, mimeType, instructions } = params;

		// 1. Upload.
		const file = await this.ai.files.upload({
			file: new Blob([bytes.slice()], { type: mimeType }),
			config: { mimeType },
		});
		const fileName = file.name!;

		try {
			// 2. Poll for ACTIVE.
			const startPoll = Date.now();
			let fileState = file.state;
			while (fileState !== "ACTIVE") {
				if (Date.now() - startPoll > FILE_UPLOAD_ACTIVE_TIMEOUT_MS) {
					throw new Error("Gemini file did not become ACTIVE within 90s");
				}
				await sleep(2000);
				const polled = await this.ai.files.get({ name: fileName });
				fileState = polled.state;
				if (fileState === "FAILED") throw new Error("Gemini file processing FAILED");
			}

			const systemPrompt = [
				"You are an expert social media video analyst.",
				"Analyze the uploaded video and respond with STRICT JSON matching the schema:",
				"{",
				'  "hook": string,',
				'  "retentionMechanisms": string[],',
				'  "pacingNotes": string,',
				'  "onScreenText": string[],',
				'  "audioStyle": string,',
				'  "whyItWentViral": string,',
				'  "ctaAnalysis": string',
				"}",
				"Do not include explanations outside the JSON. No markdown.",
			].join("\n");

			const userPrompt = instructions;

			// 3. Generate analysis with file reference.
			const result = await Promise.race([
				this.ai.models.generateContent({
					model: this.model,
					contents: [
						{
							role: "user",
							parts: [
								{ fileData: { mimeType, fileUri: file.uri! } },
								{ text: `${systemPrompt}\n\n${userPrompt}` },
							],
						},
					],
				}),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error("Gemini analysis timed out")), VIDEO_ANALYSIS_TIMEOUT_MS),
				),
			]);

			const response = result as any;
			const text = response.text ?? "";
			const analysis = parseJson(text) as VideoAnalysisResult;

			const usage: VideoAnalyzerUsage = {
				inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
				outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
			};
			this.lastUsage = usage;

			return { analysis, usage, systemPrompt, userPrompt };
		} finally {
			// 4. Delete the uploaded file to avoid storage bloat.
			try {
				await this.ai.files.delete({ name: fileName });
			} catch {
				/* ignore */
			}
		}
	}

	async generateScripts(params: {
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
		videoAnalyses: Array<{
			caption: string | null;
			viewCount: number | null;
			analysis: VideoAnalysisResult;
		}>;
	}): Promise<{
		scripts: GeneratedScript[];
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const systemPrompt = [
			"You are a senior creative strategist writing short-form social video scripts.",
			"Based on the competitor video analyses provided, generate scripts that match the brand context and output preferences.",
			"Respond with STRICT JSON array matching the schema:",
			"[{",
			'  "scriptNumber": number,',
			'  "title": string,',
			'  "hook": string,',
			'  "body": string,',
			'  "broll": [{"scene": string, "description": string}],',
			'  "cta": string',
			"}]",
			"No markdown, no prose outside the JSON.",
		].join("\n");

		const videoBlock = params.videoAnalyses
			.map(
				(v, i) =>
					`Video ${i + 1}: caption="${v.caption ?? ""}", views=${v.viewCount ?? "?"}\n` +
					`Analysis: ${JSON.stringify(v.analysis, null, 2)}`,
			)
			.join("\n\n---\n\n");

		const userPrompt = [
			`Brand Context: ${params.brandContext}`,
			`Analysis Instructions: ${params.analysisInstructions}`,
			`Output Preferences: ${params.outputPreferences}`,
			"",
			"Competitor video analyses:",
			videoBlock,
		].join("\n");

		const result = await this.ai.models.generateContent({
			model: this.model,
			contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
		});
		const response = result as any;
		const text = response.text ?? "";
		const scripts = parseJson(text) as GeneratedScript[];

		const usage: VideoAnalyzerUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastUsage = usage;

		return { scripts, usage, systemPrompt, userPrompt };
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean. If the `@google/genai` types don't expose `files.upload` the way shown, check the existing `gemini-image.provider.ts` for the canonical import shape. The library is version-sensitive — adjust the object parameter names if needed to match the installed version.

- [ ] **Step 3: Commit**

```bash
git add backend/src/providers/gemini-video.provider.ts
git commit -m "feat(provider): Gemini Files API video analyzer"
```

---

### Task 5.3: Mock video analyzer for tests

**Files:**
- Create: `backend/tests/helpers/mock-video-analyzer.ts`

- [ ] **Step 1: Write the mock**

```typescript
import type {
	IVideoAnalyzer,
	VideoAnalyzerUsage,
} from "../../src/interfaces/providers/video-analyzer.interface";
import type {
	GeneratedScript,
	VideoAnalysisResult,
} from "../../src/types/competitor-analyzer.types";

export class MockVideoAnalyzer implements IVideoAnalyzer {
	public analyzeCalls: Array<{ instructions: string; byteCount: number }> = [];
	public generateCalls: Array<{ videoCount: number }> = [];
	public analyzeFail: "once" | "always" | null = null;
	public scriptsFail: boolean = false;
	public cannedAnalysis: VideoAnalysisResult | null = null;
	public cannedScripts: GeneratedScript[] = [];

	async analyzeVideo(params: {
		bytes: Uint8Array;
		mimeType: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		this.analyzeCalls.push({ instructions: params.instructions, byteCount: params.bytes.byteLength });
		if (this.analyzeFail === "always") throw new Error("video analysis failed");
		if (this.analyzeFail === "once") {
			this.analyzeFail = null;
			throw new Error("video analysis failed");
		}
		if (!this.cannedAnalysis) throw new Error("MockVideoAnalyzer.cannedAnalysis not set");
		return {
			analysis: this.cannedAnalysis,
			usage: { inputTokens: 100, outputTokens: 200 },
			systemPrompt: "system",
			userPrompt: params.instructions,
		};
	}

	async generateScripts(params: any): Promise<{
		scripts: GeneratedScript[];
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		this.generateCalls.push({ videoCount: params.videoAnalyses.length });
		if (this.scriptsFail) throw new Error("script generation failed");
		return {
			scripts: this.cannedScripts,
			usage: { inputTokens: 300, outputTokens: 500 },
			systemPrompt: "system",
			userPrompt: "user",
		};
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/tests/helpers/mock-video-analyzer.ts
git commit -m "test(helpers): mock video analyzer"
```

---

### Task 5.4: Pipeline job test fixtures + helper

**Files:**
- Create: `backend/tests/helpers/mock-video-fetcher.ts`

The pipeline job downloads video bytes from the `contentUrl`. To keep tests hermetic, we inject a "video fetcher" function rather than calling `fetch` directly.

- [ ] **Step 1: Write the mock fetcher**

```typescript
export class MockVideoFetcher {
	public calls: string[] = [];
	public fail: boolean = false;
	public overLimit: boolean = false;
	public bytes: Uint8Array = new Uint8Array(1024);

	/**
	 * Signature matches the `VideoFetcher` type expected by CompetitorPipelineJob.
	 * Returns {bytes, mimeType} or throws on failure.
	 */
	fetcher = async (url: string): Promise<{ bytes: Uint8Array; mimeType: string }> => {
		this.calls.push(url);
		if (this.fail) throw new Error("video download failed");
		if (this.overLimit) throw new Error("video exceeds 50 MB cap");
		return { bytes: this.bytes, mimeType: "video/mp4" };
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/tests/helpers/mock-video-fetcher.ts
git commit -m "test(helpers): mock video fetcher"
```

---

### Task 5.5: Pipeline job — failing tests (happy path + 5 failure cases)

**Files:**
- Create: `backend/tests/jobs/competitor-pipeline.job.test.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fixtureAnalysis from "../fixtures/competitor/gemini-video-analysis.json";
import fixtureScripts from "../fixtures/competitor/gemini-scripts.json";
import fixtureVideos from "../fixtures/competitor/tiktok-videos-response.json";
import { CompetitorPipelineJob } from "../../src/jobs/competitor-pipeline.job";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockCompetitorPipelineRepository } from "../helpers/mock-competitor-pipeline.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";
import { MockVideoAnalyzer } from "../helpers/mock-video-analyzer";
import { MockVideoFetcher } from "../helpers/mock-video-fetcher";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CompetitorPipelineJob", () => {
	let pipelineRepo: MockCompetitorPipelineRepository;
	let configRepo: MockAnalysisConfigRepository;
	let creatorRepo: MockCreatorRepository;
	let apify: MockApifyProvider;
	let analyzer: MockVideoAnalyzer;
	let fetcher: MockVideoFetcher;
	let notifications: Array<{ workspaceId: string; event: any }>;
	let aiLogCalls: any[];

	const apifyKeys = new Map<string, string>();
	const workspaceId = "ws-1";
	const projectId = "p-1";
	const userId = "u-1";

	beforeEach(() => {
		pipelineRepo = new MockCompetitorPipelineRepository();
		configRepo = new MockAnalysisConfigRepository();
		creatorRepo = new MockCreatorRepository();
		apify = new MockApifyProvider();
		analyzer = new MockVideoAnalyzer();
		analyzer.cannedAnalysis = fixtureAnalysis as any;
		analyzer.cannedScripts = fixtureScripts as any;
		fetcher = new MockVideoFetcher();
		notifications = [];
		aiLogCalls = [];
		apifyKeys.clear();
		apifyKeys.set(workspaceId, "apify_test");

		(apify as any).getRunResults = async () => fixtureVideos;
	});

	afterEach(() => {
		pipelineRepo.clear();
		configRepo.clear();
		creatorRepo.clear();
	});

	function buildJob(): CompetitorPipelineJob {
		const notifService = {
			notify: (wsId: string, event: any) => notifications.push({ workspaceId: wsId, event }),
		} as any;
		const aiLogger = async (args: any) => aiLogCalls.push(args);

		return new CompetitorPipelineJob(
			pipelineRepo,
			configRepo,
			creatorRepo,
			apify,
			analyzer,
			fetcher.fetcher,
			async (wsId: string) => apifyKeys.get(wsId) ?? null,
			notifService,
			aiLogger,
			mockLogger,
			{ now: () => new Date("2024-03-28T00:00:00Z") },
		);
	}

	async function seedConfigAndRun(creatorCount: number): Promise<{ runId: string; configId: string }> {
		const config = await configRepo.create({
			workspaceId,
			projectId,
			input: {
				name: "Fitness config",
				brandContext: "We sell protein powder.",
				analysisInstructions: "Analyze hook + retention.",
				outputPreferences: "Generate 3 TikTok scripts with B-roll.",
			},
		});
		for (let i = 0; i < creatorCount; i++) {
			const c = await creatorRepo.create({
				workspaceId,
				projectId,
				input: { platform: "tiktok", profileUrl: `u${i}`, username: `c${i}`, niche: "fitness" },
			});
			configRepo.joinRows.push({ configId: config.id, creatorId: c.id });
		}
		configRepo.creatorStore = creatorRepo.creators;
		const run = await pipelineRepo.createRun({
			workspaceId,
			projectId,
			configId: config.id,
			userId,
			videosPerCreator: 2,
			lookbackPool: 20,
			timeframeDays: 30,
		});
		return { runId: run.id, configId: config.id };
	}

	it("happy path — 2 creators × 2 videos = 4 completed analyses + scripts", async () => {
		const { runId } = await seedConfigAndRun(2);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.completedAt).toBeDefined();
		expect(run?.videos.filter((v) => v.analysisStatus === "completed")).toHaveLength(4);
		expect(run?.scripts).toHaveLength(3);
		expect(analyzer.analyzeCalls).toHaveLength(4);
		expect(analyzer.generateCalls).toHaveLength(1);
		expect(aiLogCalls.filter((c) => c.generator === "competitor_video_analysis")).toHaveLength(4);
		expect(aiLogCalls.filter((c) => c.generator === "competitor_script_generation")).toHaveLength(1);
		expect(notifications.some((n) => n.event.type === "competitor_pipeline_completed")).toBe(true);
	});

	it("fails fast when no Apify key", async () => {
		apifyKeys.clear();
		const { runId } = await seedConfigAndRun(1);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.errorMessage).toContain("Apify");
	});

	it("one creator's Apify fails — partial success with the other creator's videos", async () => {
		const { runId } = await seedConfigAndRun(2);

		// Override: first creator succeeds, second fails.
		let call = 0;
		(apify as any).getRunStatus = async () => {
			call++;
			if (call === 2 /* second creator's status call */) return { status: "FAILED" };
			return { status: "SUCCEEDED", finishedAt: new Date().toISOString() };
		};
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.filter((v) => v.analysisStatus === "completed").length).toBeGreaterThan(0);
	});

	it("ALL creators fail Apify — run fails", async () => {
		(apify as any).getRunStatus = async () => ({ status: "FAILED" });
		const { runId } = await seedConfigAndRun(2);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
	});

	it("one video analysis fails — that video marked failed, pipeline continues", async () => {
		const { runId } = await seedConfigAndRun(1);
		analyzer.analyzeFail = "once"; // first video fails, rest succeed
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.filter((v) => v.analysisStatus === "failed")).toHaveLength(1);
		expect(run?.videos.filter((v) => v.analysisStatus === "completed")).toHaveLength(1);
		expect(run?.scripts.length).toBeGreaterThan(0);
	});

	it("video download exceeds cap — that video skipped, pipeline continues", async () => {
		const { runId } = await seedConfigAndRun(1);
		fetcher.overLimit = true;
		// Only first video over-limit; others ok.
		let n = 0;
		fetcher.fetcher = async (url: string) => {
			fetcher.calls.push(url);
			n++;
			if (n === 1) throw new Error("video exceeds 50 MB cap");
			return { bytes: fetcher.bytes, mimeType: "video/mp4" };
		};
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.some((v) => v.analysisStatus === "failed")).toBe(true);
	});

	it("cancellation between stages — bails with 'Cancelled by user'", async () => {
		const { runId } = await seedConfigAndRun(2);
		// Before job runs, flip status.
		await pipelineRepo.updateRun(runId, { status: "cancelling" });
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.errorMessage).toContain("Cancelled");
	});

	it("script generation fails — run fails, video analyses survive", async () => {
		const { runId } = await seedConfigAndRun(1);
		analyzer.scriptsFail = true;
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.videos.filter((v) => v.analysisStatus === "completed").length).toBeGreaterThan(0);
		expect(run?.scripts).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests, verify FAIL**

Run: `cd backend && bun test tests/jobs/competitor-pipeline.job.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/jobs/competitor-pipeline.job.test.ts
git commit -m "test(job): add failing pipeline orchestration tests"
```

---

### Task 5.6: Pipeline job implementation

**Files:**
- Create: `backend/src/jobs/competitor-pipeline.job.ts`

- [ ] **Step 1: Write the job file**

```typescript
import type { PipelineContent } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IVideoAnalyzer } from "../interfaces/providers/video-analyzer.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { TikTokParser } from "../providers/apify-parsers/tiktok.parser";
import {
	PIPELINE_INPUT_LIMITS,
	type VideoAnalysisResult,
} from "../types/competitor-analyzer.types";

interface CompetitorPipelineJobData {
	runId: string;
}

// Fetches video bytes by URL. Injected so tests can stub without network.
export type VideoFetcher = (url: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

// Callback invoked for AI activity logging. Signature matches `logAiActivity`
// from `backend/src/utils/ai-activity-logger.ts` but narrowed — the job receives
// a wrapping closure from the composition root.
type AiLogger = (args: {
	workspaceId: string;
	userId: string;
	generator: "competitor_video_analysis" | "competitor_script_generation";
	systemPrompt: string;
	userPrompt: string;
	runId: string;
	videoId?: string;
	inputTokens?: number;
	outputTokens?: number;
	durationMs: number;
	status: "success" | "error";
	errorMessage?: string;
	responseJson?: any;
}) => Promise<void>;

const APIFY_TIKTOK_ACTOR = "clockworks/free-tiktok-scraper";
const APIFY_POLL_TIMEOUT_MS = 2 * 60 * 1000;
const APIFY_POLL_MAX_DELAY_MS = 15_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 60_000;
const VIDEO_SIZE_CAP_BYTES = 50 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

interface PipelineJobDeps {
	now: () => Date;
}

/** Pg-boss-invoked orchestrator. See design doc section 3 for stage semantics. */
export class CompetitorPipelineJob {
	private readonly now: () => Date;

	constructor(
		private pipelineRepository: ICompetitorPipelineRepository,
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private apifyProvider: IApifyProvider,
		private videoAnalyzer: IVideoAnalyzer,
		private videoFetcher: VideoFetcher,
		private apifyKeyLookup: ApifyKeyLookup,
		private notificationService: INotificationService,
		private aiLogger: AiLogger,
		private logger: ILogger,
		deps?: PipelineJobDeps,
	) {
		this.now = deps?.now ?? (() => new Date());
	}

	async handle(data: CompetitorPipelineJobData): Promise<void> {
		const { runId } = data;
		const startTs = Date.now();

		const run = await this.pipelineRepository.findRunById(runId);
		if (!run) {
			this.logger.error("competitor_pipeline_failed", {
				event: "cp_failed",
				runId,
				stage: "load",
				error: "Run not found",
			});
			return;
		}

		// ─── Stage 1: Guard & Load ─────────────────────────────────
		const configWithCreators = await this.configRepository.findById(run.configId ?? "");
		if (!configWithCreators) {
			await this.failRun(run, "Config not found (may have been deleted)", "load");
			return;
		}
		const creators = configWithCreators.creators.filter((c) => c.archivedAt === null);
		if (creators.length === 0) {
			await this.failRun(run, "Config has no active creators", "load");
			return;
		}

		const apifyKey = await this.apifyKeyLookup(run.workspaceId);
		if (!apifyKey) {
			await this.failRun(run, "Apify API key not configured. Set it in workspace settings.", "load");
			return;
		}

		// Defensive re-validation (service already checked on create).
		this.validateInputRanges(run);

		await this.pipelineRepository.updateRun(runId, {
			status: "scraping",
			stage: "starting",
			startedAt: this.now(),
		});

		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_stage_changed",
			data: { runId, status: "scraping", stage: "starting" },
		});

		this.logger.info("competitor_pipeline_started", {
			event: "cp_started",
			runId,
			projectId: run.projectId,
			configId: run.configId,
			creatorCount: creators.length,
		});

		if (await this.isCancelling(runId)) {
			await this.cancelRun(run);
			return;
		}

		// ─── Stage 2: Scrape ───────────────────────────────────────
		const allInsertedVideoIds: string[] = [];
		let creatorsScrapedCount = 0;
		for (let idx = 0; idx < creators.length; idx++) {
			const creator = creators[idx];
			const stage = `scraping_creator_${idx + 1}_of_${creators.length}`;
			await this.pipelineRepository.updateRun(runId, { stage });
			this.notificationService.notify(run.userId, {
				type: "competitor_pipeline_stage_changed",
				data: { runId, status: "scraping", stage },
			});

			const scrapeStart = Date.now();
			try {
				const { runId: apifyRunId } = await this.apifyProvider.runActor(
					APIFY_TIKTOK_ACTOR,
					{
						profiles: [creator.username],
						resultsPerPage: run.lookbackPool,
						proxyCountryCode: "US",
					},
					apifyKey,
				);

				let delay = 1000;
				const pollStart = Date.now();
				let succeeded = false;
				while (Date.now() - pollStart < APIFY_POLL_TIMEOUT_MS) {
					await sleep(delay);
					const status = await this.apifyProvider.getRunStatus(apifyRunId, apifyKey);
					if (status.status === "SUCCEEDED") {
						succeeded = true;
						break;
					}
					if (status.status === "FAILED" || status.status === "ABORTED" || status.status === "TIMED-OUT") {
						throw new Error(`Apify actor ${status.status}`);
					}
					delay = Math.min(delay * 2, APIFY_POLL_MAX_DELAY_MS);
				}
				if (!succeeded) throw new Error("Apify scrape timed out");

				const rawItems = await this.apifyProvider.getRunResults(apifyRunId, apifyKey);
				const parser = new TikTokParser();
				const parsed = parser.parse(rawItems);

				// Filter by timeframe and take top N by view count.
				const nowMs = this.now().getTime();
				const cutoff = nowMs - run.timeframeDays * 24 * 60 * 60 * 1000;
				const recentRaw = rawItems.filter((r: any) => {
					const ts = r.createTime ? r.createTime * 1000 : 0;
					return ts >= cutoff;
				});
				// Sort by playCount desc and take top videosPerCreator.
				recentRaw.sort((a: any, b: any) => (b.playCount ?? 0) - (a.playCount ?? 0));
				const top = recentRaw.slice(0, run.videosPerCreator);

				if (top.length === 0) {
					this.logger.info("competitor_pipeline_scrape_done", {
						event: "cp_scrape",
						runId,
						creatorId: creator.id,
						videosFound: 0,
						durationMs: Date.now() - scrapeStart,
					});
					creatorsScrapedCount++;
					continue;
				}

				const contentRows = top.map((r: any) => ({
					runId,
					creatorId: creator.id,
					platform: "tiktok",
					platformPostId: String(r.id ?? r.webVideoUrl),
					contentType: "video",
					contentUrl: r.videoMeta?.downloadAddr ?? r.webVideoUrl,
					thumbnailUrl: r.covers?.default ?? null,
					caption: r.text ?? null,
					viewCount: r.playCount ?? null,
					likeCount: r.diggCount ?? null,
					shareCount: r.shareCount ?? null,
					commentCount: r.commentCount ?? null,
					hashtags: (r.hashtags ?? []).map((h: any) => h.name ?? h),
					postedAt: r.createTime ? new Date(r.createTime * 1000) : null,
					platformMetadata: {
						musicName: r.musicMeta?.musicName,
						webVideoUrl: r.webVideoUrl,
					},
				}));
				const inserted = await this.pipelineRepository.createContent(contentRows);
				for (const v of inserted) {
					if (!allInsertedVideoIds.includes(v.id)) allInsertedVideoIds.push(v.id);
				}
				creatorsScrapedCount++;
				this.logger.info("competitor_pipeline_scrape_done", {
					event: "cp_scrape",
					runId,
					creatorId: creator.id,
					videosFound: top.length,
					durationMs: Date.now() - scrapeStart,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.logger.warn("competitor_pipeline_scrape_failed", {
					event: "cp_scrape_fail",
					runId,
					creatorId: creator.id,
					reason: msg,
				});
				// Continue to next creator.
			}

			if (await this.isCancelling(runId)) {
				await this.cancelRun(run);
				return;
			}
		}

		if (allInsertedVideoIds.length === 0) {
			await this.failRun(run, "No videos retrieved from any creator", "scrape");
			return;
		}

		// ─── Stage 3: Video Analysis ────────────────────────────────
		await this.pipelineRepository.updateRun(runId, { status: "analyzing", stage: "preparing" });

		const videos = await this.pipelineRepository.findContentByRun(runId);
		const videoList = videos.filter((v) => v.contentType === "video" && v.analysisStatus === "pending");

		for (let idx = 0; idx < videoList.length; idx++) {
			const video = videoList[idx];
			const stage = `analyzing_video_${idx + 1}_of_${videoList.length}`;
			await this.pipelineRepository.updateRun(runId, { stage });
			this.notificationService.notify(run.userId, {
				type: "competitor_pipeline_stage_changed",
				data: { runId, status: "analyzing", stage },
			});

			await this.pipelineRepository.updateContent(video.id, { analysisStatus: "running" });
			const vStart = Date.now();
			try {
				const { bytes, mimeType } = await this.downloadVideoBytes(video.contentUrl);
				if (bytes.byteLength > VIDEO_SIZE_CAP_BYTES) {
					throw new Error(`Video exceeds ${VIDEO_SIZE_CAP_BYTES} byte cap`);
				}

				const { analysis, usage, systemPrompt, userPrompt } = await this.videoAnalyzer.analyzeVideo(
					{
						bytes,
						mimeType,
						instructions: configWithCreators.analysisInstructions,
					},
				);

				await this.pipelineRepository.updateContent(video.id, {
					analysisStatus: "completed",
					analysisJson: analysis as any,
					analysisError: null,
				});
				await this.aiLogger({
					workspaceId: run.workspaceId,
					userId: run.userId,
					generator: "competitor_video_analysis",
					systemPrompt,
					userPrompt: `runId=${runId} videoId=${video.id}\n${userPrompt}`,
					runId,
					videoId: video.id,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					durationMs: Date.now() - vStart,
					status: "success",
					responseJson: analysis,
				});
				this.logger.info("competitor_pipeline_video_done", {
					event: "cp_video",
					runId,
					videoId: video.id,
					durationMs: Date.now() - vStart,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
				});
				this.notificationService.notify(run.userId, {
					type: "competitor_pipeline_video_analyzed",
					data: { runId, videoId: video.id, status: "completed" },
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await this.pipelineRepository.updateContent(video.id, {
					analysisStatus: "failed",
					analysisError: msg,
				});
				await this.aiLogger({
					workspaceId: run.workspaceId,
					userId: run.userId,
					generator: "competitor_video_analysis",
					systemPrompt: "(failed before response)",
					userPrompt: `runId=${runId} videoId=${video.id}`,
					runId,
					videoId: video.id,
					durationMs: Date.now() - vStart,
					status: "error",
					errorMessage: msg,
				});
				this.logger.warn("competitor_pipeline_video_failed", {
					event: "cp_video_fail",
					runId,
					videoId: video.id,
					reason: msg,
				});
				this.notificationService.notify(run.userId, {
					type: "competitor_pipeline_video_analyzed",
					data: { runId, videoId: video.id, status: "failed" },
				});
			}

			if (await this.isCancelling(runId)) {
				await this.cancelRun(run);
				return;
			}
		}

		// ─── Stage 4: Script Generation ─────────────────────────────
		await this.pipelineRepository.updateRun(runId, { status: "generating", stage: "generating_scripts" });
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_stage_changed",
			data: { runId, status: "generating", stage: "generating_scripts" },
		});

		const finalVideos = await this.pipelineRepository.findContentByRun(runId);
		const completedVideos = finalVideos.filter((v) => v.analysisStatus === "completed");
		if (completedVideos.length === 0) {
			await this.failRun(run, "No videos were analyzed successfully", "analyze");
			return;
		}

		const scriptStart = Date.now();
		try {
			const { scripts, usage, systemPrompt, userPrompt } = await this.videoAnalyzer.generateScripts({
				brandContext: configWithCreators.brandContext,
				analysisInstructions: configWithCreators.analysisInstructions,
				outputPreferences: configWithCreators.outputPreferences,
				videoAnalyses: completedVideos.map((v) => ({
					caption: v.caption,
					viewCount: v.viewCount,
					analysis: v.analysisJson as unknown as VideoAnalysisResult,
				})),
			});

			await this.pipelineRepository.createScripts(
				runId,
				scripts.map((s, i) => ({
					scriptNumber: s.scriptNumber ?? i + 1,
					sourceVideoId: s.sourceVideoId ?? null,
					title: s.title ?? null,
					hook: s.hook ?? null,
					body: s.body ?? null,
					broll: s.broll ?? null,
					cta: s.cta ?? null,
					rawContent: s as any,
				})),
			);

			await this.aiLogger({
				workspaceId: run.workspaceId,
				userId: run.userId,
				generator: "competitor_script_generation",
				systemPrompt,
				userPrompt: `runId=${runId}\n${userPrompt}`,
				runId,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				durationMs: Date.now() - scriptStart,
				status: "success",
				responseJson: scripts,
			});

			this.logger.info("competitor_pipeline_scripts_done", {
				event: "cp_scripts",
				runId,
				scriptCount: scripts.length,
				durationMs: Date.now() - scriptStart,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await this.failRun(run, `Script generation failed: ${msg}`, "generate");
			await this.aiLogger({
				workspaceId: run.workspaceId,
				userId: run.userId,
				generator: "competitor_script_generation",
				systemPrompt: "(failed)",
				userPrompt: `runId=${runId}`,
				runId,
				durationMs: Date.now() - scriptStart,
				status: "error",
				errorMessage: msg,
			});
			return;
		}

		// ─── Stage 5: Complete ──────────────────────────────────────
		await this.pipelineRepository.updateRun(runId, {
			status: "completed",
			stage: null,
			completedAt: this.now(),
		});

		const completedRun = await this.pipelineRepository.findRunById(runId);
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_completed",
			data: {
				runId,
				videoCount: completedRun?.videos.filter((v) => v.analysisStatus === "completed").length ?? 0,
				scriptCount: completedRun?.scripts.length ?? 0,
			},
		});

		this.logger.info("competitor_pipeline_completed", {
			event: "cp_completed",
			runId,
			totalDurationMs: Date.now() - startTs,
			videoCount: completedRun?.videos.length ?? 0,
			scriptCount: completedRun?.scripts.length ?? 0,
		});
	}

	private async isCancelling(runId: string): Promise<boolean> {
		const status = await this.pipelineRepository.getRunStatus(runId);
		return status === "cancelling";
	}

	private async cancelRun(run: { id: string; userId: string }): Promise<void> {
		await this.pipelineRepository.updateRun(run.id, {
			status: "failed",
			errorMessage: "Cancelled by user",
			completedAt: this.now(),
		});
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_failed",
			data: { runId: run.id, errorMessage: "Cancelled by user" },
		});
	}

	private async failRun(
		run: { id: string; userId: string },
		errorMessage: string,
		stage: string,
	): Promise<void> {
		await this.pipelineRepository.updateRun(run.id, {
			status: "failed",
			errorMessage,
			completedAt: this.now(),
		});
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_failed",
			data: { runId: run.id, errorMessage },
		});
		this.logger.error("competitor_pipeline_failed", {
			event: "cp_failed",
			runId: run.id,
			stage,
			error: errorMessage,
		});
	}

	private validateInputRanges(run: { videosPerCreator: number; lookbackPool: number; timeframeDays: number }): void {
		const {
			videosPerCreatorMin,
			videosPerCreatorMax,
			lookbackPoolMin,
			lookbackPoolMax,
			timeframeDaysMin,
			timeframeDaysMax,
		} = PIPELINE_INPUT_LIMITS;
		if (run.videosPerCreator < videosPerCreatorMin || run.videosPerCreator > videosPerCreatorMax)
			throw new Error("videosPerCreator out of range");
		if (run.lookbackPool < lookbackPoolMin || run.lookbackPool > lookbackPoolMax)
			throw new Error("lookbackPool out of range");
		if (run.timeframeDays < timeframeDaysMin || run.timeframeDays > timeframeDaysMax)
			throw new Error("timeframeDays out of range");
	}

	private async downloadVideoBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("video download timed out")), VIDEO_DOWNLOAD_TIMEOUT_MS),
		);
		return Promise.race([this.videoFetcher(url), timeout]);
	}
}
```

- [ ] **Step 2: Run tests, verify PASS**

Run: `cd backend && bun test tests/jobs/competitor-pipeline.job.test.ts`
Expected: all 8 tests pass. If some fail, typically the issue is mock timing — the `MockApifyProvider.getRunStatus` returns SUCCEEDED immediately, so the poll loop exits on the first iteration. Verify there are no lingering `sleep(1000)` delays bogging down the test suite; if there are, pass an optional `pollInitialDelayMs: 0` dep into the job for tests. (Current code uses 1s initial — fine for tests; total per test stays under ~3s.)

- [ ] **Step 3: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/jobs/competitor-pipeline.job.ts
git commit -m "feat(job): competitor pipeline orchestrator (5 stages)"
```

---

## Phase 6 — Routes + Composition Root

Wire up HTTP endpoints and instantiate everything in `index.ts`.

---

### Task 6.1: Route file

**Files:**
- Create: `backend/src/routes/competitor-analyzer.route.ts`

- [ ] **Step 1: Write the route file**

```typescript
import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { createProjectMiddleware, requireMenu } from "../middlewares/rbac.middleware";
import type { IAnalysisConfigService } from "../interfaces/services/analysis-config.service.interface";
import type { ICompetitorPipelineService } from "../interfaces/services/competitor-pipeline.service.interface";
import type { ICreatorService } from "../interfaces/services/creator.service.interface";

type Variables = {
	userId: string;
	workspaceId: string;
	workspaceRole: string;
	projectId?: string | null;
	isSuperadmin?: boolean;
};

export function createCompetitorAnalyzerRoutes(
	prisma: PrismaClient,
	creatorService: ICreatorService,
	configService: IAnalysisConfigService,
	pipelineService: ICompetitorPipelineService,
) {
	const app = new Hono<{ Variables: Variables }>();

	// All routes are project-scoped. The parent router mounts this under
	// /api/workspaces/:workspaceId/projects/:projectId/competitor-analyzer
	app.use("*", createProjectMiddleware(prisma));
	app.use("*", requireMenu("competitor-analyzer"));

	// ── Creators ─────────────────────────────────────────────

	app.post("/creators", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const userId = c.get("userId");
		const body = await c.req.json();
		try {
			const creator = await creatorService.create(workspaceId, projectId, userId, {
				platform: body.platform ?? "tiktok",
				profileUrl: body.profileUrl,
				username: body.username,
				niche: body.niche,
			});
			return c.json({ data: creator });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/creators", async (c) => {
		const projectId = c.get("projectId") as string;
		const includeArchived = c.req.query("includeArchived") === "true";
		const platform = c.req.query("platform") ?? undefined;
		const niche = c.req.query("niche") ?? undefined;
		const creators = await creatorService.list(projectId, { includeArchived, platform, niche });
		return c.json({ data: creators });
	});

	app.get("/creators/:id", async (c) => {
		const creator = await creatorService.get(c.req.param("id"));
		return c.json({ data: creator });
	});

	app.patch("/creators/:id", async (c) => {
		const body = await c.req.json();
		const updated = await creatorService.update(c.req.param("id"), body);
		return c.json({ data: updated });
	});

	app.delete("/creators/:id", async (c) => {
		await creatorService.archive(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	app.post("/creators/:id/refresh", async (c) => {
		const creator = await creatorService.refreshEnrichment(c.req.param("id"));
		return c.json({ data: creator });
	});

	// ── Configs ──────────────────────────────────────────────

	app.post("/configs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const body = await c.req.json();
		try {
			const config = await configService.create(workspaceId, projectId, body);
			return c.json({ data: config });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/configs", async (c) => {
		const projectId = c.get("projectId") as string;
		const configs = await configService.list(projectId);
		return c.json({ data: configs });
	});

	app.get("/configs/:id", async (c) => {
		const config = await configService.get(c.req.param("id"));
		return c.json({ data: config });
	});

	app.patch("/configs/:id", async (c) => {
		const body = await c.req.json();
		const config = await configService.update(c.req.param("id"), body);
		return c.json({ data: config });
	});

	app.delete("/configs/:id", async (c) => {
		await configService.delete(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	app.put("/configs/:id/creators", async (c) => {
		const projectId = c.get("projectId") as string;
		const body = await c.req.json<{ creatorIds: string[] }>();
		try {
			await configService.replaceCreators(c.req.param("id"), body.creatorIds ?? [], projectId);
			return c.json({ data: { success: true } });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.delete("/configs/:id/creators/:creatorId", async (c) => {
		await configService.removeCreator(c.req.param("id"), c.req.param("creatorId"));
		return c.json({ data: { success: true } });
	});

	// ── Runs ─────────────────────────────────────────────────

	app.post("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const userId = c.get("userId");
		const body = await c.req.json();
		try {
			const run = await pipelineService.createRun(workspaceId, projectId, userId, {
				configId: body.configId,
				videosPerCreator: body.videosPerCreator,
				lookbackPool: body.lookbackPool,
				timeframeDays: body.timeframeDays,
			});
			return c.json({ data: run });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/runs", async (c) => {
		const projectId = c.get("projectId") as string;
		const runs = await pipelineService.listRuns(projectId);
		return c.json({ data: runs });
	});

	app.get("/runs/:id", async (c) => {
		const run = await pipelineService.getRun(c.req.param("id"));
		return c.json({ data: run });
	});

	app.post("/runs/:id/cancel", async (c) => {
		try {
			const run = await pipelineService.cancelRun(c.req.param("id"));
			return c.json({ data: run });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/runs/:id/scripts", async (c) => {
		const run = await pipelineService.getRun(c.req.param("id"));
		return c.json({ data: run.scripts });
	});

	return app;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/competitor-analyzer.route.ts
git commit -m "feat(route): competitor analyzer HTTP endpoints"
```

---

### Task 6.2: Composition root — wire everything into index.ts

**Files:**
- Modify: `backend/src/index.ts`

The changes are in 4 localized spots. Make each edit precisely as shown to avoid breaking existing wiring.

- [ ] **Step 1: Add imports**

Find the block of import statements at the top of `backend/src/index.ts`. Add these (grouped with related imports):

```typescript
import { CompetitorPipelineJob } from "./jobs/competitor-pipeline.job";
import { CreatorEnrichmentJob } from "./jobs/creator-enrichment.job";
import { AnalysisConfigRepository } from "./repositories/analysis-config.repository";
import { CompetitorPipelineRepository } from "./repositories/competitor-pipeline.repository";
import { CreatorRepository } from "./repositories/creator.repository";
import { createCompetitorAnalyzerRoutes } from "./routes/competitor-analyzer.route";
import { AnalysisConfigService } from "./services/analysis-config.service";
import { CompetitorPipelineService } from "./services/competitor-pipeline.service";
import { CreatorService } from "./services/creator.service";
import { GeminiVideoAnalyzerProvider } from "./providers/gemini-video.provider";
import { logAiActivity } from "./utils/ai-activity-logger";
```

- [ ] **Step 2: Instantiate repositories**

Find the `// ─── Repositories ───` block (around line 115 in `index.ts`) and add these lines at the end of that block:

```typescript
const creatorRepository = new CreatorRepository(prisma);
const analysisConfigRepository = new AnalysisConfigRepository(prisma);
const competitorPipelineRepository = new CompetitorPipelineRepository(prisma);
```

- [ ] **Step 3: Instantiate services**

Find the `// ─── Services ───` block. After `researchService` is instantiated, add:

```typescript
// Shared helper used by competitor analyzer + (in future) any job that needs
// the per-workspace Apify key.
const apifyKeyLookup = async (wsId: string): Promise<string | null> => {
	const setting = await prisma.workspaceSetting.findUnique({ where: { workspaceId: wsId } });
	return setting?.apifyApiKey ?? null;
};

const creatorService = new CreatorService(creatorRepository, boss, logger);
const analysisConfigService = new AnalysisConfigService(
	analysisConfigRepository,
	creatorRepository,
	logger,
);
const competitorPipelineService = new CompetitorPipelineService(
	competitorPipelineRepository,
	analysisConfigRepository,
	creatorRepository,
	boss,
	apifyKeyLookup,
	logger,
);
```

- [ ] **Step 4: Instantiate jobs**

Find the `// ─── Job Handlers ───` block. After the existing jobs, add:

```typescript
// Creator enrichment — uses notifier (per-workspace SSE) + Apify + parser.
const creatorEnrichmentJob = new CreatorEnrichmentJob(
	creatorRepository,
	apifyProvider,
	apifyKeyLookup,
	notificationService,
	logger,
);

// Pipeline job uses a workspace-scoped video analyzer factory. Each call pulls
// the workspace's Gemini key via AiProviderFactory.getSettings(), but for
// simplicity here we resolve once at request time using the env fallback.
// Follow the AiProviderFactory pattern if you want per-workspace Gemini keys.
const buildVideoAnalyzer = async (workspaceId: string): Promise<GeminiVideoAnalyzerProvider> => {
	const settings = await aiProviderFactory.getSettings(workspaceId);
	const apiKey = settings.geminiApiKey ?? env.geminiApiKey;
	const model = settings.geminiModel ?? env.geminiModel ?? "gemini-2.5-flash";
	if (!apiKey) throw new Error("Gemini API key not configured");
	return new GeminiVideoAnalyzerProvider(apiKey, model);
};

// Video fetcher — real network call with timeout enforced inside the job.
const videoFetcher = async (url: string): Promise<{ bytes: Uint8Array; mimeType: string }> => {
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`Video fetch failed: HTTP ${resp.status}`);
	const mimeType = resp.headers.get("content-type") ?? "video/mp4";
	const ab = await resp.arrayBuffer();
	return { bytes: new Uint8Array(ab), mimeType };
};

// The pipeline job resolves a fresh analyzer per run (workspace-aware).
// Because pg-boss's worker signature passes a plain job-data object, we create
// a small wrapper that builds the analyzer inside handle().
const competitorPipelineJob = {
	async handle(data: { runId: string }) {
		// Load the run to know the workspaceId before building the analyzer.
		const run = await prisma.competitorPipelineRun.findUnique({
			where: { id: data.runId },
			select: { workspaceId: true },
		});
		if (!run) {
			logger.error("competitor_pipeline_failed", { runId: data.runId, error: "Run not found" });
			return;
		}
		let analyzer: GeminiVideoAnalyzerProvider;
		try {
			analyzer = await buildVideoAnalyzer(run.workspaceId);
		} catch (err) {
			await prisma.competitorPipelineRun.update({
				where: { id: data.runId },
				data: {
					status: "failed",
					errorMessage: err instanceof Error ? err.message : "Gemini config error",
					completedAt: new Date(),
				},
			});
			return;
		}
		const job = new CompetitorPipelineJob(
			competitorPipelineRepository,
			analysisConfigRepository,
			creatorRepository,
			apifyProvider,
			analyzer,
			videoFetcher,
			apifyKeyLookup,
			notificationService,
			async (args) =>
				logAiActivity(
					prisma,
					{
						workspaceId: args.workspaceId,
						generator: args.generator,
						provider: "gemini",
						userId: args.userId,
						systemPrompt: args.systemPrompt,
						userPrompt: args.userPrompt,
					},
					{
						inputTokens: args.inputTokens,
						outputTokens: args.outputTokens,
						durationMs: args.durationMs,
						status: args.status,
						errorMessage: args.errorMessage,
						responseJson: args.responseJson,
					},
				),
			logger,
		);
		await job.handle(data);
	},
};
```

- [ ] **Step 5: Register pg-boss workers**

Find the section where existing pg-boss workers are registered (look for `await boss.work(...)` calls). Add:

```typescript
await boss.work("creator-enrichment", async (job: any) => {
	const data = Array.isArray(job) ? job[0].data : job.data;
	await creatorEnrichmentJob.handle(data);
});
await boss.work("competitor-pipeline", async (job: any) => {
	const data = Array.isArray(job) ? job[0].data : job.data;
	await competitorPipelineJob.handle(data);
});
```

- [ ] **Step 6: Mount the routes**

Find where other project-scoped routes are mounted (search for `"/api/workspaces/:workspaceId/projects/:projectId"`). Add:

```typescript
app.route(
	"/api/workspaces/:workspaceId/projects/:projectId/competitor-analyzer",
	createCompetitorAnalyzerRoutes(
		prisma,
		creatorService,
		analysisConfigService,
		competitorPipelineService,
	),
);
```

- [ ] **Step 7: Typecheck**

Run: `cd backend && bunx tsc --noEmit`
Expected: clean.

- [ ] **Step 8: Boot the server to smoke-test**

Run: `cd backend && bun run --hot src/index.ts`
Expected: logs include `Server listening on port 3001` and `pg-boss started` (or equivalent). No crashes on startup. Ctrl-C to stop.

- [ ] **Step 9: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(index): wire competitor analyzer repos/services/jobs/routes"
```

---

## Phase 7 — Frontend Foundation

API client, SSE-enabled data hook, the page shell with tabs, route registration, and sidebar entry.

---

### Task 7.1: Frontend API client

**Files:**
- Create: `frontend/src/services/competitor-analyzer.api.ts`

- [ ] **Step 1: Write the API client**

```typescript
import { api } from "./api";

// ─── Types (mirror backend Prisma types at runtime ergonomics) ─────

export interface Creator {
	id: string;
	workspaceId: string;
	projectId: string;
	platform: string;
	profileUrl: string;
	username: string;
	displayName: string | null;
	niche: string;
	followerCount: number | null;
	avatarUrl: string | null;
	bio: string | null;
	platformMetadata: Record<string, unknown> | null;
	enrichmentStatus: "pending" | "enriched" | "failed";
	enrichmentError: string | null;
	lastEnrichedAt: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AnalysisConfig {
	id: string;
	name: string;
	targetNiche: string | null;
	brandContext: string;
	analysisInstructions: string;
	outputPreferences: string;
	creators: Creator[];
	_count?: { runs: number };
	createdAt: string;
	updatedAt: string;
}

export interface PipelineRun {
	id: string;
	configId: string | null;
	userId: string;
	videosPerCreator: number;
	lookbackPool: number;
	timeframeDays: number;
	status: "pending" | "scraping" | "analyzing" | "generating" | "completed" | "failed" | "cancelling";
	stage: string | null;
	errorMessage: string | null;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
}

export interface PipelineContent {
	id: string;
	runId: string;
	creatorId: string;
	platform: string;
	platformPostId: string;
	contentType: string;
	contentUrl: string;
	thumbnailUrl: string | null;
	caption: string | null;
	viewCount: number | null;
	likeCount: number | null;
	shareCount: number | null;
	commentCount: number | null;
	hashtags: string[] | null;
	postedAt: string | null;
	analysisStatus: "pending" | "running" | "completed" | "failed";
	analysisJson: {
		hook: string;
		retentionMechanisms: string[];
		pacingNotes: string;
		onScreenText: string[];
		audioStyle: string;
		whyItWentViral: string;
		ctaAnalysis: string;
	} | null;
	analysisError: string | null;
	createdAt: string;
}

export interface PipelineScript {
	id: string;
	runId: string;
	sourceVideoId: string | null;
	scriptNumber: number;
	title: string | null;
	hook: string | null;
	body: string | null;
	broll: Array<{ scene: string; description: string }> | null;
	cta: string | null;
	rawContent: unknown;
	createdAt: string;
}

export type PipelineRunDetail = PipelineRun & {
	videos: PipelineContent[];
	scripts: PipelineScript[];
	config: AnalysisConfig | null;
};

// ─── Helpers ───────────────────────────────────────────────────

function basePath(workspaceId: string, projectId: string): string {
	return `/api/workspaces/${workspaceId}/projects/${projectId}/competitor-analyzer`;
}

// ─── Creators ──────────────────────────────────────────────────

export async function listCreators(
	workspaceId: string,
	projectId: string,
	opts?: { includeArchived?: boolean; niche?: string },
): Promise<Creator[]> {
	const qs = new URLSearchParams();
	if (opts?.includeArchived) qs.set("includeArchived", "true");
	if (opts?.niche) qs.set("niche", opts.niche);
	const url = `${basePath(workspaceId, projectId)}/creators${qs.toString() ? `?${qs}` : ""}`;
	const { data } = await api<{ data: Creator[] }>(url);
	return data;
}

export async function createCreator(
	workspaceId: string,
	projectId: string,
	input: { profileUrl: string; username: string; niche: string; platform?: string },
): Promise<Creator> {
	const { data } = await api<{ data: Creator }>(`${basePath(workspaceId, projectId)}/creators`, {
		method: "POST",
		body: JSON.stringify({ ...input, platform: input.platform ?? "tiktok" }),
	});
	return data;
}

export async function archiveCreator(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/creators/${id}`, { method: "DELETE" });
}

export async function refreshCreator(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<Creator> {
	const { data } = await api<{ data: Creator }>(
		`${basePath(workspaceId, projectId)}/creators/${id}/refresh`,
		{ method: "POST" },
	);
	return data;
}

// ─── Configs ───────────────────────────────────────────────────

export async function listConfigs(
	workspaceId: string,
	projectId: string,
): Promise<AnalysisConfig[]> {
	const { data } = await api<{ data: AnalysisConfig[] }>(
		`${basePath(workspaceId, projectId)}/configs`,
	);
	return data;
}

export async function getConfig(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<AnalysisConfig> {
	const { data } = await api<{ data: AnalysisConfig }>(
		`${basePath(workspaceId, projectId)}/configs/${id}`,
	);
	return data;
}

export async function createConfig(
	workspaceId: string,
	projectId: string,
	input: {
		name: string;
		targetNiche?: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	},
): Promise<AnalysisConfig> {
	const { data } = await api<{ data: AnalysisConfig }>(
		`${basePath(workspaceId, projectId)}/configs`,
		{ method: "POST", body: JSON.stringify(input) },
	);
	return data;
}

export async function updateConfig(
	workspaceId: string,
	projectId: string,
	id: string,
	input: Partial<{
		name: string;
		targetNiche: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	}>,
): Promise<AnalysisConfig> {
	const { data } = await api<{ data: AnalysisConfig }>(
		`${basePath(workspaceId, projectId)}/configs/${id}`,
		{ method: "PATCH", body: JSON.stringify(input) },
	);
	return data;
}

export async function deleteConfig(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/configs/${id}`, { method: "DELETE" });
}

export async function replaceConfigCreators(
	workspaceId: string,
	projectId: string,
	configId: string,
	creatorIds: string[],
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/configs/${configId}/creators`, {
		method: "PUT",
		body: JSON.stringify({ creatorIds }),
	});
}

// ─── Runs ──────────────────────────────────────────────────────

export async function listRuns(
	workspaceId: string,
	projectId: string,
): Promise<PipelineRun[]> {
	const { data } = await api<{ data: PipelineRun[] }>(`${basePath(workspaceId, projectId)}/runs`);
	return data;
}

export async function getRun(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<PipelineRunDetail> {
	const { data } = await api<{ data: PipelineRunDetail }>(
		`${basePath(workspaceId, projectId)}/runs/${id}`,
	);
	return data;
}

export async function createRun(
	workspaceId: string,
	projectId: string,
	input: {
		configId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	},
): Promise<PipelineRun> {
	const { data } = await api<{ data: PipelineRun }>(`${basePath(workspaceId, projectId)}/runs`, {
		method: "POST",
		body: JSON.stringify(input),
	});
	return data;
}

export async function cancelRun(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<PipelineRun> {
	const { data } = await api<{ data: PipelineRun }>(
		`${basePath(workspaceId, projectId)}/runs/${id}/cancel`,
		{ method: "POST" },
	);
	return data;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: exits clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/competitor-analyzer.api.ts
git commit -m "feat(frontend/api): competitor analyzer client"
```

---

### Task 7.2: `useCompetitorAnalyzer` hook with SSE

**Files:**
- Create: `frontend/src/hooks/useCompetitorAnalyzer.ts`

- [ ] **Step 1: Check the shape of `useSSE`**

Open `frontend/src/hooks/useSSE.ts` and confirm the callback signature. Expected (based on existing usage): `useSSE((event: { type: string; data: any }) => void)`. If the local signature differs, adjust the hook below to match.

- [ ] **Step 2: Write the hook**

```typescript
import { useCallback, useEffect, useRef, useState } from "react";
import { useSSE } from "./useSSE";
import { useWorkspace } from "./useWorkspace";
import { useProject } from "./useProject";
import {
	archiveCreator as apiArchiveCreator,
	cancelRun as apiCancelRun,
	createConfig as apiCreateConfig,
	createCreator as apiCreateCreator,
	createRun as apiCreateRun,
	deleteConfig as apiDeleteConfig,
	getRun as apiGetRun,
	listConfigs as apiListConfigs,
	listCreators as apiListCreators,
	listRuns as apiListRuns,
	refreshCreator as apiRefreshCreator,
	replaceConfigCreators as apiReplaceConfigCreators,
	updateConfig as apiUpdateConfig,
	type AnalysisConfig,
	type Creator,
	type PipelineRun,
	type PipelineRunDetail,
} from "../services/competitor-analyzer.api";

export function useCompetitorAnalyzer() {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const workspaceId = activeWorkspace?.id ?? "";
	const projectId = activeProject?.id ?? "";
	const ready = Boolean(workspaceId && projectId);

	const [creators, setCreators] = useState<Creator[]>([]);
	const [configs, setConfigs] = useState<AnalysisConfig[]>([]);
	const [runs, setRuns] = useState<PipelineRun[]>([]);
	const [activeRun, setActiveRun] = useState<PipelineRunDetail | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refreshingRuns = useRef(false);

	// ── Initial load ──────────────────────────────────────
	useEffect(() => {
		if (!ready) return;
		let cancelled = false;
		setLoading(true);
		Promise.all([
			apiListCreators(workspaceId, projectId),
			apiListConfigs(workspaceId, projectId),
			apiListRuns(workspaceId, projectId),
		])
			.then(([c, cfg, r]) => {
				if (cancelled) return;
				setCreators(c);
				setConfigs(cfg);
				setRuns(r);
			})
			.catch((err) => !cancelled && setError(err.message))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [ready, workspaceId, projectId]);

	// ── SSE wiring ────────────────────────────────────────
	useSSE((event: any) => {
		if (!ready) return;
		switch (event.type) {
			case "creator_enrichment_completed": {
				const { creatorId } = event.data;
				apiListCreators(workspaceId, projectId).then(setCreators).catch(() => {});
				break;
			}
			case "competitor_pipeline_stage_changed": {
				const { runId, status, stage } = event.data;
				setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, status, stage } : r)));
				setActiveRun((prev) => (prev && prev.id === runId ? { ...prev, status, stage } : prev));
				break;
			}
			case "competitor_pipeline_video_analyzed": {
				const { runId } = event.data;
				if (activeRun?.id === runId) {
					apiGetRun(workspaceId, projectId, runId).then(setActiveRun).catch(() => {});
				}
				break;
			}
			case "competitor_pipeline_completed":
			case "competitor_pipeline_failed": {
				const { runId } = event.data;
				if (!refreshingRuns.current) {
					refreshingRuns.current = true;
					apiListRuns(workspaceId, projectId)
						.then(setRuns)
						.finally(() => {
							refreshingRuns.current = false;
						});
				}
				if (activeRun?.id === runId) {
					apiGetRun(workspaceId, projectId, runId).then(setActiveRun).catch(() => {});
				}
				break;
			}
		}
	});

	// ── Action wrappers ───────────────────────────────────
	const refreshCreators = useCallback(async () => {
		const next = await apiListCreators(workspaceId, projectId);
		setCreators(next);
	}, [workspaceId, projectId]);

	const refreshConfigs = useCallback(async () => {
		const next = await apiListConfigs(workspaceId, projectId);
		setConfigs(next);
	}, [workspaceId, projectId]);

	const refreshRuns = useCallback(async () => {
		const next = await apiListRuns(workspaceId, projectId);
		setRuns(next);
	}, [workspaceId, projectId]);

	const loadRun = useCallback(
		async (runId: string) => {
			const detail = await apiGetRun(workspaceId, projectId, runId);
			setActiveRun(detail);
			return detail;
		},
		[workspaceId, projectId],
	);

	const addCreator = useCallback(
		async (input: { profileUrl: string; username: string; niche: string }) => {
			const created = await apiCreateCreator(workspaceId, projectId, input);
			setCreators((prev) => [created, ...prev]);
			return created;
		},
		[workspaceId, projectId],
	);

	const archiveCreator = useCallback(
		async (id: string) => {
			await apiArchiveCreator(workspaceId, projectId, id);
			setCreators((prev) => prev.filter((c) => c.id !== id));
		},
		[workspaceId, projectId],
	);

	const retryCreatorEnrichment = useCallback(
		async (id: string) => {
			const updated = await apiRefreshCreator(workspaceId, projectId, id);
			setCreators((prev) => prev.map((c) => (c.id === id ? updated : c)));
		},
		[workspaceId, projectId],
	);

	const saveConfig = useCallback(
		async (input: {
			id?: string;
			name: string;
			targetNiche?: string;
			brandContext: string;
			analysisInstructions: string;
			outputPreferences: string;
		}) => {
			if (input.id) {
				const updated = await apiUpdateConfig(workspaceId, projectId, input.id, input);
				setConfigs((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
				return updated;
			}
			const created = await apiCreateConfig(workspaceId, projectId, input);
			await refreshConfigs();
			return created;
		},
		[workspaceId, projectId, refreshConfigs],
	);

	const setConfigCreators = useCallback(
		async (configId: string, creatorIds: string[]) => {
			await apiReplaceConfigCreators(workspaceId, projectId, configId, creatorIds);
			await refreshConfigs();
		},
		[workspaceId, projectId, refreshConfigs],
	);

	const removeConfig = useCallback(
		async (id: string) => {
			await apiDeleteConfig(workspaceId, projectId, id);
			setConfigs((prev) => prev.filter((c) => c.id !== id));
		},
		[workspaceId, projectId],
	);

	const launchRun = useCallback(
		async (input: {
			configId: string;
			videosPerCreator: number;
			lookbackPool: number;
			timeframeDays: number;
		}) => {
			const run = await apiCreateRun(workspaceId, projectId, input);
			setRuns((prev) => [run, ...prev]);
			return run;
		},
		[workspaceId, projectId],
	);

	const cancelRun = useCallback(
		async (id: string) => {
			await apiCancelRun(workspaceId, projectId, id);
			await refreshRuns();
		},
		[workspaceId, projectId, refreshRuns],
	);

	return {
		ready,
		loading,
		error,
		creators,
		configs,
		runs,
		activeRun,
		loadRun,
		refreshCreators,
		refreshConfigs,
		refreshRuns,
		addCreator,
		archiveCreator,
		retryCreatorEnrichment,
		saveConfig,
		setConfigCreators,
		removeConfig,
		launchRun,
		cancelRun,
	};
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useCompetitorAnalyzer.ts
git commit -m "feat(frontend/hooks): useCompetitorAnalyzer with SSE"
```

---

### Task 7.3: Add `competitor-analyzer` to frontend MenuKey union

**Files:**
- Modify: `frontend/src/contexts/ProjectContext.tsx`

- [ ] **Step 1: Find the `MenuKey` type declaration**

Open `frontend/src/contexts/ProjectContext.tsx` and find the line declaring `MenuKey`. It will look like:

```typescript
export type MenuKey =
  | "brand-brain"
  | "product-brain"
  | "topic-generator"
  | "content-generator"
  | "campaign-generator"
  | "topic-library"
  | "content-library"
  | "learning-center"
  | "research-hub";
```

Add `competitor-analyzer` to the union:

```typescript
export type MenuKey =
  | "brand-brain"
  | "product-brain"
  | "topic-generator"
  | "content-generator"
  | "campaign-generator"
  | "topic-library"
  | "content-library"
  | "learning-center"
  | "research-hub"
  | "competitor-analyzer";
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/contexts/ProjectContext.tsx
git commit -m "feat(frontend/types): add competitor-analyzer menu key"
```

---

### Task 7.4: Page shell + tab routing

**Files:**
- Create: `frontend/src/pages/CompetitorAnalyzerPage.tsx`

- [ ] **Step 1: Write the page shell**

```tsx
import { useSearchParams } from "react-router-dom";
import { useCompetitorAnalyzer } from "../hooks/useCompetitorAnalyzer";
import { CreatorsTab } from "../components/competitor-analyzer/CreatorsTab";
import { ConfigsTab } from "../components/competitor-analyzer/ConfigsTab";
import { RunsTab } from "../components/competitor-analyzer/RunsTab";
import { OutputsTab } from "../components/competitor-analyzer/OutputsTab";
import { Spinner } from "../components/ui/Spinner";

const TABS = [
	{ key: "creators", label: "Creators" },
	{ key: "configs", label: "Configs" },
	{ key: "runs", label: "Run Pipeline" },
	{ key: "outputs", label: "Outputs" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function CompetitorAnalyzerPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeTab = (searchParams.get("tab") as TabKey) || "creators";
	const ca = useCompetitorAnalyzer();

	function setTab(key: TabKey) {
		const next = new URLSearchParams(searchParams);
		next.set("tab", key);
		if (key !== "runs") next.delete("runId");
		setSearchParams(next, { replace: true });
	}

	if (!ca.ready) {
		return (
			<div className="p-8 text-center text-gray-500 text-sm">
				Select a workspace and project to use Competitor Analyzer.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<header>
				<h1 className="text-2xl font-semibold text-gray-900">Competitor Analyzer</h1>
				<p className="text-sm text-gray-500 mt-1">
					Scrape viral competitor videos, analyze their hooks and retention, and generate tailored scripts.
				</p>
			</header>

			<div className="border-b border-gray-200">
				<nav className="flex gap-6">
					{TABS.map((tab) => {
						const active = activeTab === tab.key;
						return (
							<button
								key={tab.key}
								type="button"
								onClick={() => setTab(tab.key)}
								className={`py-3 text-sm font-medium border-b-2 transition-colors ${
									active
										? "border-indigo-600 text-indigo-700"
										: "border-transparent text-gray-500 hover:text-gray-700"
								}`}
							>
								{tab.label}
							</button>
						);
					})}
				</nav>
			</div>

			{ca.loading && (
				<div className="py-12 flex justify-center">
					<Spinner size="lg" />
				</div>
			)}
			{ca.error && (
				<div className="rounded-md bg-red-50 text-red-700 text-sm px-4 py-2">{ca.error}</div>
			)}

			{!ca.loading && (
				<>
					{activeTab === "creators" && <CreatorsTab ca={ca} />}
					{activeTab === "configs" && <ConfigsTab ca={ca} />}
					{activeTab === "runs" && <RunsTab ca={ca} />}
					{activeTab === "outputs" && <OutputsTab ca={ca} />}
				</>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Create placeholder stubs for the tab components so the typecheck passes**

Create `frontend/src/components/competitor-analyzer/CreatorsTab.tsx`:

```tsx
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
export function CreatorsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Creators tab — built in Phase 8.</div>;
}
```

Create `frontend/src/components/competitor-analyzer/ConfigsTab.tsx`:

```tsx
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
export function ConfigsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Configs tab — built in Phase 9.</div>;
}
```

Create `frontend/src/components/competitor-analyzer/RunsTab.tsx`:

```tsx
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
export function RunsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Runs tab — built in Phase 10.</div>;
}
```

Create `frontend/src/components/competitor-analyzer/OutputsTab.tsx`:

```tsx
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
export function OutputsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return <div className="text-sm text-gray-500">Outputs tab — built in Phase 11.</div>;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CompetitorAnalyzerPage.tsx frontend/src/components/competitor-analyzer/
git commit -m "feat(frontend/page): competitor analyzer shell + tab stubs"
```

---

### Task 7.5: Register route + add sidebar entry

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`

- [ ] **Step 1: Import the page in App.tsx**

Add next to other page imports:

```tsx
import { CompetitorAnalyzerPage } from "./pages/CompetitorAnalyzerPage";
```

- [ ] **Step 2: Register the route**

Add inside the `<AppShell />` route block, alongside `/research`:

```tsx
<Route path="/competitor-analyzer" element={<CompetitorAnalyzerPage />} />
```

- [ ] **Step 3: Add sidebar entry**

Open `frontend/src/components/layout/AppShell.tsx`. Import the icon:

```tsx
import {
  LayoutDashboard,
  Palette,
  Package,
  Sparkles,
  Megaphone,
  Lightbulb,
  BookOpen,
  Library,
  GraduationCap,
  Settings,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  LogOut,
  Search,
  LineChart,
} from "lucide-react";
```

Find the `navSections` array, locate the "Research" section, and add a second item:

```tsx
  {
    label: "Research",
    items: [
      { to: "/research", label: "Research Hub", icon: Search, menuKey: "research-hub" },
      { to: "/competitor-analyzer", label: "Competitor Analyzer", icon: LineChart, menuKey: "competitor-analyzer" },
    ],
  },
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Smoke test in the browser**

Run: `cd frontend && npm run dev` (separate terminal: `cd backend && bun run --hot src/index.ts`)

Open `http://localhost:5173/competitor-analyzer`. Expected:
- Page loads with header + 4 tab buttons.
- Clicking each tab updates the URL query param and shows the placeholder stub text.
- Sidebar shows "Competitor Analyzer" under Research (for users with the menu granted; as an admin/superadmin, it's visible automatically).

Stop both servers when done.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/AppShell.tsx
git commit -m "feat(frontend/nav): register competitor analyzer route + sidebar"
```

---

## Phase 8 — Creators Tab

Build the Creators tab: add form, card grid, optimistic insert with async enrichment chip.

---

### Task 8.1: CreatorAddForm

**Files:**
- Create: `frontend/src/components/competitor-analyzer/CreatorAddForm.tsx` (replace stub)

- [ ] **Step 1: Write the form**

```tsx
import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface Props {
	onSubmit: (input: { profileUrl: string; username: string; niche: string }) => Promise<void>;
}

export function CreatorAddForm({ onSubmit }: Props) {
	const [profileUrl, setProfileUrl] = useState("");
	const [username, setUsername] = useState("");
	const [niche, setNiche] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!profileUrl.trim() || !username.trim() || !niche.trim()) {
			setError("All fields required");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			await onSubmit({
				profileUrl: profileUrl.trim(),
				username: username.trim().replace(/^@/, ""),
				niche: niche.trim(),
			});
			setProfileUrl("");
			setUsername("");
			setNiche("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add creator");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Add a creator</p>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<Input
					label="TikTok URL"
					value={profileUrl}
					onChange={(e) => setProfileUrl(e.target.value)}
					placeholder="https://tiktok.com/@handle"
				/>
				<Input
					label="Username"
					value={username}
					onChange={(e) => setUsername(e.target.value)}
					placeholder="handle"
				/>
				<Input
					label="Niche"
					value={niche}
					onChange={(e) => setNiche(e.target.value)}
					placeholder="fitness, fashion, …"
				/>
			</div>
			{error && <p className="text-xs text-red-500">{error}</p>}
			<div className="flex justify-end">
				<Button type="submit" loading={submitting}>
					Add Creator
				</Button>
			</div>
		</form>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor-analyzer/CreatorAddForm.tsx
git commit -m "feat(frontend): CreatorAddForm"
```

---

### Task 8.2: CreatorCard

**Files:**
- Create: `frontend/src/components/competitor-analyzer/CreatorCard.tsx`

- [ ] **Step 1: Write the card**

```tsx
import { RefreshCw, Trash2 } from "lucide-react";
import type { Creator } from "../../services/competitor-analyzer.api";

interface Props {
	creator: Creator;
	onArchive: (id: string) => Promise<void>;
	onRetryEnrichment: (id: string) => Promise<void>;
}

function formatFollowers(count: number | null): string {
	if (count === null) return "—";
	if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
	if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
	return count.toString();
}

export function CreatorCard({ creator, onArchive, onRetryEnrichment }: Props) {
	const isPending = creator.enrichmentStatus === "pending";
	const isFailed = creator.enrichmentStatus === "failed";

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 flex items-center gap-3">
			<div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden shrink-0">
				{creator.avatarUrl ? (
					<img src={creator.avatarUrl} alt={creator.username} className="w-full h-full object-cover" />
				) : (
					<div className="w-full h-full flex items-center justify-center text-gray-400 text-lg">
						{creator.username.charAt(0).toUpperCase()}
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-gray-900 truncate">@{creator.username}</span>
					{isPending && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
							enriching…
						</span>
					)}
					{isFailed && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
							failed
						</span>
					)}
				</div>
				<div className="text-xs text-gray-500 mt-0.5">
					{creator.niche} · {formatFollowers(creator.followerCount)} followers
				</div>
				{isFailed && creator.enrichmentError && (
					<div className="text-[11px] text-red-600 mt-0.5 truncate" title={creator.enrichmentError}>
						{creator.enrichmentError}
					</div>
				)}
			</div>
			<div className="flex items-center gap-1 shrink-0">
				{(isFailed || !isPending) && (
					<button
						type="button"
						onClick={() => onRetryEnrichment(creator.id)}
						className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
						title="Refresh profile"
					>
						<RefreshCw size={14} />
					</button>
				)}
				<button
					type="button"
					onClick={() => {
						if (confirm(`Archive creator @${creator.username}?`)) onArchive(creator.id);
					}}
					className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
					title="Archive"
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor-analyzer/CreatorCard.tsx
git commit -m "feat(frontend): CreatorCard"
```

---

### Task 8.3: Empty state + full Creators tab

**Files:**
- Create: `frontend/src/components/competitor-analyzer/CreatorsEmptyState.tsx`
- Replace: `frontend/src/components/competitor-analyzer/CreatorsTab.tsx`

- [ ] **Step 1: Write the empty state**

```tsx
import { Users } from "lucide-react";

export function CreatorsEmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-12 px-4 border border-dashed border-gray-300 rounded-md bg-gray-50/50">
			<Users size={28} className="text-gray-400 mb-2" />
			<p className="text-sm font-medium text-gray-700">No creators yet</p>
			<p className="text-xs text-gray-500 mt-1">Add your first competitor using the form above.</p>
		</div>
	);
}
```

- [ ] **Step 2: Replace the Creators tab stub with the real tab**

```tsx
// frontend/src/components/competitor-analyzer/CreatorsTab.tsx
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { CreatorAddForm } from "./CreatorAddForm";
import { CreatorCard } from "./CreatorCard";
import { CreatorsEmptyState } from "./CreatorsEmptyState";

export function CreatorsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	return (
		<div className="space-y-4">
			<CreatorAddForm onSubmit={ca.addCreator} />

			{ca.creators.length === 0 ? (
				<CreatorsEmptyState />
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
					{ca.creators.map((creator) => (
						<CreatorCard
							key={creator.id}
							creator={creator}
							onArchive={ca.archiveCreator}
							onRetryEnrichment={ca.retryCreatorEnrichment}
						/>
					))}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/competitor-analyzer/
git commit -m "feat(frontend): Creators tab"
```

---

## Phase 9 — Configs Tab

Config form, creator picker, list, delete.

---

### Task 9.1: ConfigForm

**Files:**
- Create: `frontend/src/components/competitor-analyzer/ConfigForm.tsx`

- [ ] **Step 1: Write the form**

```tsx
import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";

interface Props {
	initial?: AnalysisConfig | null;
	onSubmit: (input: {
		id?: string;
		name: string;
		targetNiche?: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	}) => Promise<AnalysisConfig>;
	onCancel: () => void;
}

export function ConfigForm({ initial, onSubmit, onCancel }: Props) {
	const [name, setName] = useState("");
	const [targetNiche, setTargetNiche] = useState("");
	const [brandContext, setBrandContext] = useState("");
	const [analysisInstructions, setAnalysisInstructions] = useState("");
	const [outputPreferences, setOutputPreferences] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		setName(initial?.name ?? "");
		setTargetNiche(initial?.targetNiche ?? "");
		setBrandContext(initial?.brandContext ?? "");
		setAnalysisInstructions(initial?.analysisInstructions ?? "");
		setOutputPreferences(initial?.outputPreferences ?? "");
		setError("");
	}, [initial]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError("");
		try {
			await onSubmit({
				id: initial?.id,
				name,
				targetNiche: targetNiche || undefined,
				brandContext,
				analysisInstructions,
				outputPreferences,
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save config");
			setSubmitting(false);
			return;
		}
		setSubmitting(false);
	}

	return (
		<form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
				{initial ? "Edit config" : "New config"}
			</p>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				<Input label="Config Name" value={name} onChange={(e) => setName(e.target.value)} />
				<Input
					label="Target Niche"
					value={targetNiche}
					onChange={(e) => setTargetNiche(e.target.value)}
					placeholder="fitness, fashion, …"
				/>
			</div>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Brand Context
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={brandContext}
					onChange={(e) => setBrandContext(e.target.value)}
					placeholder="Who we are, what we sell, who we serve."
				/>
			</label>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Analysis Instructions
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={analysisInstructions}
					onChange={(e) => setAnalysisInstructions(e.target.value)}
					placeholder='Analyze the hook, retention mechanisms, and CTA.'
				/>
			</label>
			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Output Preferences
				</span>
				<textarea
					className="w-full min-h-[64px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={outputPreferences}
					onChange={(e) => setOutputPreferences(e.target.value)}
					placeholder='Generate 3 different script concepts with B-roll descriptions.'
				/>
			</label>
			{error && <p className="text-xs text-red-500">{error}</p>}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="secondary" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" loading={submitting}>
					{initial ? "Save changes" : "Create config"}
				</Button>
			</div>
		</form>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor-analyzer/ConfigForm.tsx
git commit -m "feat(frontend): ConfigForm"
```

---

### Task 9.2: ConfigCreatorPicker

**Files:**
- Create: `frontend/src/components/competitor-analyzer/ConfigCreatorPicker.tsx`

- [ ] **Step 1: Write the picker**

```tsx
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Creator } from "../../services/competitor-analyzer.api";

interface Props {
	creators: Creator[];
	selectedIds: string[];
	onSave: (creatorIds: string[]) => Promise<void>;
}

export function ConfigCreatorPicker({ creators, selectedIds, onSave }: Props) {
	const [local, setLocal] = useState(new Set(selectedIds));
	const [nicheFilter, setNicheFilter] = useState("");
	const [saving, setSaving] = useState(false);

	const filtered = useMemo(() => {
		const q = nicheFilter.toLowerCase().trim();
		if (!q) return creators;
		return creators.filter(
			(c) =>
				c.niche.toLowerCase().includes(q) ||
				c.username.toLowerCase().includes(q),
		);
	}, [creators, nicheFilter]);

	function toggle(id: string) {
		const next = new Set(local);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		setLocal(next);
	}

	async function handleSave() {
		setSaving(true);
		try {
			await onSave(Array.from(local));
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Linked creators ({local.size})
				</p>
				<div className="w-56">
					<Input
						placeholder="Filter by niche or username"
						value={nicheFilter}
						onChange={(e) => setNicheFilter(e.target.value)}
					/>
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="text-sm text-gray-500 py-4 text-center">No creators match.</p>
			) : (
				<div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded">
					{filtered.map((creator) => {
						const selected = local.has(creator.id);
						return (
							<label
								key={creator.id}
								className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
							>
								<input
									type="checkbox"
									checked={selected}
									onChange={() => toggle(creator.id)}
									className="w-4 h-4 rounded border-gray-300 text-indigo-600"
								/>
								<div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden shrink-0">
									{creator.avatarUrl && (
										<img src={creator.avatarUrl} alt="" className="w-full h-full object-cover" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="text-sm text-gray-900 truncate">@{creator.username}</div>
									<div className="text-xs text-gray-500">{creator.niche}</div>
								</div>
							</label>
						);
					})}
				</div>
			)}

			<div className="flex justify-end">
				<Button onClick={handleSave} loading={saving} disabled={local.size === 0 && selectedIds.length === 0}>
					Save creator list
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor-analyzer/ConfigCreatorPicker.tsx
git commit -m "feat(frontend): ConfigCreatorPicker"
```

---

### Task 9.3: ConfigCard + ConfigsTab

**Files:**
- Create: `frontend/src/components/competitor-analyzer/ConfigCard.tsx`
- Replace: `frontend/src/components/competitor-analyzer/ConfigsTab.tsx`

- [ ] **Step 1: Write ConfigCard**

```tsx
// frontend/src/components/competitor-analyzer/ConfigCard.tsx
import { Pencil, Trash2, Users } from "lucide-react";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";

interface Props {
	config: AnalysisConfig;
	onEdit: (config: AnalysisConfig) => void;
	onDelete: (id: string) => Promise<void>;
}

export function ConfigCard({ config, onEdit, onDelete }: Props) {
	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 flex items-center gap-3">
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium text-gray-900 truncate">{config.name}</span>
					{config.targetNiche && (
						<span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium">
							{config.targetNiche}
						</span>
					)}
				</div>
				<div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
					<span className="flex items-center gap-1">
						<Users size={12} />
						{config.creators?.length ?? 0} creators
					</span>
					{config._count && <span>{config._count.runs} runs</span>}
				</div>
				<p className="text-xs text-gray-400 mt-1 line-clamp-1">{config.brandContext}</p>
			</div>
			<div className="flex items-center gap-1 shrink-0">
				<button
					type="button"
					onClick={() => onEdit(config)}
					className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
					title="Edit"
				>
					<Pencil size={14} />
				</button>
				<button
					type="button"
					onClick={() => {
						if (confirm(`Delete config "${config.name}"? Historical runs will remain.`))
							onDelete(config.id);
					}}
					className="p-1.5 rounded hover:bg-red-50 text-gray-500 hover:text-red-600"
					title="Delete"
				>
					<Trash2 size={14} />
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Replace ConfigsTab**

```tsx
// frontend/src/components/competitor-analyzer/ConfigsTab.tsx
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "../ui/Button";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import type { AnalysisConfig } from "../../services/competitor-analyzer.api";
import { ConfigCard } from "./ConfigCard";
import { ConfigForm } from "./ConfigForm";
import { ConfigCreatorPicker } from "./ConfigCreatorPicker";

export function ConfigsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const [editing, setEditing] = useState<AnalysisConfig | null>(null);
	const [creating, setCreating] = useState(false);
	const [pickerConfig, setPickerConfig] = useState<AnalysisConfig | null>(null);

	async function handleSubmit(input: Parameters<typeof ca.saveConfig>[0]) {
		const saved = await ca.saveConfig(input);
		setEditing(null);
		setCreating(false);
		// After create/edit, open the picker step.
		const fresh = ca.configs.find((c) => c.id === saved.id) ?? saved;
		setPickerConfig(fresh as AnalysisConfig);
		return saved;
	}

	return (
		<div className="space-y-4">
			{!creating && !editing && (
				<div className="flex justify-end">
					<Button onClick={() => setCreating(true)}>
						<Plus size={14} className="mr-1" />
						New Config
					</Button>
				</div>
			)}

			{(creating || editing) && (
				<ConfigForm
					initial={editing}
					onSubmit={handleSubmit}
					onCancel={() => {
						setEditing(null);
						setCreating(false);
					}}
				/>
			)}

			{pickerConfig && (
				<ConfigCreatorPicker
					creators={ca.creators}
					selectedIds={
						ca.configs.find((c) => c.id === pickerConfig.id)?.creators.map((c) => c.id) ?? []
					}
					onSave={async (ids) => {
						await ca.setConfigCreators(pickerConfig.id, ids);
						setPickerConfig(null);
					}}
				/>
			)}

			{ca.configs.length === 0 && !creating && (
				<div className="py-12 text-center text-sm text-gray-500 border border-dashed border-gray-300 rounded-md">
					No configs yet. Click "New Config" to get started.
				</div>
			)}

			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{ca.configs.map((config) => (
					<ConfigCard
						key={config.id}
						config={config}
						onEdit={(c) => setEditing(c)}
						onDelete={ca.removeConfig}
					/>
				))}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/competitor-analyzer/
git commit -m "feat(frontend): Configs tab"
```

---

## Phase 10 — Runs Tab

Launcher + list + live progress + per-video analysis cards.

---

### Task 10.1: RunLauncher

**Files:**
- Create: `frontend/src/components/competitor-analyzer/RunLauncher.tsx`

- [ ] **Step 1: Write the launcher**

```tsx
import { useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";

interface Props {
	ca: ReturnType<typeof useCompetitorAnalyzer>;
	onLaunched: (runId: string) => void;
}

export function RunLauncher({ ca, onLaunched }: Props) {
	const [configId, setConfigId] = useState<string>(ca.configs[0]?.id ?? "");
	const [videosPerCreator, setVideosPerCreator] = useState(3);
	const [lookbackPool, setLookbackPool] = useState(20);
	const [timeframeDays, setTimeframeDays] = useState(30);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");

	const hasActiveRunForConfig = ca.runs.some(
		(r) => r.configId === configId && !["completed", "failed"].includes(r.status),
	);

	async function handleLaunch() {
		if (!configId) {
			setError("Pick a config first");
			return;
		}
		setSubmitting(true);
		setError("");
		try {
			const run = await ca.launchRun({
				configId,
				videosPerCreator,
				lookbackPool,
				timeframeDays,
			});
			onLaunched(run.id);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Launch failed");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
			<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Launch a pipeline run</p>

			<label className="block">
				<span className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
					Config
				</span>
				<select
					className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					value={configId}
					onChange={(e) => setConfigId(e.target.value)}
				>
					<option value="">— select a config —</option>
					{ca.configs.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name} ({c.creators?.length ?? 0} creators)
						</option>
					))}
				</select>
			</label>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
				<Input
					label="Videos per creator"
					type="number"
					min={1}
					max={10}
					value={videosPerCreator}
					onChange={(e) => setVideosPerCreator(Number(e.target.value))}
				/>
				<Input
					label="Out of last N"
					type="number"
					min={5}
					max={50}
					value={lookbackPool}
					onChange={(e) => setLookbackPool(Number(e.target.value))}
				/>
				<Input
					label="Timeframe (days)"
					type="number"
					min={1}
					max={90}
					value={timeframeDays}
					onChange={(e) => setTimeframeDays(Number(e.target.value))}
				/>
			</div>

			{hasActiveRunForConfig && (
				<p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
					A run is already in progress for this config. Wait for it to finish before launching another.
				</p>
			)}
			{error && <p className="text-xs text-red-500">{error}</p>}

			<div className="flex justify-end">
				<Button onClick={handleLaunch} loading={submitting} disabled={hasActiveRunForConfig}>
					Run Pipeline
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/competitor-analyzer/RunLauncher.tsx
git commit -m "feat(frontend): RunLauncher"
```

---

### Task 10.2: RunsList + RunProgressBar

**Files:**
- Create: `frontend/src/components/competitor-analyzer/RunsList.tsx`
- Create: `frontend/src/components/competitor-analyzer/RunProgressBar.tsx`

- [ ] **Step 1: Write RunsList**

```tsx
// frontend/src/components/competitor-analyzer/RunsList.tsx
import type { PipelineRun } from "../../services/competitor-analyzer.api";

const STATUS_COLORS: Record<string, string> = {
	pending: "bg-gray-100 text-gray-700",
	scraping: "bg-blue-100 text-blue-700",
	analyzing: "bg-blue-100 text-blue-700",
	generating: "bg-blue-100 text-blue-700",
	completed: "bg-green-100 text-green-700",
	failed: "bg-red-100 text-red-700",
	cancelling: "bg-amber-100 text-amber-800",
};

interface Props {
	runs: PipelineRun[];
	activeId: string | null;
	onSelect: (id: string) => void;
}

export function RunsList({ runs, activeId, onSelect }: Props) {
	if (runs.length === 0) {
		return (
			<div className="text-sm text-gray-500 text-center py-6">No runs yet.</div>
		);
	}
	return (
		<div className="space-y-1">
			{runs.map((run) => {
				const active = run.id === activeId;
				return (
					<button
						type="button"
						key={run.id}
						onClick={() => onSelect(run.id)}
						className={`w-full text-left px-3 py-2 rounded-md border ${
							active
								? "border-indigo-400 bg-indigo-50/40"
								: "border-gray-200 hover:bg-gray-50"
						}`}
					>
						<div className="flex items-center gap-2">
							<span
								className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
									STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-700"
								}`}
							>
								{run.status}
							</span>
							<span className="text-xs text-gray-500">
								{new Date(run.createdAt).toLocaleString()}
							</span>
						</div>
						<div className="text-xs text-gray-600 mt-1 truncate">
							{run.stage ?? (run.errorMessage ? `Error: ${run.errorMessage}` : "—")}
						</div>
					</button>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 2: Write RunProgressBar**

```tsx
// frontend/src/components/competitor-analyzer/RunProgressBar.tsx
import type { PipelineRun } from "../../services/competitor-analyzer.api";

const STAGES = [
	{ key: "scraping", label: "Scrape" },
	{ key: "analyzing", label: "Analyze" },
	{ key: "generating", label: "Scripts" },
	{ key: "completed", label: "Done" },
] as const;

const ACTIVE_AT: Record<string, number> = {
	pending: 0,
	scraping: 0,
	analyzing: 1,
	generating: 2,
	completed: 3,
	failed: -1,
	cancelling: -1,
};

export function RunProgressBar({ run }: { run: PipelineRun }) {
	const activeIdx = ACTIVE_AT[run.status] ?? -1;
	const failed = run.status === "failed" || run.status === "cancelling";

	return (
		<div className="flex items-center gap-2">
			{STAGES.map((stage, i) => {
				const done = !failed && i <= activeIdx;
				const current = !failed && i === activeIdx;
				return (
					<div key={stage.key} className="flex items-center gap-2">
						<span
							className={`text-[11px] px-2 py-1 rounded-md font-medium ${
								failed
									? "bg-red-50 text-red-600"
									: done
										? "bg-indigo-600 text-white"
										: current
											? "bg-indigo-100 text-indigo-700 animate-pulse"
											: "bg-gray-100 text-gray-500"
							}`}
						>
							{stage.label}
						</span>
						{i < STAGES.length - 1 && <div className="w-4 h-px bg-gray-300" />}
					</div>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/competitor-analyzer/RunsList.tsx frontend/src/components/competitor-analyzer/RunProgressBar.tsx
git commit -m "feat(frontend): RunsList + RunProgressBar"
```

---

### Task 10.3: VideoAnalysisCard + RunDetail + RunsTab

**Files:**
- Create: `frontend/src/components/competitor-analyzer/VideoAnalysisCard.tsx`
- Create: `frontend/src/components/competitor-analyzer/RunDetail.tsx`
- Replace: `frontend/src/components/competitor-analyzer/RunsTab.tsx`

- [ ] **Step 1: Write VideoAnalysisCard**

```tsx
// frontend/src/components/competitor-analyzer/VideoAnalysisCard.tsx
import { ExternalLink } from "lucide-react";
import type { PipelineContent } from "../../services/competitor-analyzer.api";

function formatNumber(n: number | null): string {
	if (n === null) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toString();
}

export function VideoAnalysisCard({ video }: { video: PipelineContent }) {
	const statusBadge = {
		pending: "bg-gray-100 text-gray-700",
		running: "bg-blue-100 text-blue-700 animate-pulse",
		completed: "bg-green-100 text-green-700",
		failed: "bg-red-100 text-red-700",
	}[video.analysisStatus];

	return (
		<div className="border border-gray-200 rounded-md p-3 flex gap-3 bg-white">
			<div className="w-20 h-28 rounded bg-gray-100 overflow-hidden shrink-0">
				{video.thumbnailUrl ? (
					<img
						src={video.thumbnailUrl}
						alt=""
						loading="lazy"
						className="w-full h-full object-cover"
					/>
				) : null}
			</div>
			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-2">
					<span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge}`}>
						{video.analysisStatus}
					</span>
					<span className="text-xs text-gray-500">
						{formatNumber(video.viewCount)} views · {formatNumber(video.likeCount)} likes
					</span>
					<a
						href={video.contentUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="ml-auto text-gray-400 hover:text-gray-700"
						title="Open video"
					>
						<ExternalLink size={12} />
					</a>
				</div>
				<p className="text-sm text-gray-900 mt-1 line-clamp-2">{video.caption ?? "—"}</p>
				{video.analysisJson && (
					<div className="mt-2 text-xs text-gray-600 space-y-1">
						<p>
							<span className="font-semibold text-gray-800">Hook:</span> {video.analysisJson.hook}
						</p>
						<p>
							<span className="font-semibold text-gray-800">Why it went viral:</span>{" "}
							{video.analysisJson.whyItWentViral}
						</p>
					</div>
				)}
				{video.analysisError && (
					<p className="text-xs text-red-600 mt-1">Error: {video.analysisError}</p>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Write RunDetail**

```tsx
// frontend/src/components/competitor-analyzer/RunDetail.tsx
import { Button } from "../ui/Button";
import type { PipelineRunDetail } from "../../services/competitor-analyzer.api";
import { RunProgressBar } from "./RunProgressBar";
import { VideoAnalysisCard } from "./VideoAnalysisCard";

interface Props {
	run: PipelineRunDetail;
	onCancel: () => Promise<void>;
}

export function RunDetail({ run, onCancel }: Props) {
	const isTerminal = run.status === "completed" || run.status === "failed";

	return (
		<div className="space-y-4">
			<div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
				<div className="flex items-center justify-between gap-3">
					<div className="min-w-0">
						<p className="text-xs text-gray-500">
							Run · {new Date(run.createdAt).toLocaleString()}
						</p>
						<p className="text-sm font-medium text-gray-900 truncate">
							{run.config?.name ?? "(config deleted)"}
						</p>
					</div>
					{!isTerminal && (
						<Button variant="secondary" onClick={onCancel}>
							Cancel
						</Button>
					)}
				</div>
				<RunProgressBar run={run} />
				<p className="text-xs text-gray-600">
					{run.stage ? `Stage: ${run.stage}` : ""}
					{run.errorMessage ? (
						<span className="text-red-600"> · {run.errorMessage}</span>
					) : null}
				</p>
				<p className="text-[11px] text-gray-400 font-mono">runId: {run.id}</p>
			</div>

			<div className="space-y-2">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Analyzed videos ({run.videos.length})
				</p>
				{run.videos.length === 0 ? (
					<p className="text-sm text-gray-500">No videos yet.</p>
				) : (
					<div className="space-y-2">
						{run.videos.map((v) => (
							<VideoAnalysisCard key={v.id} video={v} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: Replace RunsTab**

```tsx
// frontend/src/components/competitor-analyzer/RunsTab.tsx
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { RunLauncher } from "./RunLauncher";
import { RunsList } from "./RunsList";
import { RunDetail } from "./RunDetail";

export function RunsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const [searchParams, setSearchParams] = useSearchParams();
	const activeRunId = searchParams.get("runId");

	useEffect(() => {
		if (activeRunId && ca.activeRun?.id !== activeRunId) {
			ca.loadRun(activeRunId).catch(() => {});
		}
	}, [activeRunId, ca]);

	function selectRun(id: string) {
		const next = new URLSearchParams(searchParams);
		next.set("runId", id);
		setSearchParams(next, { replace: true });
	}

	return (
		<div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
			<div className="space-y-3">
				<RunsList
					runs={ca.runs}
					activeId={activeRunId}
					onSelect={selectRun}
				/>
			</div>

			<div>
				{ca.activeRun ? (
					<RunDetail run={ca.activeRun} onCancel={() => ca.cancelRun(ca.activeRun!.id)} />
				) : (
					<RunLauncher ca={ca} onLaunched={selectRun} />
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/competitor-analyzer/
git commit -m "feat(frontend): Runs tab with live progress + video cards"
```

---

## Phase 11 — Outputs Tab

Generated scripts, flat list, per-script detail, copy-to-clipboard.

---

### Task 11.1: ScriptDetail + ScriptsList + OutputsTab

**Files:**
- Create: `frontend/src/components/competitor-analyzer/ScriptDetail.tsx`
- Create: `frontend/src/components/competitor-analyzer/ScriptsList.tsx`
- Replace: `frontend/src/components/competitor-analyzer/OutputsTab.tsx`

- [ ] **Step 1: Write ScriptDetail**

```tsx
// frontend/src/components/competitor-analyzer/ScriptDetail.tsx
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import type { PipelineScript } from "../../services/competitor-analyzer.api";

export function ScriptDetail({ script }: { script: PipelineScript }) {
	const [copied, setCopied] = useState(false);
	const text = [
		script.title ? `Title: ${script.title}` : "",
		`Hook: ${script.hook ?? ""}`,
		`Body: ${script.body ?? ""}`,
		script.broll?.length
			? `B-roll:\n${script.broll.map((b) => `- ${b.scene}: ${b.description}`).join("\n")}`
			: "",
		`CTA: ${script.cta ?? ""}`,
	]
		.filter(Boolean)
		.join("\n\n");

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		} catch {
			/* ignore */
		}
	}

	return (
		<div className="bg-white border border-gray-200 rounded-md p-4 space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
					Script {script.scriptNumber}
					{script.title && <span className="text-gray-700 normal-case"> · {script.title}</span>}
				</p>
				<button
					type="button"
					onClick={copyToClipboard}
					className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
				>
					{copied ? <Check size={12} /> : <Copy size={12} />}
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			{script.hook && (
				<p className="text-sm">
					<span className="font-semibold text-gray-800">Hook:</span> {script.hook}
				</p>
			)}
			{script.body && (
				<p className="text-sm text-gray-800 whitespace-pre-wrap">{script.body}</p>
			)}
			{script.broll && script.broll.length > 0 && (
				<div className="text-sm text-gray-700 mt-2">
					<p className="font-semibold text-gray-800">B-roll</p>
					<ul className="list-disc pl-5 space-y-0.5">
						{script.broll.map((b, i) => (
							<li key={i}>
								<span className="text-gray-500">{b.scene}</span> — {b.description}
							</li>
						))}
					</ul>
				</div>
			)}
			{script.cta && (
				<p className="text-sm">
					<span className="font-semibold text-gray-800">CTA:</span> {script.cta}
				</p>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Write ScriptsList**

```tsx
// frontend/src/components/competitor-analyzer/ScriptsList.tsx
import type { PipelineScript } from "../../services/competitor-analyzer.api";
import { ScriptDetail } from "./ScriptDetail";

export function ScriptsList({ scripts }: { scripts: PipelineScript[] }) {
	if (scripts.length === 0) {
		return (
			<div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-300 rounded-md">
				No generated scripts yet. Run a pipeline first.
			</div>
		);
	}
	return (
		<div className="space-y-2">
			{scripts.map((s) => (
				<ScriptDetail key={s.id} script={s} />
			))}
		</div>
	);
}
```

- [ ] **Step 3: Replace OutputsTab**

```tsx
// frontend/src/components/competitor-analyzer/OutputsTab.tsx
import { useEffect, useMemo, useState } from "react";
import type { useCompetitorAnalyzer } from "../../hooks/useCompetitorAnalyzer";
import { getRun } from "../../services/competitor-analyzer.api";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useProject } from "../../hooks/useProject";
import { ScriptsList } from "./ScriptsList";

export function OutputsTab({ ca }: { ca: ReturnType<typeof useCompetitorAnalyzer> }) {
	const { activeWorkspace } = useWorkspace();
	const { activeProject } = useProject();
	const [filterRunId, setFilterRunId] = useState<string>("");
	const [scripts, setScripts] = useState<ReturnType<typeof Array<any>>[0] extends never ? never : any[]>([]);
	const [loading, setLoading] = useState(false);

	const completedRuns = useMemo(
		() => ca.runs.filter((r) => r.status === "completed"),
		[ca.runs],
	);

	useEffect(() => {
		if (!activeWorkspace || !activeProject) return;
		if (completedRuns.length === 0) {
			setScripts([]);
			return;
		}
		const targetRunIds = filterRunId ? [filterRunId] : completedRuns.map((r) => r.id);
		setLoading(true);
		Promise.all(
			targetRunIds.map((id) => getRun(activeWorkspace.id, activeProject.id, id).then((r) => r.scripts)),
		)
			.then((all) => setScripts(all.flat()))
			.catch(() => setScripts([]))
			.finally(() => setLoading(false));
	}, [filterRunId, activeWorkspace, activeProject, completedRuns]);

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-3">
				<label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
					Filter by run
				</label>
				<select
					value={filterRunId}
					onChange={(e) => setFilterRunId(e.target.value)}
					className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				>
					<option value="">All completed runs</option>
					{completedRuns.map((r) => (
						<option key={r.id} value={r.id}>
							{new Date(r.createdAt).toLocaleString()}
						</option>
					))}
				</select>
			</div>

			{loading ? (
				<p className="text-sm text-gray-500">Loading…</p>
			) : (
				<ScriptsList scripts={scripts} />
			)}
		</div>
	);
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Manual smoke test**

Boot backend + frontend. In browser:
1. `/competitor-analyzer?tab=creators` → add a creator. Card should appear immediately with "enriching…" chip. After ~30s (real Apify), chip flips to enriched avatar + follower count.
2. `/competitor-analyzer?tab=configs` → create config, save, link creators.
3. `/competitor-analyzer?tab=runs` → launch pipeline. Status chip updates, progress bar animates. Video cards appear with spinners, then check marks.
4. `/competitor-analyzer?tab=outputs` → scripts visible after run completes. Copy button works.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/competitor-analyzer/
git commit -m "feat(frontend): Outputs tab with generated scripts"
```

---

## Phase 12 — Monitoring, Docs, Scripts

Final polish: Grafana panels, runbook doc, operator + seed scripts.

---

### Task 12.1: Monitoring doc

**Files:**
- Create: `docs/competitor-analyzer-monitoring.md`

- [ ] **Step 1: Write the doc**

```markdown
# Competitor Analyzer — Monitoring & Runbook

## SSE Event Catalog

| Event type | Payload | When emitted |
|-----------|---------|--------------|
| `creator_enrichment_completed` | `{ creatorId, status }` | After profile scrape finishes (enriched OR failed) |
| `competitor_pipeline_stage_changed` | `{ runId, status, stage }` | On every stage transition in the pipeline |
| `competitor_pipeline_video_analyzed` | `{ runId, videoId, status }` | After each video's Gemini analysis completes or fails |
| `competitor_pipeline_completed` | `{ runId, videoCount, scriptCount }` | After Stage 5 finishes |
| `competitor_pipeline_failed` | `{ runId, errorMessage }` | On any fatal failure |

## LogQL Query Cookbook

Use in Grafana Explore against the `app="fce-backend"` Loki stream.

**Pipeline runs started per hour:**
```logql
sum(count_over_time({app="fce-backend"} |= "cp_started" [1h]))
```

**Success rate over last 24h:**
```logql
sum(count_over_time({app="fce-backend"} |= "cp_completed" [24h]))
/
sum(count_over_time({app="fce-backend"} |~ "cp_completed|cp_failed" [24h]))
```

**All logs for a specific run:**
```logql
{app="fce-backend"} |= "<runId>"
```

**Video analysis latency p95 (last 5m):**
```logql
quantile_over_time(0.95,
  {app="fce-backend"} |= "cp_video"
  | regexp `"durationMs":(?P<ms>[0-9]+)`
  | unwrap ms
  [5m]
)
```

## SQL Query Cookbook

Run these against Postgres (port 5433 in dev). See [database-access.md](database-access.md) for the full appendix.

(Identical to the queries in the Spec → Section 4.3.)

## Runbook

### "Pipeline is stuck"

1. Check Grafana panel "Pipeline failures by stage" for recent failures.
2. SQL query 2 to find stuck runs (started but not completed after 45 min).
3. If `stage = scraping_creator_X_of_Y`: check Apify dashboard at apify.com → Runs.
4. If `stage = analyzing_video_X_of_Y`: check Gemini billing quota + Files API errors.
5. If nothing obvious: search Loki for `runId=<id>` to find the last emitted event.

### "Run keeps failing on video analysis"

1. Panel "Video failure reasons" shows common reasons grouped.
2. Top reasons + fixes:
   - "Video exceeds 50 MB cap" → TikTok returned a long-form video. Skip that creator or increase cap.
   - "Gemini file processing FAILED" → temporary Gemini issue; retry.
   - "video download timed out" → Apify returned a dead CDN URL. Re-scrape the creator.

### "Enrichment stays pending"

1. SQL query 5 — pending count > 0 for more than a few minutes indicates a worker issue.
2. Check that the `creator-enrichment` pg-boss queue has a worker registered: `SELECT * FROM pgboss.worker WHERE name = 'creator-enrichment' AND active = true`.
3. If the backend was restarted and the worker didn't re-register, restart the backend.

## Smoke-Test Checklist

Before shipping any change touching this feature, manually verify:

1. Add creator → "enriching…" chip appears → real avatar + follower count arrive within 60 seconds.
2. Create config, link creators, save.
3. Launch pipeline → live progress updates every few seconds.
4. Open completed video card → analysis text renders.
5. Switch to Outputs tab → scripts appear.
6. Grant/revoke `competitor-analyzer` to a MEMBER via Workspace Settings → Projects → member editor → sidebar hides/shows.
7. Remove Apify key → run fails with clear message → restore key → retry works.
```

- [ ] **Step 2: Commit**

```bash
git add docs/competitor-analyzer-monitoring.md
git commit -m "docs: competitor analyzer monitoring + runbook"
```

---

### Task 12.2: SQL appendix in database-access.md

**Files:**
- Modify: `docs/database-access.md`

- [ ] **Step 1: Append the section**

Open `docs/database-access.md` and append at the end:

```markdown

## Competitor Analyzer — Operator Queries

### 1. Failed runs in last 24h
```sql
SELECT id, project_id, stage, error_message, started_at, completed_at
FROM competitor_pipeline_runs
WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### 2. "Stuck" runs (started but not completed beyond 45 min)
```sql
SELECT id, project_id, status, stage, started_at
FROM competitor_pipeline_runs
WHERE status NOT IN ('completed','failed')
  AND started_at < NOW() - INTERVAL '45 minutes';
```

### 3. Per-run video analysis outcome breakdown
```sql
SELECT r.id AS run_id,
       COUNT(*) FILTER (WHERE v.analysis_status = 'completed') AS ok,
       COUNT(*) FILTER (WHERE v.analysis_status = 'failed')    AS failed,
       COUNT(*) FILTER (WHERE v.analysis_status = 'pending')   AS pending
FROM competitor_pipeline_runs r
LEFT JOIN pipeline_content v ON v.run_id = r.id
WHERE r.id = '<run-id>'
GROUP BY r.id;
```

### 4. Cost per run
```sql
SELECT SUM(estimated_cost) AS usd,
       SUM(input_tokens) AS in_tok,
       SUM(output_tokens) AS out_tok
FROM ai_provider_logs
WHERE generator IN ('competitor_video_analysis','competitor_script_generation')
  AND user_prompt LIKE '%<run-id>%';
```

### 5. Creator enrichment queue health
```sql
SELECT enrichment_status, COUNT(*)
FROM creators
WHERE archived_at IS NULL
GROUP BY enrichment_status;
```

### 6. Top-performing analyzed competitor videos per project
```sql
SELECT v.view_count, v.like_count, v.caption, c.username, c.platform, v.created_at
FROM pipeline_content v
JOIN creators c ON c.id = v.creator_id
WHERE c.project_id = '<project-id>' AND v.analysis_status = 'completed'
ORDER BY v.view_count DESC NULLS LAST
LIMIT 20;
```
```

- [ ] **Step 2: Commit**

```bash
git add docs/database-access.md
git commit -m "docs: SQL appendix for competitor analyzer"
```

---

### Task 12.3: Grafana dashboard update

**Files:**
- Modify: `monitoring/grafana/dashboards/fce-backend.json`

- [ ] **Step 1: Add 6 new panels in a Competitor Analyzer row**

The existing dashboard is a Grafana JSON. Grafana panels need unique `id` fields and `gridPos` coordinates. Pick a `y` offset below the last existing panel (open the file and find the max `y + h` of existing panels; call that `Y0`).

Insert these panels into the `panels` array. Update each `id` to an unused integer and each `y` to `Y0 + <offset>`:

```json
{
  "id": 100,
  "type": "row",
  "title": "Competitor Analyzer",
  "gridPos": { "h": 1, "w": 24, "x": 0, "y": 0 },
  "collapsed": false,
  "panels": []
},
{
  "id": 101,
  "type": "stat",
  "title": "Pipeline runs started ($__range)",
  "gridPos": { "h": 5, "w": 4, "x": 0, "y": 1 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "sum(count_over_time({app=~\"$app\"} |= \"cp_started\" [$__range]))"
    }
  ],
  "options": { "reduceOptions": { "calcs": ["lastNotNull"] }, "colorMode": "background" },
  "fieldConfig": { "defaults": { "color": { "mode": "fixed", "fixedColor": "blue" }, "unit": "none", "noValue": "0" } }
},
{
  "id": 102,
  "type": "stat",
  "title": "Success rate (24h)",
  "gridPos": { "h": 5, "w": 4, "x": 4, "y": 1 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "sum(count_over_time({app=~\"$app\"} |= \"cp_completed\" [24h])) / sum(count_over_time({app=~\"$app\"} |~ \"cp_completed|cp_failed\" [24h]))"
    }
  ],
  "options": { "reduceOptions": { "calcs": ["lastNotNull"] }, "colorMode": "background" },
  "fieldConfig": { "defaults": { "color": { "mode": "thresholds" }, "unit": "percentunit", "noValue": "N/A" } }
},
{
  "id": 103,
  "type": "timeseries",
  "title": "Failures by stage",
  "gridPos": { "h": 8, "w": 12, "x": 8, "y": 1 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "sum by (stage) (count_over_time({app=~\"$app\"} |= \"cp_failed\" | regexp `\"stage\":\"(?P<stage>[^\"]+)\"` [1m]))"
    }
  ]
},
{
  "id": 104,
  "type": "timeseries",
  "title": "Video analysis p95 (ms)",
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 9 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "quantile_over_time(0.95, {app=~\"$app\"} |= \"cp_video\" | regexp `\"durationMs\":(?P<ms>[0-9]+)` | unwrap ms [5m])"
    }
  ]
},
{
  "id": 105,
  "type": "table",
  "title": "Video failure reasons",
  "gridPos": { "h": 8, "w": 12, "x": 12, "y": 9 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "{app=~\"$app\"} |= \"cp_video_fail\" | regexp `\"reason\":\"(?P<reason>[^\"]+)\"` | line_format \"{{.reason}}\""
    }
  ]
},
{
  "id": 106,
  "type": "timeseries",
  "title": "Avg pipeline duration (s)",
  "gridPos": { "h": 8, "w": 12, "x": 0, "y": 17 },
  "datasource": { "type": "loki", "uid": "loki" },
  "targets": [
    {
      "refId": "A",
      "expr": "avg_over_time({app=~\"$app\"} |= \"cp_completed\" | regexp `\"totalDurationMs\":(?P<ms>[0-9]+)` | unwrap ms [$__range]) / 1000"
    }
  ]
}
```

Important: The dashboard JSON uses a single `panels` array; inserting these preserves the file's existing structure. The row panel (id 100) has `collapsed: false`. If the existing panels end at `y = 40`, shift all the `y` values above by `+40` so they appear below the existing content.

- [ ] **Step 2: Reload Grafana**

```bash
cd monitoring && make down && make up
```

Verify the new row appears in Grafana at `http://localhost:3000` (default credentials in monitoring/grafana/provisioning).

- [ ] **Step 3: Commit**

```bash
git add monitoring/grafana/dashboards/fce-backend.json
git commit -m "feat(monitoring): Competitor Analyzer Grafana panels"
```

---

### Task 12.4: Seed script

**Files:**
- Create: `backend/scripts/seed-competitor-analyzer.ts`

- [ ] **Step 1: Write the seed**

```typescript
#!/usr/bin/env bun
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
	const email = process.argv[2];
	if (!email) {
		console.error("Usage: bun run scripts/seed-competitor-analyzer.ts <user-email>");
		process.exit(1);
	}

	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		console.error(`User not found: ${email}`);
		process.exit(1);
	}

	const membership = await prisma.userWorkspaceRole.findFirst({
		where: { userId: user.id },
		include: { workspace: true },
	});
	if (!membership) {
		console.error(`User is not a member of any workspace`);
		process.exit(1);
	}

	const workspace = membership.workspace;
	const project = await prisma.project.findFirst({ where: { workspaceId: workspace.id } });
	if (!project) {
		console.error(`No project in workspace`);
		process.exit(1);
	}

	console.log(`Seeding for workspace "${workspace.name}" / project "${project.name}"`);

	const creators = await Promise.all(
		[
			{ username: "khaby.lame", niche: "comedy", profileUrl: "https://tiktok.com/@khaby.lame" },
			{ username: "mrbeast", niche: "challenges", profileUrl: "https://tiktok.com/@mrbeast" },
			{ username: "gordonramsayofficial", niche: "food", profileUrl: "https://tiktok.com/@gordonramsayofficial" },
		].map((input) =>
			prisma.creator.upsert({
				where: {
					projectId_platform_username: {
						projectId: project.id,
						platform: "tiktok",
						username: input.username,
					},
				},
				update: {},
				create: {
					workspaceId: workspace.id,
					projectId: project.id,
					createdBy: user.id,
					platform: "tiktok",
					profileUrl: input.profileUrl,
					username: input.username,
					niche: input.niche,
				},
			}),
		),
	);

	const config = await prisma.analysisConfig.create({
		data: {
			workspaceId: workspace.id,
			projectId: project.id,
			name: "Demo config",
			targetNiche: "general",
			brandContext: "We are a SaaS that helps creators analyze their competitors.",
			analysisInstructions: "Analyze the hook, retention mechanisms, and CTA.",
			outputPreferences: "Generate 3 different short-form TikTok scripts with B-roll descriptions.",
			creators: {
				create: creators.map((c) => ({ creatorId: c.id })),
			},
		},
	});

	console.log(`Created config ${config.id} with ${creators.length} creators.`);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/seed-competitor-analyzer.ts
git commit -m "feat(scripts): seed competitor analyzer demo data"
```

---

### Task 12.5: Operator status script

**Files:**
- Create: `backend/scripts/competitor-pipeline-status.ts`

- [ ] **Step 1: Write the script**

```typescript
#!/usr/bin/env bun
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
	console.log("\n=== Recent failed runs (last 24h) ===");
	const failed = await prisma.competitorPipelineRun.findMany({
		where: {
			status: "failed",
			createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
		},
		orderBy: { createdAt: "desc" },
		take: 20,
	});
	for (const r of failed) {
		console.log(`  ${r.id} stage=${r.stage ?? "-"} error=${r.errorMessage ?? "-"}`);
	}
	if (failed.length === 0) console.log("  (none)");

	console.log("\n=== Stuck runs (started >45 min ago) ===");
	const cutoff = new Date(Date.now() - 45 * 60 * 1000);
	const stuck = await prisma.competitorPipelineRun.findMany({
		where: {
			status: { notIn: ["completed", "failed"] },
			startedAt: { lt: cutoff },
		},
	});
	for (const r of stuck) {
		console.log(`  ${r.id} status=${r.status} stage=${r.stage ?? "-"} started=${r.startedAt?.toISOString()}`);
	}
	if (stuck.length === 0) console.log("  (none)");

	console.log("\n=== Enrichment queue health ===");
	const queue = await prisma.creator.groupBy({
		by: ["enrichmentStatus"],
		where: { archivedAt: null },
		_count: { _all: true },
	});
	for (const row of queue) {
		console.log(`  ${row.enrichmentStatus}: ${row._count._all}`);
	}

	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/competitor-pipeline-status.ts
git commit -m "feat(scripts): competitor pipeline operator status"
```

---

### Task 12.6: Final verification

- [ ] **Step 1: Full backend typecheck + test**

Run: `cd backend && bunx tsc --noEmit && bun test`
Expected: typecheck clean, all tests pass (including the new competitor analyzer tests).

- [ ] **Step 2: Full frontend typecheck + lint**

Run: `cd frontend && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Full smoke test with real Apify + Gemini keys**

Requires a workspace with real `apifyApiKey` and `geminiApiKey` set in `WorkspaceSetting`. Open the UI and walk through the smoke-test checklist from [docs/competitor-analyzer-monitoring.md](../../competitor-analyzer-monitoring.md#smoke-test-checklist).

- [ ] **Step 4: Ensure branch is ready to merge**

Run: `git log --oneline main..HEAD`
Expected: a series of commits starting with `feat(schema):` and ending with the Phase 12 commits. Verify no debug logs, no TODOs left unresolved, no commented-out code.

Invoke the superpowers:finishing-a-development-branch skill to guide the merge/PR decision.

---

## Summary

- **Phase 1** (2 tasks) — Prisma schema + RBAC menu key.
- **Phase 2** (9 tasks) — DTOs, 3 interfaces, 3 repositories, 3 mocks.
- **Phase 3** (7 tasks) — Creator / AnalysisConfig / CompetitorPipeline services with full TDD.
- **Phase 4** (4 tasks) — Fixtures, TikTokProfileParser (TDD), CreatorEnrichmentJob (TDD).
- **Phase 5** (6 tasks) — Video analyzer interface + Gemini Files API provider + mocks + pipeline job (TDD).
- **Phase 6** (2 tasks) — Routes + composition root wiring.
- **Phase 7** (5 tasks) — API client, SSE hook, MenuKey union, page shell, sidebar entry.
- **Phase 8** (3 tasks) — Creators tab.
- **Phase 9** (3 tasks) — Configs tab.
- **Phase 10** (3 tasks) — Runs tab with live progress.
- **Phase 11** (1 task) — Outputs tab.
- **Phase 12** (6 tasks) — Monitoring doc, SQL appendix, Grafana panels, seed script, operator script, final verification.

**Total: 51 tasks across 12 phases.** Each phase produces a set of commits you can review independently. The backend tests act as a safety net — every service + job has TDD coverage before implementation lands.

