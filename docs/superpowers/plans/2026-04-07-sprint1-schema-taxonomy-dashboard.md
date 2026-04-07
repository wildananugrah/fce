# Sprint 1: Schema Alignment, Taxonomy Expansion, Dashboard & Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the database schema with the full ERD spec (add 10 new tables, modify existing ones), expand taxonomy with tone presets and visual styles, make the dashboard dynamic, and enable profile editing.

**Architecture:** Prisma schema changes first, then backend layers (repository → service → route) following existing DI patterns, then frontend updates. Each task produces a working, testable increment.

**Tech Stack:** Prisma 7, Bun, Hono, React 19, Tailwind CSS 4, TypeScript

---

## Task 1: Add TonePreset and VisualStyle Models to Prisma Schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add TonePreset model to schema.prisma**

Add after the `HookType` model in the `Taxonomy` section:

```prisma
model TonePreset {
  id          String  @id @default(uuid())
  name        String  @unique
  description String?
  isGlobal    Boolean @default(true) @map("is_global")

  @@map("tone_presets")
}

model VisualStyle {
  id          String  @id @default(uuid())
  name        String  @unique
  description String?
  isGlobal    Boolean @default(true) @map("is_global")

  @@map("visual_styles")
}
```

- [ ] **Step 2: Add new fields to GenerationRequest**

Add these fields to the `GenerationRequest` model, after the `prompt` field:

```prisma
  objective    String?
  tonePreset   String?  @map("tone_preset")
  visualStyle  String?  @map("visual_style")
  outputLength String?  @map("output_length")
```

- [ ] **Step 3: Add new fields to Campaign model**

Add these fields to the `Campaign` model, after `culturalContext`:

```prisma
  productId       String?   @map("product_id")
  audienceSegment String?   @map("audience_segment")
  durationStart   DateTime? @map("duration_start")
  durationEnd     DateTime? @map("duration_end")
  budgetMin       Decimal?  @map("budget_min") @db.Decimal(12, 2)
  budgetMax       Decimal?  @map("budget_max") @db.Decimal(12, 2)
  keyMessage      String?   @map("key_message")
```

- [ ] **Step 4: Add versionNo and rationale to GenerationOutput**

Add these fields to the `GenerationOutput` model, after `requestId`:

```prisma
  versionNo    Int      @default(1) @map("version_no")
  rationale    String?
```

- [ ] **Step 5: Add OutputSection model**

Add after `GenerationOutput` model:

```prisma
model OutputSection {
  id           String   @id @default(uuid())
  outputId     String   @map("output_id")
  sectionType  String   @map("section_type")
  sectionOrder Int      @map("section_order")
  contentText  String   @map("content_text") @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  output GenerationOutput @relation(fields: [outputId], references: [id], onDelete: Cascade)

  @@index([outputId])
  @@map("output_sections")
}
```

Also add `sections OutputSection[]` to the `GenerationOutput` model's relations.

- [ ] **Step 6: Add BrandDocument and DocumentChunk models**

Add in a new `Document System` section:

```prisma
// ─── Document System ────────────────────────────────────────────

model BrandDocument {
  id               String   @id @default(uuid())
  workspaceId      String   @map("workspace_id")
  brandId          String   @map("brand_id")
  productId        String?  @map("product_id")
  fileName         String   @map("file_name")
  fileType         String   @map("file_type")
  fileUrl          String   @map("file_url")
  fileSize         Int?     @map("file_size")
  extractionStatus String   @default("pending") @map("extraction_status")
  sourceType       String?  @map("source_type")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  workspace Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  chunks    DocumentChunk[]

  @@index([workspaceId])
  @@index([brandId])
  @@map("brand_documents")
}

model DocumentChunk {
  id            String   @id @default(uuid())
  documentId    String   @map("document_id")
  chunkIndex    Int      @map("chunk_index")
  contentText   String   @map("content_text") @db.Text
  embeddingId   String?  @map("embedding_id")
  metadataJson  Json?    @map("metadata_json")
  retrievalTags Json?    @map("retrieval_tags")
  createdAt     DateTime @default(now()) @map("created_at")

  document BrandDocument @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@index([documentId])
  @@map("document_chunks")
}
```

Also add `documents BrandDocument[]` to the `Workspace` model's relations.

- [ ] **Step 7: Add CampaignBrief model**

Add after `CampaignOutput`:

```prisma
model CampaignBrief {
  id                    String   @id @default(uuid())
  campaignId            String   @map("campaign_id")
  objectiveDetail       String?  @map("objective_detail") @db.Text
  channelMix            Json?    @map("channel_mix")
  mandatoryDeliverables Json?    @map("mandatory_deliverables")
  culturalContext       String?  @map("cultural_context") @db.Text
  trendContext          String?  @map("trend_context") @db.Text
  competitiveContext    String?  @map("competitive_context") @db.Text
  kpiPreference         Json?    @map("kpi_preference")
  toneDirection         String?  @map("tone_direction")
  createdAt             DateTime @default(now()) @map("created_at")
  updatedAt             DateTime @updatedAt @map("updated_at")

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@index([campaignId])
  @@map("campaign_briefs")
}

model CampaignChannelRole {
  id               String @id @default(uuid())
  campaignOutputId String @map("campaign_output_id")
  channelCode      String @map("channel_code")
  channelRole      String @map("channel_role") @db.Text
  priorityOrder    Int    @map("priority_order")

  campaignOutput CampaignOutput @relation(fields: [campaignOutputId], references: [id], onDelete: Cascade)

  @@index([campaignOutputId])
  @@map("campaign_channel_roles")
}

model CampaignDeliverable {
  id                 String @id @default(uuid())
  campaignOutputId   String @map("campaign_output_id")
  deliverableType    String @map("deliverable_type")
  deliverableName    String @map("deliverable_name")
  recommendedChannel String? @map("recommended_channel")
  funnelStage        String? @map("funnel_stage")
  qtyRecommendation  Int?   @map("qty_recommendation")

  campaignOutput CampaignOutput @relation(fields: [campaignOutputId], references: [id], onDelete: Cascade)

  @@index([campaignOutputId])
  @@map("campaign_deliverables")
}

model CampaignFeedbackEvent {
  id               String   @id @default(uuid())
  campaignOutputId String   @map("campaign_output_id")
  eventType        String   @map("event_type")
  before           Json?
  after            Json?
  userId           String?  @map("user_id")
  createdAt        DateTime @default(now()) @map("created_at")

  campaignOutput CampaignOutput @relation(fields: [campaignOutputId], references: [id], onDelete: Cascade)

  @@index([campaignOutputId])
  @@map("campaign_feedback_events")
}
```

Also add these relations to `CampaignOutput`:
```prisma
  channelRoleRecords CampaignChannelRole[]
  deliverables       CampaignDeliverable[]
  feedbackEvents     CampaignFeedbackEvent[]
```

And add `briefs CampaignBrief[]` to the `Campaign` model.

- [ ] **Step 8: Add SavedTemplate model**

Add in a new `Templates` section:

```prisma
// ─── Templates ──────────────────────────────────────────────────

model SavedTemplate {
  id               String   @id @default(uuid())
  workspaceId      String   @map("workspace_id")
  templateType     String   @map("template_type")
  name             String
  configurationJson Json    @map("configuration_json")
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@map("saved_templates")
}
```

Also add `savedTemplates SavedTemplate[]` to `Workspace` model.

- [ ] **Step 9: Update RecommendationProfile with full fields**

Replace the existing `RecommendationProfile` model with:

```prisma
model RecommendationProfile {
  id                  String   @id @default(uuid())
  workspaceId         String?  @map("workspace_id")
  scopeType           String   @map("scope_type")
  scopeId             String   @map("scope_id")
  preferredFrameworks Json?    @map("preferred_frameworks")
  preferredHooks      Json?    @map("preferred_hooks")
  preferredTones      Json?    @map("preferred_tones")
  preferredVisualStyles Json?  @map("preferred_visual_styles")
  preferredPlatforms  Json?    @map("preferred_platforms")
  commonEditPatterns  Json?    @map("common_edit_patterns")
  sampleSize          Int      @default(0) @map("sample_size")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@unique([scopeType, scopeId])
  @@map("recommendation_profiles")
}
```

- [ ] **Step 10: Push schema changes to database**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bunx prisma db push`
Expected: Schema synced successfully with no errors.

- [ ] **Step 11: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat: align prisma schema with full ERD spec

Add TonePreset, VisualStyle, OutputSection, BrandDocument,
DocumentChunk, CampaignBrief, CampaignChannelRole,
CampaignDeliverable, CampaignFeedbackEvent, SavedTemplate models.
Extend GenerationRequest, Campaign, GenerationOutput, and
RecommendationProfile with new fields."
```

---

## Task 2: Seed Tone Presets and Visual Styles

**Files:**
- Modify: `backend/prisma/seed.ts`

- [ ] **Step 1: Add tone presets and visual styles seed data**

Add after the hook types seeding block in `backend/prisma/seed.ts`:

```typescript
	const tonePresets = [
		{ name: "Professional", description: "Formal, polished, and business-appropriate tone" },
		{ name: "Casual", description: "Relaxed, friendly, and approachable tone" },
		{ name: "Playful", description: "Fun, witty, and lighthearted tone" },
		{ name: "Authoritative", description: "Expert, confident, and commanding tone" },
		{ name: "Empathetic", description: "Understanding, caring, and emotionally aware tone" },
		{ name: "Inspirational", description: "Motivating, uplifting, and aspirational tone" },
		{ name: "Educational", description: "Informative, clear, and teaching-oriented tone" },
		{ name: "Conversational", description: "Natural, dialogue-like, and engaging tone" },
	];

	for (const tone of tonePresets) {
		await prisma.tonePreset.upsert({
			where: { name: tone.name },
			update: {},
			create: tone,
		});
	}

	const visualStyles = [
		{ name: "Minimalist", description: "Clean, simple, lots of white space" },
		{ name: "Bold & Vibrant", description: "Strong colors, high contrast, energetic" },
		{ name: "Elegant", description: "Sophisticated, refined, premium feel" },
		{ name: "Organic", description: "Natural textures, earth tones, warm feel" },
		{ name: "Modern Tech", description: "Sleek, digital, futuristic aesthetics" },
		{ name: "Lifestyle", description: "Aspirational, real-life scenarios, relatable" },
	];

	for (const style of visualStyles) {
		await prisma.visualStyle.upsert({
			where: { name: style.name },
			update: {},
			create: style,
		});
	}

	console.log("Seed completed: frameworks, hook types, tone presets, and visual styles");
```

Update the final console.log to include tone presets and visual styles.

- [ ] **Step 2: Run seed**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bunx prisma db seed`
Expected: "Seed completed: frameworks, hook types, tone presets, and visual styles"

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/prisma/seed.ts
git commit -m "feat: seed tone presets and visual styles taxonomy data"
```

---

## Task 3: Extend Taxonomy Backend (Repository, Service, Route)

**Files:**
- Modify: `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`
- Modify: `backend/src/interfaces/services/taxonomy.service.interface.ts`
- Modify: `backend/src/repositories/taxonomy.repository.ts`
- Modify: `backend/src/services/taxonomy.service.ts`
- Modify: `backend/src/routes/taxonomy.route.ts`
- Test: `backend/tests/services/taxonomy.service.test.ts`

- [ ] **Step 1: Write the failing test for taxonomy service**

Create `backend/tests/services/taxonomy.service.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { TaxonomyService } from "../../src/services/taxonomy.service";
import type { ITaxonomyRepository } from "../../src/interfaces/repositories/taxonomy.repository.interface";

function createMockRepository(): ITaxonomyRepository {
	return {
		findAllFrameworks: async () => [
			{ id: "f1", name: "AIDA", description: "Attention, Interest, Desire, Action", isGlobal: true },
		],
		findAllHookTypes: async () => [
			{ id: "h1", name: "Curiosity", description: "Spark curiosity", isGlobal: true },
		],
		findAllTonePresets: async () => [
			{ id: "t1", name: "Professional", description: "Formal tone", isGlobal: true },
			{ id: "t2", name: "Casual", description: "Relaxed tone", isGlobal: true },
		],
		findAllVisualStyles: async () => [
			{ id: "v1", name: "Minimalist", description: "Clean style", isGlobal: true },
		],
	};
}

describe("TaxonomyService", () => {
	it("should return all frameworks", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getFrameworks();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("AIDA");
	});

	it("should return all hook types", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getHookTypes();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Curiosity");
	});

	it("should return all tone presets", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getTonePresets();
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("Professional");
	});

	it("should return all visual styles", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getVisualStyles();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Minimalist");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test tests/services/taxonomy.service.test.ts`
Expected: FAIL — `getTonePresets` and `getVisualStyles` don't exist yet, `findAllTonePresets` and `findAllVisualStyles` not in interface.

- [ ] **Step 3: Update taxonomy repository interface**

Replace contents of `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`:

```typescript
import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";

export interface ITaxonomyRepository {
	findAllFrameworks(): Promise<Framework[]>;
	findAllHookTypes(): Promise<HookType[]>;
	findAllTonePresets(): Promise<TonePreset[]>;
	findAllVisualStyles(): Promise<VisualStyle[]>;
}
```

- [ ] **Step 4: Update taxonomy service interface**

Replace contents of `backend/src/interfaces/services/taxonomy.service.interface.ts`:

```typescript
import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";

export interface ITaxonomyService {
	getFrameworks(): Promise<Framework[]>;
	getHookTypes(): Promise<HookType[]>;
	getTonePresets(): Promise<TonePreset[]>;
	getVisualStyles(): Promise<VisualStyle[]>;
}
```

- [ ] **Step 5: Update taxonomy repository implementation**

Replace contents of `backend/src/repositories/taxonomy.repository.ts`:

```typescript
import type { Framework, HookType, PrismaClient, TonePreset, VisualStyle } from "@prisma/client";
import type { ITaxonomyRepository } from "../interfaces/repositories/taxonomy.repository.interface";

export class TaxonomyRepository implements ITaxonomyRepository {
	constructor(private prisma: PrismaClient) {}

	async findAllFrameworks(): Promise<Framework[]> {
		return this.prisma.framework.findMany({ orderBy: { name: "asc" } });
	}

	async findAllHookTypes(): Promise<HookType[]> {
		return this.prisma.hookType.findMany({ orderBy: { name: "asc" } });
	}

	async findAllTonePresets(): Promise<TonePreset[]> {
		return this.prisma.tonePreset.findMany({ orderBy: { name: "asc" } });
	}

	async findAllVisualStyles(): Promise<VisualStyle[]> {
		return this.prisma.visualStyle.findMany({ orderBy: { name: "asc" } });
	}
}
```

- [ ] **Step 6: Update taxonomy service implementation**

Replace contents of `backend/src/services/taxonomy.service.ts`:

```typescript
import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";
import type { ITaxonomyRepository } from "../interfaces/repositories/taxonomy.repository.interface";
import type { ITaxonomyService } from "../interfaces/services/taxonomy.service.interface";

export class TaxonomyService implements ITaxonomyService {
	constructor(private taxonomyRepository: ITaxonomyRepository) {}

	async getFrameworks(): Promise<Framework[]> {
		return this.taxonomyRepository.findAllFrameworks();
	}

	async getHookTypes(): Promise<HookType[]> {
		return this.taxonomyRepository.findAllHookTypes();
	}

	async getTonePresets(): Promise<TonePreset[]> {
		return this.taxonomyRepository.findAllTonePresets();
	}

	async getVisualStyles(): Promise<VisualStyle[]> {
		return this.taxonomyRepository.findAllVisualStyles();
	}
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test tests/services/taxonomy.service.test.ts`
Expected: 4 tests PASS

- [ ] **Step 8: Update taxonomy route**

Replace contents of `backend/src/routes/taxonomy.route.ts`:

```typescript
import { Hono } from "hono";
import type { ITaxonomyService } from "../interfaces/services/taxonomy.service.interface";

export function createTaxonomyRoutes(taxonomyService: ITaxonomyService) {
	const app = new Hono();

	app.get("/frameworks", async (c) => {
		const frameworks = await taxonomyService.getFrameworks();
		return c.json({ data: frameworks });
	});

	app.get("/hook-types", async (c) => {
		const hookTypes = await taxonomyService.getHookTypes();
		return c.json({ data: hookTypes });
	});

	app.get("/tone-presets", async (c) => {
		const tonePresets = await taxonomyService.getTonePresets();
		return c.json({ data: tonePresets });
	});

	app.get("/visual-styles", async (c) => {
		const visualStyles = await taxonomyService.getVisualStyles();
		return c.json({ data: visualStyles });
	});

	return app;
}
```

- [ ] **Step 9: Run all tests to verify nothing is broken**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/repositories/taxonomy.repository.interface.ts \
        backend/src/interfaces/services/taxonomy.service.interface.ts \
        backend/src/repositories/taxonomy.repository.ts \
        backend/src/services/taxonomy.service.ts \
        backend/src/routes/taxonomy.route.ts \
        backend/tests/services/taxonomy.service.test.ts
git commit -m "feat: add tone presets and visual styles to taxonomy layer"
```

---

## Task 4: Dashboard Stats Backend Endpoint

**Files:**
- Create: `backend/src/routes/dashboard.route.ts`
- Create: `backend/src/services/dashboard.service.ts`
- Create: `backend/src/interfaces/services/dashboard.service.interface.ts`
- Test: `backend/tests/services/dashboard.service.test.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Write the failing test for dashboard service**

Create `backend/tests/services/dashboard.service.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { DashboardService } from "../../src/services/dashboard.service";

function createMockPrisma() {
	return {
		brand: {
			count: async ({ where }: any) => 3,
		},
		product: {
			count: async ({ where }: any) => 7,
		},
		generationRequest: {
			count: async ({ where }: any) => 15,
			findMany: async () => [
				{
					id: "g1",
					platform: "instagram",
					contentType: "single_image",
					status: "completed",
					createdAt: new Date("2026-04-06"),
				},
			],
		},
		campaign: {
			count: async ({ where }: any) => 4,
		},
		workspace: {
			findUnique: async () => ({
				id: "ws1",
				apiUsageUsd: 12.5,
				apiLimitUsd: 50.0,
			}),
		},
	} as any;
}

describe("DashboardService", () => {
	it("should return workspace stats", async () => {
		const service = new DashboardService(createMockPrisma());
		const result = await service.getStats("ws1");

		expect(result.brandCount).toBe(3);
		expect(result.productCount).toBe(7);
		expect(result.generationCount).toBe(15);
		expect(result.campaignCount).toBe(4);
		expect(result.apiUsageUsd).toBe(12.5);
		expect(result.apiLimitUsd).toBe(50.0);
		expect(result.recentGenerations).toHaveLength(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test tests/services/dashboard.service.test.ts`
Expected: FAIL — DashboardService doesn't exist

- [ ] **Step 3: Create dashboard service interface**

Create `backend/src/interfaces/services/dashboard.service.interface.ts`:

```typescript
export interface DashboardStats {
	brandCount: number;
	productCount: number;
	generationCount: number;
	campaignCount: number;
	apiUsageUsd: number;
	apiLimitUsd: number;
	recentGenerations: {
		id: string;
		platform: string;
		contentType: string;
		status: string;
		createdAt: Date;
	}[];
}

export interface IDashboardService {
	getStats(workspaceId: string): Promise<DashboardStats>;
}
```

- [ ] **Step 4: Create dashboard service implementation**

Create `backend/src/services/dashboard.service.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { DashboardStats, IDashboardService } from "../interfaces/services/dashboard.service.interface";

export class DashboardService implements IDashboardService {
	constructor(private prisma: PrismaClient) {}

	async getStats(workspaceId: string): Promise<DashboardStats> {
		const [brandCount, productCount, generationCount, campaignCount, workspace, recentGenerations] =
			await Promise.all([
				this.prisma.brand.count({ where: { workspaceId } }),
				this.prisma.product.count({ where: { workspaceId } }),
				this.prisma.generationRequest.count({ where: { workspaceId } }),
				this.prisma.campaign.count({ where: { workspaceId } }),
				this.prisma.workspace.findUnique({
					where: { id: workspaceId },
					select: { apiUsageUsd: true, apiLimitUsd: true },
				}),
				this.prisma.generationRequest.findMany({
					where: { workspaceId },
					orderBy: { createdAt: "desc" },
					take: 10,
					select: {
						id: true,
						platform: true,
						contentType: true,
						status: true,
						createdAt: true,
					},
				}),
			]);

		return {
			brandCount,
			productCount,
			generationCount,
			campaignCount,
			apiUsageUsd: Number(workspace?.apiUsageUsd ?? 0),
			apiLimitUsd: Number(workspace?.apiLimitUsd ?? 0),
			recentGenerations,
		};
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test tests/services/dashboard.service.test.ts`
Expected: PASS

- [ ] **Step 6: Create dashboard route**

Create `backend/src/routes/dashboard.route.ts`:

```typescript
import { Hono } from "hono";
import type { IDashboardService } from "../interfaces/services/dashboard.service.interface";

export function createDashboardRoutes(dashboardService: IDashboardService) {
	const app = new Hono();

	app.get("/stats", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
		const stats = await dashboardService.getStats(workspaceId);
		return c.json({ data: stats });
	});

	return app;
}
```

- [ ] **Step 7: Wire dashboard into composition root**

In `backend/src/index.ts`, add these imports:

```typescript
import { DashboardService } from "./services/dashboard.service";
import { createDashboardRoutes } from "./routes/dashboard.route";
```

After the `topicService` initialization, add:

```typescript
	const dashboardService = new DashboardService(prisma);
```

In the workspace-scoped routes section, add after the topics route:

```typescript
	workspaceScoped.route("/dashboard", createDashboardRoutes(dashboardService));
```

- [ ] **Step 8: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/interfaces/services/dashboard.service.interface.ts \
        backend/src/services/dashboard.service.ts \
        backend/src/routes/dashboard.route.ts \
        backend/tests/services/dashboard.service.test.ts \
        backend/src/index.ts
git commit -m "feat: add dashboard stats endpoint with real workspace data"
```

---

## Task 5: Profile Update Backend Endpoint

**Files:**
- Modify: `backend/src/routes/auth.route.ts`
- Modify: `backend/src/services/auth.service.ts`
- Modify: `backend/src/interfaces/services/auth.service.interface.ts`

- [ ] **Step 1: Add updateProfile to auth service interface**

In `backend/src/interfaces/services/auth.service.interface.ts`, add to the `IAuthService` interface:

```typescript
	updateProfile(userId: string, data: { fullName?: string; avatarUrl?: string }): Promise<any>;
```

- [ ] **Step 2: Add updateProfile to auth service**

In `backend/src/services/auth.service.ts`, add this method to the `AuthService` class:

```typescript
	async updateProfile(userId: string, data: { fullName?: string; avatarUrl?: string }) {
		const user = await this.userRepository.update(userId, data);
		return { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl };
	}
```

- [ ] **Step 3: Add PATCH /profile route**

In `backend/src/routes/auth.route.ts`, add before the `return app;` line:

```typescript
	app.patch("/profile", async (c) => {
		const userId = c.get("userId" as any);
		const body = await c.req.json();
		const user = await authService.updateProfile(userId, {
			fullName: body.fullName,
			avatarUrl: body.avatarUrl,
		});
		return c.json({ data: user });
	});
```

- [ ] **Step 4: Ensure /profile route is auth-protected**

In `backend/src/index.ts`, add after the existing `/api/auth/me` middleware line:

```typescript
	app.use("/api/auth/profile", authMiddleware);
```

- [ ] **Step 5: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/routes/auth.route.ts \
        backend/src/services/auth.service.ts \
        backend/src/interfaces/services/auth.service.interface.ts \
        backend/src/index.ts
git commit -m "feat: add PATCH /api/auth/profile endpoint for user profile updates"
```

---

## Task 6: Frontend — Add Tone Presets and Visual Styles Types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add new types**

Add these interfaces to `frontend/src/types/index.ts`:

```typescript
export interface TonePreset {
	id: string;
	name: string;
	description: string | null;
	isGlobal: boolean;
}

export interface VisualStyle {
	id: string;
	name: string;
	description: string | null;
	isGlobal: boolean;
}

export interface DashboardStats {
	brandCount: number;
	productCount: number;
	generationCount: number;
	campaignCount: number;
	apiUsageUsd: number;
	apiLimitUsd: number;
	recentGenerations: {
		id: string;
		platform: string;
		contentType: string;
		status: string;
		createdAt: string;
	}[];
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/types/index.ts
git commit -m "feat: add TonePreset, VisualStyle, DashboardStats frontend types"
```

---

## Task 7: Frontend — Dynamic Dashboard Page

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Replace DashboardPage with dynamic data**

Replace the entire contents of `frontend/src/pages/DashboardPage.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import type { DashboardStats } from "../types";

export function DashboardPage() {
	const { activeWorkspace } = useWorkspace();
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (!activeWorkspace) return;
		setLoading(true);
		api<DashboardStats>(`/api/workspaces/${activeWorkspace.id}/dashboard/stats`)
			.then(setStats)
			.catch(() => setStats(null))
			.finally(() => setLoading(false));
	}, [activeWorkspace]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	if (!stats) {
		return <div className="p-6 text-gray-500">Failed to load dashboard data.</div>;
	}

	const kpiCards = [
		{ label: "Brands", value: stats.brandCount, color: "bg-blue-50 text-blue-700" },
		{ label: "Products", value: stats.productCount, color: "bg-green-50 text-green-700" },
		{ label: "Generations", value: stats.generationCount, color: "bg-purple-50 text-purple-700" },
		{ label: "Campaigns", value: stats.campaignCount, color: "bg-amber-50 text-amber-700" },
	];

	const usagePercent = stats.apiLimitUsd > 0 ? (stats.apiUsageUsd / stats.apiLimitUsd) * 100 : 0;

	return (
		<div className="p-6 space-y-6">
			<h1 className="text-xl font-semibold">Dashboard</h1>

			<div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
				{kpiCards.map((card) => (
					<div key={card.label} className={`rounded-lg p-4 ${card.color}`}>
						<p className="text-xs font-medium uppercase tracking-wide opacity-70">{card.label}</p>
						<p className="text-2xl font-bold mt-1">{card.value}</p>
					</div>
				))}
			</div>

			<div className="bg-white border border-gray-200 rounded-lg p-4">
				<h2 className="text-sm font-medium text-gray-700 mb-2">API Usage</h2>
				<div className="flex items-center justify-between text-xs text-gray-500 mb-1">
					<span>${stats.apiUsageUsd.toFixed(2)} used</span>
					<span>${stats.apiLimitUsd.toFixed(2)} limit</span>
				</div>
				<div className="w-full bg-gray-100 rounded-full h-2">
					<div
						className={`h-2 rounded-full ${usagePercent > 80 ? "bg-red-500" : "bg-blue-500"}`}
						style={{ width: `${Math.min(usagePercent, 100)}%` }}
					/>
				</div>
			</div>

			<div className="bg-white border border-gray-200 rounded-lg p-4">
				<h2 className="text-sm font-medium text-gray-700 mb-3">Recent Generations</h2>
				{stats.recentGenerations.length === 0 ? (
					<p className="text-xs text-gray-400">No generations yet.</p>
				) : (
					<div className="space-y-2">
						{stats.recentGenerations.map((gen) => (
							<div key={gen.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
								<div className="flex items-center gap-3">
									<span className="text-xs font-medium capitalize">{gen.platform}</span>
									<span className="text-xs text-gray-400">{gen.contentType.replace("_", " ")}</span>
								</div>
								<div className="flex items-center gap-3">
									<Badge variant={gen.status === "completed" ? "success" : gen.status === "failed" ? "danger" : "default"}>
										{gen.status}
									</Badge>
									<span className="text-xs text-gray-400">
										{new Date(gen.createdAt).toLocaleDateString()}
									</span>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: make dashboard page dynamic with real workspace stats"
```

---

## Task 8: Frontend — Editable Settings Page

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Replace SettingsPage with editable profile form**

Replace the entire contents of `frontend/src/pages/SettingsPage.tsx` with:

```tsx
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Toast } from "../components/ui/Toast";

export function SettingsPage() {
	const { user, refreshUser } = useAuth();
	const [fullName, setFullName] = useState(user?.fullName || "");
	const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
	const [saving, setSaving] = useState(false);
	const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

	const handleSave = async () => {
		setSaving(true);
		try {
			await api("/api/auth/profile", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ fullName, avatarUrl }),
			});
			if (refreshUser) await refreshUser();
			setToast({ message: "Profile updated successfully", type: "success" });
		} catch {
			setToast({ message: "Failed to update profile", type: "error" });
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="p-6 max-w-lg">
			<h1 className="text-xl font-semibold mb-6">Settings</h1>

			<div className="space-y-4">
				<Input label="Email" value={user?.email || ""} disabled />
				<Input
					label="Full Name"
					value={fullName}
					onChange={(e) => setFullName(e.target.value)}
					placeholder="Your full name"
				/>
				<Input
					label="Avatar URL"
					value={avatarUrl}
					onChange={(e) => setAvatarUrl(e.target.value)}
					placeholder="https://example.com/avatar.png"
				/>

				<Button onClick={handleSave} loading={saving}>
					Save Changes
				</Button>
			</div>

			{toast && (
				<Toast
					message={toast.message}
					type={toast.type}
					onClose={() => setToast(null)}
				/>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Check if AuthContext has refreshUser — if not, add it**

Check `frontend/src/contexts/AuthContext.tsx`. If `refreshUser` is not exposed, add a `refreshUser` function that calls `GET /api/auth/me` and updates the user state. Expose it through the context and the `useAuth` hook.

If `refreshUser` doesn't exist, the `SettingsPage` should simply remove the `refreshUser` call (the profile update still works, user sees changes next login).

Simpler approach — update `SettingsPage` to not depend on `refreshUser`:

Replace the `refreshUser` call with updating local state from the API response:

```typescript
		try {
			const updated = await api<{ id: string; email: string; fullName: string; avatarUrl: string }>(
				"/api/auth/profile",
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fullName, avatarUrl }),
				},
			);
			setToast({ message: "Profile updated successfully", type: "success" });
		}
```

- [ ] **Step 3: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: make settings page editable with profile update form"
```

---

## Task 9: Frontend — Add Tone/Visual Style Selectors to GeneratePage

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add tone preset and visual style fetching and selectors**

In `frontend/src/pages/GeneratePage.tsx`, add state and fetch logic for tone presets and visual styles alongside the existing framework/hookType fetching.

Add these state variables next to the existing framework/hookType state:

```typescript
const [tonePresets, setTonePresets] = useState<{ id: string; name: string }[]>([]);
const [visualStyles, setVisualStyles] = useState<{ id: string; name: string }[]>([]);
const [tonePreset, setTonePreset] = useState("");
const [visualStyle, setVisualStyle] = useState("");
const [objective, setObjective] = useState("");
const [outputLength, setOutputLength] = useState("");
```

Add API calls in the existing `useEffect` that loads frameworks/hookTypes:

```typescript
api<{ id: string; name: string }[]>(`/api/taxonomy/tone-presets`).then(setTonePresets);
api<{ id: string; name: string }[]>(`/api/taxonomy/visual-styles`).then(setVisualStyles);
```

Add these Select components to the form, after the existing hook type selector:

```tsx
<Select
	label="Objective"
	value={objective}
	onChange={(e) => setObjective(e.target.value)}
	options={[
		{ value: "", label: "-- Select Objective --" },
		{ value: "awareness", label: "Awareness" },
		{ value: "engagement", label: "Engagement" },
		{ value: "education", label: "Education" },
		{ value: "conversion", label: "Conversion" },
		{ value: "launch", label: "Launch" },
	]}
/>

<Select
	label="Tone Preset"
	value={tonePreset}
	onChange={(e) => setTonePreset(e.target.value)}
	options={[
		{ value: "", label: "-- Select Tone --" },
		...tonePresets.map((t) => ({ value: t.name, label: t.name })),
	]}
/>

<Select
	label="Visual Style"
	value={visualStyle}
	onChange={(e) => setVisualStyle(e.target.value)}
	options={[
		{ value: "", label: "-- Select Visual Style --" },
		...visualStyles.map((v) => ({ value: v.name, label: v.name })),
	]}
/>

<Select
	label="Output Length"
	value={outputLength}
	onChange={(e) => setOutputLength(e.target.value)}
	options={[
		{ value: "", label: "-- Select Length --" },
		{ value: "short", label: "Short" },
		{ value: "medium", label: "Medium" },
		{ value: "long", label: "Long" },
	]}
/>
```

Include the new fields in the generation request body:

```typescript
body: JSON.stringify({
	brandId,
	productId: productId || undefined,
	platform,
	contentType,
	framework,
	hookType,
	language,
	prompt: customPrompt || undefined,
	objective: objective || undefined,
	tonePreset: tonePreset || undefined,
	visualStyle: visualStyle || undefined,
	outputLength: outputLength || undefined,
}),
```

- [ ] **Step 2: Build frontend to verify no type errors**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: add tone preset, visual style, objective, output length selectors to generator"
```

---

## Task 10: Update GenerationRequest Backend to Accept New Fields

**Files:**
- Modify: `backend/src/types/generation.types.ts`
- Modify: `backend/src/routes/generation.route.ts`
- Modify: `backend/src/services/generation.service.ts`

- [ ] **Step 1: Update generation types**

Replace contents of `backend/src/types/generation.types.ts`:

```typescript
export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language?: string;
	prompt?: string;
	objective?: string;
	tonePreset?: string;
	visualStyle?: string;
	outputLength?: string;
}
```

- [ ] **Step 2: Update generation route to pass new fields**

In `backend/src/routes/generation.route.ts`, update the POST handler body extraction to include new fields:

```typescript
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
		const userId = c.get("userId" as any);
		const body = await c.req.json();

		const request = await generationService.create(workspaceId, userId, {
			brandId: body.brandId,
			productId: body.productId,
			platform: body.platform,
			contentType: body.contentType,
			framework: body.framework,
			hookType: body.hookType,
			language: body.language,
			prompt: body.prompt,
			objective: body.objective,
			tonePreset: body.tonePreset,
			visualStyle: body.visualStyle,
			outputLength: body.outputLength,
		});

		return c.json({ data: request }, 201);
	});
```

- [ ] **Step 3: Update generation service to persist new fields**

In `backend/src/services/generation.service.ts`, update the `create` method to pass new fields to the repository:

Add the new fields to the `generationRepository.create()` call:

```typescript
	async create(workspaceId: string, userId: string, input: CreateGenerationInput) {
		const request = await this.generationRepository.create({
			workspaceId,
			brandId: input.brandId,
			productId: input.productId || null,
			platform: input.platform,
			contentType: input.contentType,
			framework: input.framework,
			hookType: input.hookType,
			language: input.language || "id",
			prompt: input.prompt || null,
			objective: input.objective || null,
			tonePreset: input.tonePreset || null,
			visualStyle: input.visualStyle || null,
			outputLength: input.outputLength || null,
		});

		await this.boss.send("content-generation", {
			requestId: request.id,
			userId,
		});

		return request;
	}
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/wildananugrah/Documents/My-Projects/fce
git add backend/src/types/generation.types.ts \
        backend/src/routes/generation.route.ts \
        backend/src/services/generation.service.ts
git commit -m "feat: accept objective, tonePreset, visualStyle, outputLength in generation requests"
```

---

## Task 11: Final Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bun test`
Expected: All tests PASS

- [ ] **Step 2: Run frontend type check**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 3: Run frontend build**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Verify Prisma schema is valid**

Run: `cd /Users/wildananugrah/Documents/My-Projects/fce/backend && bunx prisma validate`
Expected: Schema is valid
