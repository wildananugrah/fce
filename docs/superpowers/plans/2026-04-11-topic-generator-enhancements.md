# Topic Generator Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-product support, upstream format selection, inline topic editing, and per-card regeneration to the topic generator.

**Architecture:** Incremental enhancement of existing TopicsPage, topic service, and topic generation job. New `ContentTopicProduct` join table replaces single `productId`. Format selection moves from GeneratePage to TopicsPage. Topic cards become always-editable with per-card AI regeneration via pg-boss jobs.

**Tech Stack:** TypeScript, Prisma 7, Hono, pg-boss, React 19, Tailwind CSS 4, Bun test runner

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/prisma/schema.prisma` | Add `ContentTopicProduct` model, update `ContentTopic` and `Product` relations |
| Modify | `backend/src/types/topic.types.ts` | Update types: `productIds[]`, `formats[]` |
| Modify | `backend/src/interfaces/repositories/topic.repository.interface.ts` | Update `TopicWithBrand` type, `create`/`update` signatures |
| Modify | `backend/src/interfaces/services/topic.service.interface.ts` | Add `regenerate`, `regeneratePreview` methods |
| Modify | `backend/src/interfaces/providers/topic-generator.interface.ts` | `productContexts[]`, `formats[]` |
| Modify | `backend/src/repositories/topic.repository.ts` | Include products relation, join table CRUD |
| Modify | `backend/src/services/topic.service.ts` | Multi-product create/update, regenerate methods |
| Modify | `backend/src/routes/topic.route.ts` | `productIds`/`formats` params, regenerate endpoints |
| Modify | `backend/src/utils/prompt-builder.ts` | Multi-product context, formats instruction |
| Modify | `backend/src/jobs/topic-generation.job.ts` | Multi-product fetch, join table creation |
| Create | `backend/src/jobs/topic-regeneration.job.ts` | Single-topic regeneration job |
| Modify | `backend/src/index.ts` | Wire up regeneration job worker |
| Create | `backend/tests/services/topic.service.test.ts` | Unit tests for topic service |
| Modify | `frontend/src/pages/TopicsPage.tsx` | Multi-product chips, format chips, editable cards, per-card regen |
| Modify | `frontend/src/pages/TopicLibraryPage.tsx` | Multi-product display |
| Modify | `frontend/src/pages/GeneratePage.tsx` | Auto-fill format from topic |

---

### Task 1: Database Schema — Add ContentTopicProduct Join Table

**Files:**
- Modify: `backend/prisma/schema.prisma:139-161` (Product model)
- Modify: `backend/prisma/schema.prisma:423-446` (ContentTopic model)

- [ ] **Step 1: Add ContentTopicProduct model and update relations**

In `backend/prisma/schema.prisma`, add the new model after the `ContentTopic` model (after line 446), and update the existing models:

Replace the `ContentTopic` model (lines 423-446) with:

```prisma
model ContentTopic {
  id          String    @id @default(uuid())
  workspaceId String    @map("workspace_id")
  brandId     String?   @map("brand_id")
  title       String
  description String?
  pillar      String?
  platform    String?
  format      String?
  objective   String?
  publishDate DateTime? @map("publish_date")
  status      String    @default("draft")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  workspace          Workspace              @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  brand              Brand?                 @relation(fields: [brandId], references: [id], onDelete: SetNull)
  products           ContentTopicProduct[]
  generationRequests GenerationRequest[]

  @@index([workspaceId])
  @@index([brandId])
  @@map("content_topics")
}

model ContentTopicProduct {
  id             String @id @default(uuid())
  contentTopicId String @map("content_topic_id")
  productId      String @map("product_id")

  contentTopic ContentTopic @relation(fields: [contentTopicId], references: [id], onDelete: Cascade)
  product      Product      @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([contentTopicId, productId])
  @@index([contentTopicId])
  @@index([productId])
  @@map("content_topic_products")
}
```

In the `Product` model (lines 139-161), add the relation after `generationRequests`:

```prisma
  contentTopicProducts ContentTopicProduct[]
```

- [ ] **Step 2: Push schema to database**

Run: `cd backend && bunx prisma db push`
Expected: Schema synced successfully with new `content_topic_products` table and removed `product_id` column from `content_topics`.

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat: add ContentTopicProduct join table for multi-product topics"
```

---

### Task 2: Backend Types — Update Topic Types

**Files:**
- Modify: `backend/src/types/topic.types.ts`

- [ ] **Step 1: Update all three interfaces**

Replace the entire file `backend/src/types/topic.types.ts` with:

```typescript
export interface CreateTopicInput {
	brandId?: string;
	productIds?: string[];
	title: string;
	description?: string;
	pillar?: string;
	platform?: string;
	format?: string;
	objective?: string;
	publishDate?: string;
}

export interface GenerateTopicsInput {
	brandId?: string;
	productIds?: string[];
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count?: number;
}

export interface UpdateTopicInput {
	title?: string;
	description?: string;
	pillar?: string;
	platform?: string;
	format?: string;
	objective?: string;
	publishDate?: string;
	status?: string;
	productIds?: string[];
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/types/topic.types.ts
git commit -m "feat: update topic types for multi-product and formats support"
```

---

### Task 3: Backend Interfaces — Update Repository, Service, and Provider Interfaces

**Files:**
- Modify: `backend/src/interfaces/repositories/topic.repository.interface.ts`
- Modify: `backend/src/interfaces/services/topic.service.interface.ts`
- Modify: `backend/src/interfaces/providers/topic-generator.interface.ts`

- [ ] **Step 1: Update topic repository interface**

Replace `backend/src/interfaces/repositories/topic.repository.interface.ts` with:

```typescript
import type { ContentTopic } from "@prisma/client";

export type TopicWithBrand = ContentTopic & {
	brand?: { id: string; name: string } | null;
	products?: Array<{
		id: string;
		product: { id: string; name: string };
	}>;
};

export interface ITopicRepository {
	findByWorkspace(workspaceId: string): Promise<TopicWithBrand[]>;
	findById(id: string): Promise<TopicWithBrand | null>;
	create(data: {
		workspaceId: string;
		brandId?: string;
		productIds?: string[];
		title: string;
		description?: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: Date;
	}): Promise<ContentTopic>;
	update(id: string, data: Partial<ContentTopic> & { productIds?: string[] }): Promise<ContentTopic>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
```

- [ ] **Step 2: Update topic service interface**

Replace `backend/src/interfaces/services/topic.service.interface.ts` with:

```typescript
import type { ContentTopic } from "@prisma/client";
import type {
	CreateTopicInput,
	GenerateTopicsInput,
	UpdateTopicInput,
} from "../../types/topic.types";
import type { TopicWithBrand } from "../repositories/topic.repository.interface";

export interface ITopicService {
	list(workspaceId: string): Promise<TopicWithBrand[]>;
	getById(id: string): Promise<TopicWithBrand>;
	create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic>;
	update(id: string, input: UpdateTopicInput): Promise<ContentTopic>;
	generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }>;
	regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
	): Promise<{ jobId: string }>;
	regeneratePreview(
		workspaceId: string,
		userId: string,
		params: {
			brandId?: string;
			productIds?: string[];
			platform?: string;
			format?: string;
			objective?: string;
		},
		hint?: string,
	): Promise<{ jobId: string }>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
```

- [ ] **Step 3: Update topic generator provider interface**

Replace `backend/src/interfaces/providers/topic-generator.interface.ts` with:

```typescript
export interface TopicGenerationInput {
	brandContext: string;
	productContexts?: string[];
	skillContext?: string;
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count?: number;
}

export interface TopicGenerationOutput {
	topics: Array<{
		title: string;
		description: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: string;
	}>;
}

export interface ITopicGenerator {
	generate(input: TopicGenerationInput): Promise<TopicGenerationOutput>;
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/interfaces/
git commit -m "feat: update repository, service, and provider interfaces for multi-product topics"
```

---

### Task 4: Prompt Builder — Multi-Product Context and Formats

**Files:**
- Modify: `backend/src/utils/prompt-builder.ts:20-33` (buildContextBlock)
- Modify: `backend/src/utils/prompt-builder.ts:80-99` (buildTopicGenerationPrompt)

- [ ] **Step 1: Update buildContextBlock to support multiple product contexts**

In `backend/src/utils/prompt-builder.ts`, replace the `buildContextBlock` function (lines 20-33) with:

```typescript
function buildContextBlock(input: {
	brandContext: string;
	productContext?: string;
	productContexts?: string[];
	skillContext?: string;
}): string {
	let context = input.brandContext;
	if (input.productContexts && input.productContexts.length > 0) {
		input.productContexts.forEach((pc, i) => {
			context += `\n\nProduct ${i + 1} context:\n${pc}`;
		});
	} else if (input.productContext) {
		context += `\n\nProduct context:\n${input.productContext}`;
	}
	if (input.skillContext) {
		context += `\n\nMarketing skill guidelines to follow:\n${input.skillContext}`;
	}
	return context;
}
```

- [ ] **Step 2: Update buildTopicGenerationPrompt for formats**

Replace the `buildTopicGenerationPrompt` function (lines 80-99) with:

```typescript
export function buildTopicGenerationPrompt(input: TopicGenerationInput): PromptPair {
	const count = input.count ?? 10;
	const contextBlock = buildContextBlock({
		brandContext: input.brandContext ?? "{}",
		productContexts: input.productContexts,
		skillContext: input.skillContext,
	});

	const systemPrompt = `You are an expert content strategist. You have the following brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const formatLine = input.formats && input.formats.length > 0
		? `Allowed content formats: ${input.formats.join(", ")}. Assign exactly one format per topic from this list.`
		: "";

	const multiProductLine = input.productContexts && input.productContexts.length > 1
		? "The topics should bridge or combine the provided products where relevant."
		: "";

	const userPrompt = `Generate ${count} content topic ideas${input.platform ? ` for ${input.platform}` : ""}.
${input.objective ? `Content objective: ${input.objective}` : ""}
${input.dateFrom && input.dateTo ? `Schedule date range: ${input.dateFrom} to ${input.dateTo}. Distribute publishDate values evenly across this range.` : ""}
${formatLine}
${multiProductLine}

Return JSON with a single field:
- topics (array of ${count} objects, each with: title, description, pillar, platform, format, objective, publishDate)

Make topics diverse, engaging, and aligned with the brand voice.`;

	return { systemPrompt, userPrompt };
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/prompt-builder.ts
git commit -m "feat: update prompt builder for multi-product contexts and format constraints"
```

---

### Task 5: Topic Repository — Include Products Relation, Join Table CRUD

**Files:**
- Modify: `backend/src/repositories/topic.repository.ts`

- [ ] **Step 1: Update the repository implementation**

Replace the entire file `backend/src/repositories/topic.repository.ts` with:

```typescript
import type { ContentTopic, PrismaClient } from "@prisma/client";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";

export class TopicRepository implements ITopicRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string) {
		return this.prisma.contentTopic.findMany({
			where: { workspaceId },
			orderBy: { createdAt: "desc" },
			include: {
				brand: { select: { id: true, name: true } },
				products: { include: { product: { select: { id: true, name: true } } } },
			},
		});
	}

	async findById(id: string) {
		return this.prisma.contentTopic.findUnique({
			where: { id },
			include: {
				brand: { select: { id: true, name: true } },
				products: { include: { product: { select: { id: true, name: true } } } },
			},
		});
	}

	async create(data: {
		workspaceId: string;
		brandId?: string;
		productIds?: string[];
		title: string;
		description?: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: Date;
	}): Promise<ContentTopic> {
		const { productIds, ...topicData } = data;
		return this.prisma.contentTopic.create({
			data: {
				...topicData,
				products: productIds && productIds.length > 0
					? { create: productIds.map((productId) => ({ productId })) }
					: undefined,
			},
		});
	}

	async update(id: string, data: Partial<ContentTopic> & { productIds?: string[] }): Promise<ContentTopic> {
		const { productIds, ...topicData } = data;

		if (productIds !== undefined) {
			// Sync join table: delete all existing, create new ones
			await this.prisma.contentTopicProduct.deleteMany({ where: { contentTopicId: id } });
			if (productIds.length > 0) {
				await this.prisma.contentTopicProduct.createMany({
					data: productIds.map((productId) => ({ contentTopicId: id, productId })),
				});
			}
		}

		return this.prisma.contentTopic.update({ where: { id }, data: topicData });
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.contentTopic.deleteMany({
			where: { workspaceId, id: { in: ids } },
		});
		return result.count;
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const result = await this.prisma.contentTopic.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { status },
		});
		return result.count;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/topic.repository.ts
git commit -m "feat: update topic repository for multi-product join table"
```

---

### Task 6: Topic Service — Multi-Product Support and Regeneration

**Files:**
- Modify: `backend/src/services/topic.service.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/topic.service.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "bun:test";
import { TopicService } from "../../src/services/topic.service";

// ─── Mock repository ────────────────────────────────────────────
class MockTopicRepository {
	topics: any[] = [];

	async findByWorkspace(workspaceId: string) {
		return this.topics.filter((t) => t.workspaceId === workspaceId);
	}

	async findById(id: string) {
		return this.topics.find((t) => t.id === id) ?? null;
	}

	async create(data: any) {
		const topic = {
			id: crypto.randomUUID(),
			...data,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
			products: (data.productIds ?? []).map((pid: string) => ({
				id: crypto.randomUUID(),
				product: { id: pid, name: `Product ${pid.slice(0, 4)}` },
			})),
		};
		this.topics.push(topic);
		return topic;
	}

	async update(id: string, data: any) {
		const idx = this.topics.findIndex((t) => t.id === id);
		if (idx === -1) throw new Error("Topic not found");
		this.topics[idx] = { ...this.topics[idx], ...data, updatedAt: new Date() };
		return this.topics[idx];
	}

	async deleteMany(workspaceId: string, ids: string[]) {
		const before = this.topics.length;
		this.topics = this.topics.filter((t) => !(t.workspaceId === workspaceId && ids.includes(t.id)));
		return before - this.topics.length;
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string) {
		let count = 0;
		for (const t of this.topics) {
			if (t.workspaceId === workspaceId && ids.includes(t.id)) {
				t.status = status;
				count++;
			}
		}
		return count;
	}

	clear() {
		this.topics = [];
	}
}

// ─── Mock PgBoss ────────────────────────────────────────────────
class MockPgBoss {
	sentJobs: { name: string; data: unknown }[] = [];

	async send(name: string, data: unknown): Promise<string | null> {
		this.sentJobs.push({ name, data });
		return crypto.randomUUID();
	}

	clear() {
		this.sentJobs = [];
	}
}

describe("TopicService", () => {
	const repo = new MockTopicRepository();
	const boss = new MockPgBoss();
	const service = new TopicService(repo as any, boss as any);

	afterEach(() => {
		repo.clear();
		boss.clear();
	});

	describe("generate", () => {
		it("should enqueue topic-generation job with productIds and formats", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const productIds = [crypto.randomUUID(), crypto.randomUUID()];

			const result = await service.generate(workspaceId, userId, {
				brandId: crypto.randomUUID(),
				productIds,
				platform: "instagram",
				objective: "awareness",
				formats: ["carousel", "reels"],
				count: 5,
			});

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-generation");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.productIds).toEqual(productIds);
			expect(jobData.formats).toEqual(["carousel", "reels"]);
			expect(jobData.count).toBe(5);
		});
	});

	describe("create", () => {
		it("should create a topic with multiple productIds", async () => {
			const workspaceId = crypto.randomUUID();
			const productIds = [crypto.randomUUID(), crypto.randomUUID()];

			const topic = await service.create(workspaceId, {
				title: "Cross-product topic",
				productIds,
				brandId: crypto.randomUUID(),
			});

			expect(topic.title).toBe("Cross-product topic");
			expect(topic.products).toHaveLength(2);
		});
	});

	describe("regenerate", () => {
		it("should enqueue topic-regeneration job for a saved topic", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const topic = await service.create(workspaceId, { title: "Old idea" });

			const result = await service.regenerate(workspaceId, userId, topic.id, "make it funnier");

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-regeneration");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.topicId).toBe(topic.id);
			expect(jobData.hint).toBe("make it funnier");
		});
	});

	describe("regeneratePreview", () => {
		it("should enqueue topic-regeneration job with preview flag", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			const result = await service.regeneratePreview(
				workspaceId,
				userId,
				{ brandId: crypto.randomUUID(), platform: "instagram", format: "reels" },
				"more educational",
			);

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-regeneration");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.preview).toBe(true);
			expect(jobData.hint).toBe("more educational");
			expect(jobData.format).toBe("reels");
		});
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && bun test tests/services/topic.service.test.ts`
Expected: FAIL — `regenerate` and `regeneratePreview` methods don't exist yet.

- [ ] **Step 3: Update topic service implementation**

Replace `backend/src/services/topic.service.ts` with:

```typescript
import type { ContentTopic } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ITopicRepository, TopicWithBrand } from "../interfaces/repositories/topic.repository.interface";
import type { ITopicService } from "../interfaces/services/topic.service.interface";
import type { CreateTopicInput, GenerateTopicsInput, UpdateTopicInput } from "../types/topic.types";

export class TopicService implements ITopicService {
	constructor(
		private topicRepository: ITopicRepository,
		private boss: PgBoss,
	) {}

	async list(workspaceId: string): Promise<TopicWithBrand[]> {
		return this.topicRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<TopicWithBrand> {
		const topic = await this.topicRepository.findById(id);
		if (!topic) {
			throw new Error("Topic not found");
		}
		return topic;
	}

	async create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic> {
		return this.topicRepository.create({
			workspaceId,
			brandId: input.brandId,
			productIds: input.productIds,
			title: input.title,
			description: input.description,
			pillar: input.pillar,
			platform: input.platform,
			format: input.format,
			objective: input.objective,
			publishDate: input.publishDate ? new Date(input.publishDate) : undefined,
		});
	}

	async update(id: string, input: UpdateTopicInput): Promise<ContentTopic> {
		return this.topicRepository.update(id, {
			...input,
			publishDate: input.publishDate ? new Date(input.publishDate) : undefined,
		});
	}

	async generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }> {
		const jobId = await this.boss.send("topic-generation", {
			workspaceId,
			brandId: input.brandId,
			productIds: input.productIds,
			platform: input.platform,
			objective: input.objective,
			formats: input.formats,
			dateFrom: input.dateFrom,
			dateTo: input.dateTo,
			count: input.count ?? 10,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
	): Promise<{ jobId: string }> {
		const topic = await this.topicRepository.findById(topicId);
		if (!topic) {
			throw new Error("Topic not found");
		}

		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			topicId,
			brandId: topic.brandId,
			productIds: topic.products?.map((p) => p.product.id) ?? [],
			platform: topic.platform,
			format: topic.format,
			objective: topic.objective,
			hint,
			preview: false,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async regeneratePreview(
		workspaceId: string,
		userId: string,
		params: {
			brandId?: string;
			productIds?: string[];
			platform?: string;
			format?: string;
			objective?: string;
		},
		hint?: string,
	): Promise<{ jobId: string }> {
		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			brandId: params.brandId,
			productIds: params.productIds ?? [],
			platform: params.platform,
			format: params.format,
			objective: params.objective,
			hint,
			preview: true,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		if (!ids.length) {
			throw new Error("No topic IDs provided");
		}
		return this.topicRepository.deleteMany(workspaceId, ids);
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const validStatuses = ["draft", "scheduled", "published", "archived"];
		if (!ids.length) {
			throw new Error("No topic IDs provided");
		}
		if (!validStatuses.includes(status)) {
			throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
		}
		return this.topicRepository.updateManyStatus(workspaceId, ids, status);
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && bun test tests/services/topic.service.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/topic.service.ts backend/tests/services/topic.service.test.ts
git commit -m "feat: add multi-product support and regeneration to topic service"
```

---

### Task 7: Topic Generation Job — Multi-Product Fetch and Formats

**Files:**
- Modify: `backend/src/jobs/topic-generation.job.ts`

- [ ] **Step 1: Update the job to handle productIds array and formats**

Replace `backend/src/jobs/topic-generation.job.ts` with:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { buildTopicGenerationPrompt } from "../utils/prompt-builder";
import { logAiActivity } from "../utils/ai-activity-logger";

interface TopicJobData {
	workspaceId: string;
	brandId?: string;
	productIds?: string[];
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count: number;
	userId: string;
}

export class TopicGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private topicGenerator: ITopicGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TopicJobData): Promise<void> {
		const { workspaceId, brandId, productIds, platform, objective, formats, dateFrom, dateTo, count, userId } = data;

		try {
			// Build brand context
			let brandContext = "{}";
			if (brandId) {
				const brand = await this.prisma.brand.findUnique({
					where: { id: brandId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				brandContext = brand?.brainVersions[0]
					? JSON.stringify(brand.brainVersions[0])
					: JSON.stringify({ name: brand?.name });
			}

			// Build product contexts (multiple)
			const productContexts: string[] = [];
			if (productIds && productIds.length > 0) {
				for (const pid of productIds) {
					const product = await this.prisma.product.findUnique({
						where: { id: pid },
						include: { brainVersions: { where: { isActive: true }, take: 1 } },
					});
					if (product?.brainVersions[0]) {
						productContexts.push(JSON.stringify(product.brainVersions[0]));
					} else if (product) {
						productContexts.push(JSON.stringify({ name: product.name }));
					}
				}
			}

			// Fetch mapped AI skills for topic generator
			const skillMappings = await this.prisma.workspaceSkillMapping.findMany({
				where: { workspaceId, generator: "topic", isActive: true },
				include: { skill: true },
			});
			const skillContext = skillMappings
				.map((m) => {
					let ctx = m.skill.content;
					if (m.skill.referenceFiles) {
						const refs = m.skill.referenceFiles as { name: string; content: string }[];
						ctx += "\n\n" + refs.map((r) => `## Reference: ${r.name}\n${r.content}`).join("\n\n");
					}
					return `### Skill: ${m.skill.name}\n${ctx}`;
				})
				.join("\n\n---\n\n");

			// Build generation input
			const generationInput = {
				brandContext,
				productContexts: productContexts.length > 0 ? productContexts : undefined,
				skillContext: skillContext || undefined,
				platform,
				objective,
				formats,
				dateFrom,
				dateTo,
				count,
			};

			// Get prompts for logging
			const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(generationInput);

			// Generate topics with timing
			const startTime = Date.now();
			const output = await this.topicGenerator.generate(generationInput);
			const durationMs = Date.now() - startTime;

			// Log AI activity
			await logAiActivity(this.prisma, {
				workspaceId,
				generator: "topic",
				provider: process.env.AI_TOPIC_PROVIDER || process.env.AI_PROVIDER || "unknown",
				userId,
				systemPrompt,
				userPrompt,
				brandId: brandId ?? undefined,
				productId: productIds?.[0] ?? undefined,
				platform: platform ?? undefined,
				skillIds: skillMappings.map((m) => m.skill.id),
				skillNames: skillMappings.map((m) => m.skill.name),
			}, {
				responseJson: output,
				durationMs,
				status: "success",
			});

			// Create ContentTopic records for each generated topic
			await Promise.all(
				output.topics.map((topic) =>
					this.prisma.contentTopic.create({
						data: {
							workspaceId,
							brandId: brandId ?? null,
							title: topic.title,
							description: topic.description,
							pillar: topic.pillar ?? null,
							platform: topic.platform ?? platform ?? null,
							format: topic.format ?? null,
							objective: topic.objective ?? null,
							publishDate: topic.publishDate ? new Date(topic.publishDate) : null,
							status: "draft",
							products: productIds && productIds.length > 0
								? { create: productIds.map((productId) => ({ productId })) }
								: undefined,
						},
					}),
				),
			);

			// Notify via SSE
			this.notificationService.notify(userId, {
				type: "topic_generation_complete",
				data: { workspaceId, count: output.topics.length, status: "completed" },
			});

			this.logger.info("Topic generation completed", { workspaceId, count: output.topics.length });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Topic generation failed", { workspaceId, error: message });

			this.notificationService.notify(userId, {
				type: "topic_generation_failed",
				data: { workspaceId, status: "failed", error: message },
			});
		}
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/jobs/topic-generation.job.ts
git commit -m "feat: update topic generation job for multi-product and formats"
```

---

### Task 8: Topic Regeneration Job — New Job for Single Topic Regen

**Files:**
- Create: `backend/src/jobs/topic-regeneration.job.ts`

- [ ] **Step 1: Create the regeneration job**

Create `backend/src/jobs/topic-regeneration.job.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { buildTopicGenerationPrompt } from "../utils/prompt-builder";
import { logAiActivity } from "../utils/ai-activity-logger";

interface TopicRegenJobData {
	workspaceId: string;
	topicId?: string;
	brandId?: string;
	productIds?: string[];
	platform?: string;
	format?: string;
	objective?: string;
	hint?: string;
	preview: boolean;
	userId: string;
}

export class TopicRegenerationJob {
	constructor(
		private prisma: PrismaClient,
		private topicGenerator: ITopicGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TopicRegenJobData): Promise<void> {
		const { workspaceId, topicId, brandId, productIds, platform, format, objective, hint, preview, userId } = data;

		try {
			// Build brand context
			let brandContext = "{}";
			if (brandId) {
				const brand = await this.prisma.brand.findUnique({
					where: { id: brandId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				brandContext = brand?.brainVersions[0]
					? JSON.stringify(brand.brainVersions[0])
					: JSON.stringify({ name: brand?.name });
			}

			// Build product contexts
			const productContexts: string[] = [];
			if (productIds && productIds.length > 0) {
				for (const pid of productIds) {
					const product = await this.prisma.product.findUnique({
						where: { id: pid },
						include: { brainVersions: { where: { isActive: true }, take: 1 } },
					});
					if (product?.brainVersions[0]) {
						productContexts.push(JSON.stringify(product.brainVersions[0]));
					} else if (product) {
						productContexts.push(JSON.stringify({ name: product.name }));
					}
				}
			}

			// Fetch existing topic title for reference (if saved topic)
			let existingTitle = "";
			let existingDescription = "";
			if (topicId) {
				const existing = await this.prisma.contentTopic.findUnique({ where: { id: topicId } });
				existingTitle = existing?.title ?? "";
				existingDescription = existing?.description ?? "";
			}

			// Build a single-topic generation prompt with hint
			const hintLine = hint ? `Additional guidance: ${hint}` : "";
			const existingLine = existingTitle
				? `Current topic for reference: "${existingTitle}" — "${existingDescription}". Generate a fresh, different idea.`
				: "";

			const generationInput = {
				brandContext,
				productContexts: productContexts.length > 0 ? productContexts : undefined,
				platform,
				objective,
				formats: format ? [format] : undefined,
				count: 1,
			};

			const { systemPrompt, userPrompt: baseUserPrompt } = buildTopicGenerationPrompt(generationInput);
			const userPrompt = `${baseUserPrompt}\n${existingLine}\n${hintLine}`.trim();

			// Generate single topic
			const startTime = Date.now();
			const output = await this.topicGenerator.generate({
				...generationInput,
				count: 1,
			});
			const durationMs = Date.now() - startTime;

			// Log AI activity
			await logAiActivity(this.prisma, {
				workspaceId,
				generator: "topic",
				provider: process.env.AI_TOPIC_PROVIDER || process.env.AI_PROVIDER || "unknown",
				userId,
				systemPrompt,
				userPrompt,
				brandId: brandId ?? undefined,
				productId: productIds?.[0] ?? undefined,
				platform: platform ?? undefined,
				skillIds: [],
				skillNames: [],
			}, {
				responseJson: output,
				durationMs,
				status: "success",
			});

			const newTopic = output.topics[0];
			if (!newTopic) {
				throw new Error("AI returned no topics");
			}

			if (preview) {
				// Preview mode: don't write to DB, just send topic data via SSE
				this.notificationService.notify(userId, {
					type: "topic_preview_regenerated",
					data: {
						workspaceId,
						topic: {
							title: newTopic.title,
							description: newTopic.description,
							pillar: newTopic.pillar,
							platform: newTopic.platform ?? platform,
							format: newTopic.format ?? format,
							objective: newTopic.objective ?? objective,
							publishDate: newTopic.publishDate,
						},
						status: "completed",
					},
				});
			} else {
				// Saved mode: update existing topic in place
				await this.prisma.contentTopic.update({
					where: { id: topicId },
					data: {
						title: newTopic.title,
						description: newTopic.description,
						pillar: newTopic.pillar ?? null,
						platform: newTopic.platform ?? platform ?? null,
						format: newTopic.format ?? format ?? null,
						objective: newTopic.objective ?? objective ?? null,
						publishDate: newTopic.publishDate ? new Date(newTopic.publishDate) : null,
					},
				});

				this.notificationService.notify(userId, {
					type: "topic_regenerated",
					data: { workspaceId, topicId, status: "completed" },
				});
			}

			this.logger.info("Topic regeneration completed", { workspaceId, topicId, preview });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Topic regeneration failed", { workspaceId, topicId, error: message });

			this.notificationService.notify(userId, {
				type: preview ? "topic_preview_regeneration_failed" : "topic_regeneration_failed",
				data: { workspaceId, topicId, status: "failed", error: message },
			});
		}
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/jobs/topic-regeneration.job.ts
git commit -m "feat: add topic regeneration job for single-topic regen"
```

---

### Task 9: Topic Routes — Multi-Product Params and Regeneration Endpoints

**Files:**
- Modify: `backend/src/routes/topic.route.ts`

- [ ] **Step 1: Update routes for productIds, formats, and regeneration**

Replace `backend/src/routes/topic.route.ts` with:

```typescript
import { Hono } from "hono";
import type { ITopicService } from "../interfaces/services/topic.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createTopicRoutes(topicService: ITopicService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list topics
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const topics = await topicService.list(workspaceId);
		return c.json({ data: topics });
	});

	// POST /generate — generate topics via AI (enqueues job)
	app.post("/generate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productIds, platform, objective, formats, dateFrom, dateTo, count } = body;
		const result = await topicService.generate(workspaceId, userId, {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			dateFrom,
			dateTo,
			count,
		});
		return c.json({ data: result }, 202);
	});

	// POST /regenerate-preview — regenerate a single topic in preview (before save)
	app.post("/regenerate-preview", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productIds, platform, format, objective, hint } = body;
		const result = await topicService.regeneratePreview(
			workspaceId,
			userId,
			{ brandId, productIds, platform, format, objective },
			hint,
		);
		return c.json({ data: result }, 202);
	});

	// DELETE /bulk — bulk delete topics
	app.delete("/bulk", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await topicService.deleteMany(workspaceId, ids);
		return c.json({ deleted });
	});

	// PATCH /bulk-status — bulk status change
	app.patch("/bulk-status", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids, status } = await c.req.json<{ ids: string[]; status: string }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		if (!status) {
			return c.json({ error: "status is required" }, 400);
		}
		try {
			const updated = await topicService.updateManyStatus(workspaceId, ids, status);
			return c.json({ updated });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Invalid status" }, 400);
		}
	});

	// POST / — create single topic
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { brandId, productIds, title, description, pillar, platform, format, objective, publishDate } = body;
		if (!title) {
			return c.json({ error: "title is required" }, 400);
		}
		const topic = await topicService.create(workspaceId, {
			brandId,
			productIds,
			title,
			description,
			pillar,
			platform,
			format,
			objective,
			publishDate,
		});
		return c.json({ data: topic }, 201);
	});

	// GET /:id — get topic
	app.get("/:id", async (c) => {
		const topic = await topicService.getById(c.req.param("id"));
		return c.json({ data: topic });
	});

	// PATCH /:id — update topic
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const topic = await topicService.update(c.req.param("id"), body);
		return c.json({ data: topic });
	});

	// POST /:id/regenerate — regenerate a single saved topic
	app.post("/:id/regenerate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const topicId = c.req.param("id");
		const body = await c.req.json().catch(() => ({}));
		const { hint } = body;
		const result = await topicService.regenerate(workspaceId, userId, topicId, hint);
		return c.json({ data: result }, 202);
	});

	return app;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/routes/topic.route.ts
git commit -m "feat: update topic routes for multi-product, formats, and regeneration"
```

---

### Task 10: Wire Up Regeneration Job in Composition Root

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Find the topic generation job registration**

Search for where `TopicGenerationJob` is instantiated and the `boss.work("topic-generation"` call. Add the regeneration job next to it.

- [ ] **Step 2: Add regeneration job import and registration**

Add this import at the top of `backend/src/index.ts` (near line 11):

```typescript
import { TopicRegenerationJob } from "./jobs/topic-regeneration.job";
```

Then find where the topic generation job worker is registered (search for `topic-generation`) and add below it:

```typescript
const topicRegenerationJob = new TopicRegenerationJob(prisma, topicGenerator, notificationService, logger);
await boss.work("topic-regeneration", async (job) => {
	await topicRegenerationJob.handle(job.data as any);
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire up topic regeneration job worker"
```

---

### Task 11: Frontend — Multi-Product Selector and Format Chips on TopicsPage

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

- [ ] **Step 1: Add PLATFORM_FORMATS constant and update state**

At the top of `frontend/src/pages/TopicsPage.tsx`, after the `OBJECTIVES` array (line 58), add:

```typescript
const PLATFORM_FORMATS: Record<string, { value: string; label: string; icon: string; badge?: string }[]> = {
	instagram: [
		{ value: "single_image", label: "Single Image", icon: "\uD83D\uDDBC\uFE0F" },
		{ value: "carousel", label: "Carousel", icon: "\uD83C\uDFA0", badge: "SLIDES" },
		{ value: "reels", label: "Reels", icon: "\uD83C\uDFAC", badge: "VIDEO" },
		{ value: "story_image", label: "Story – Image", icon: "\uD83D\uDCF1" },
		{ value: "story_video", label: "Story – Video", icon: "\uD83D\uDCF9", badge: "VIDEO" },
	],
	tiktok: [
		{ value: "tiktok_video", label: "TikTok Video", icon: "\uD83C\uDFB5", badge: "VIDEO" },
		{ value: "tiktok_carousel", label: "TikTok Carousel", icon: "\uD83C\uDFA0", badge: "SLIDES" },
	],
	youtube: [
		{ value: "long_video", label: "Long Video", icon: "\uD83D\uDCFA", badge: "VIDEO" },
		{ value: "youtube_shorts", label: "YouTube Shorts", icon: "\u26A1", badge: "VIDEO" },
	],
	twitter: [
		{ value: "single_tweet", label: "Single Tweet", icon: "\uD83D\uDCAC" },
		{ value: "thread", label: "Thread", icon: "\uD83D\uDCDD", badge: "SLIDES" },
		{ value: "video_tweet", label: "Video Tweet", icon: "\uD83C\uDFAC", badge: "VIDEO" },
	],
	linkedin: [
		{ value: "single_post", label: "Single Post", icon: "\uD83D\uDCBC" },
		{ value: "carousel_post", label: "Carousel Post", icon: "\uD83C\uDFA0", badge: "SLIDES" },
		{ value: "linkedin_video", label: "LinkedIn Video", icon: "\uD83C\uDFAC", badge: "VIDEO" },
		{ value: "article", label: "Article", icon: "\uD83D\uDCDD" },
	],
	facebook: [
		{ value: "feed_post", label: "Feed Post", icon: "\uD83D\uDCF0" },
		{ value: "carousel_ad", label: "Carousel Ad", icon: "\uD83C\uDFA0", badge: "SLIDES" },
		{ value: "reel_short_video", label: "Reel / Short Video", icon: "\uD83C\uDFAC", badge: "VIDEO" },
		{ value: "story", label: "Story", icon: "\uD83D\uDCF1" },
	],
};
```

- [ ] **Step 2: Replace single productId state with productIds array and add formats state**

Inside the `TopicsPage` component, replace:

```typescript
const [productId, setProductId] = useState("");
```

With:

```typescript
const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
```

- [ ] **Step 3: Update handleGenerate to send productIds and formats**

Replace the body in the `handleGenerate` API call (around line 227) from:

```typescript
body: JSON.stringify({
	brandId,
	productId: productId || undefined,
	platform: platform || undefined,
	objective: objective || undefined,
	dateFrom,
	dateTo,
	count,
}),
```

To:

```typescript
body: JSON.stringify({
	brandId,
	productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
	platform: platform || undefined,
	objective: objective || undefined,
	formats: selectedFormats.length > 0 ? selectedFormats : undefined,
	dateFrom,
	dateTo,
	count,
}),
```

- [ ] **Step 4: Replace single Product dropdown with multi-select chips**

Replace the product `<Select>` block (the `<Select label="Product (optional)".../>` inside the brand section) with:

```tsx
{filteredProducts.length > 0 && (
	<div>
		<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
			Products (optional — select multiple for cross-product topics)
		</label>
		<div className="flex flex-wrap gap-2">
			{filteredProducts.map((p) => (
				<button
					key={p.id}
					type="button"
					onClick={() =>
						setSelectedProductIds((prev) =>
							prev.includes(p.id)
								? prev.filter((id) => id !== p.id)
								: [...prev, p.id]
						)
					}
					className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
						selectedProductIds.includes(p.id)
							? "bg-indigo-600 text-white border-indigo-600"
							: "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
					}`}
				>
					{p.name}
				</button>
			))}
		</div>
	</div>
)}
```

- [ ] **Step 5: Add format selection section below platform chips**

After the Objective section (after the closing `</div>` of the objective buttons wrapper), add a format selector that appears when a platform is selected:

```tsx
{/* Content Formats */}
{platform && PLATFORM_FORMATS[platform] && (
	<div>
		<label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
			Content Formats (select allowed formats)
		</label>
		<div className="flex flex-wrap gap-2">
			{PLATFORM_FORMATS[platform].map((f) => (
				<button
					key={f.value}
					type="button"
					onClick={() =>
						setSelectedFormats((prev) =>
							prev.includes(f.value)
								? prev.filter((v) => v !== f.value)
								: [...prev, f.value]
						)
					}
					className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
						selectedFormats.includes(f.value)
							? "bg-indigo-600 text-white border-indigo-600"
							: "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
					}`}
				>
					<span>{f.icon}</span>
					{f.label}
					{f.badge && (
						<span className="text-[9px] opacity-70">{f.badge}</span>
					)}
				</button>
			))}
		</div>
	</div>
)}
```

- [ ] **Step 6: Clear formats when platform changes**

Update the platform chip `onClick` handler to also clear formats:

```typescript
onClick={() => {
	setPlatform(platform === p.value ? "" : p.value);
	setSelectedFormats([]);
}}
```

- [ ] **Step 7: Clear productIds when brand changes**

Update the brand `onChange` handler to also clear productIds:

```typescript
onChange={(e) => {
	setBrandId(e.target.value);
	setSelectedProductIds([]);
}}
```

- [ ] **Step 8: Update results header to show selected products**

Replace the product display in the results header (the `{productId ? ...}` line) with:

```tsx
{selectedProductIds.length > 0
	? ` · ${selectedProductIds.length} product${selectedProductIds.length > 1 ? "s" : ""}`
	: ""}
```

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat: add multi-product selector and format chips to topics form"
```

---

### Task 12: Frontend — Editable Topic Cards with Per-Card Regeneration

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

- [ ] **Step 1: Add state for editing topics and regeneration**

After the `generatedTopics` state declarations, add:

```typescript
const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(null);
const regeneratingTopicIdRef = useRef<string | null>(null);
const [regenHints, setRegenHints] = useState<Record<string, string>>({});
const [showRegenInput, setShowRegenInput] = useState<string | null>(null);
```

Also add `useRef` to the React imports at the top of the file (line 1):

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
```

- [ ] **Step 2: Add topic field update handler**

Add this handler after the `handleDeleteTopic` function:

```typescript
const handleTopicFieldChange = (topicId: string, field: keyof GeneratedTopic, value: string) => {
	setGeneratedTopics((prev) =>
		prev.map((t) => (t.id === topicId ? { ...t, [field]: value } : t))
	);
};

const handleRegenerateSingle = async (topicId: string) => {
	if (!activeWorkspace) return;
	setRegeneratingTopicId(topicId);
	regeneratingTopicIdRef.current = topicId;
	setShowRegenInput(null);
	try {
		const topic = generatedTopics.find((t) => t.id === topicId);
		await api(
			`/api/workspaces/${activeWorkspace.id}/topics/regenerate-preview`,
			{
				method: "POST",
				body: JSON.stringify({
					brandId,
					productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
					platform: topic?.platform || platform || undefined,
					format: topic?.format || undefined,
					objective: topic?.objective || objective || undefined,
					hint: regenHints[topicId] || undefined,
				}),
			}
		);
		// SSE handler will update the card
		setRegenHints((prev) => ({ ...prev, [topicId]: "" }));
	} catch (e) {
		showToast(e instanceof Error ? e.message : "Regeneration failed", "error");
		setRegeneratingTopicId(null);
		regeneratingTopicIdRef.current = null;
	}
};
```

- [ ] **Step 3: Add SSE listeners for regeneration events**

Inside the existing `useSSE` callback, add these handlers:

```typescript
if (event.type === "topic_preview_regenerated") {
	const { topic: newTopic } = event.data as any;
	const targetId = regeneratingTopicIdRef.current;
	setGeneratedTopics((prev) => {
		if (!targetId) return prev;
		return prev.map((t) =>
			t.id === targetId
				? { ...t, ...newTopic, id: t.id }
				: t
		);
	});
	setRegeneratingTopicId(null);
	regeneratingTopicIdRef.current = null;
	showToast("Topic regenerated!", "success");
}
if (event.type === "topic_preview_regeneration_failed") {
	setRegeneratingTopicId(null);
	regeneratingTopicIdRef.current = null;
	showToast("Topic regeneration failed", "error");
}
```

- [ ] **Step 4: Remove the "Regenerate All" button**

Remove the `<button>` with `onClick={handleRegenerate}` in the results header section (around lines 591-610). Also remove the `handleRegenerate` function.

- [ ] **Step 5: Replace static topic card content with editable fields**

Replace the topic card `<div>` inside the `.map()` (the entire card from `<div key={topic.id}` to its closing `</div>`) with:

```tsx
<div
	key={topic.id}
	className={`bg-white border border-gray-200 rounded-xl p-4 space-y-3 relative ${
		regeneratingTopicId === topic.id ? "opacity-50 pointer-events-none" : ""
	}`}
>
	{regeneratingTopicId === topic.id && (
		<div className="absolute inset-0 flex items-center justify-center z-10">
			<Spinner />
		</div>
	)}

	{/* Top row: delete + regenerate buttons */}
	<div className="flex justify-end gap-2">
		<button
			type="button"
			onClick={() =>
				setShowRegenInput(showRegenInput === topic.id ? null : topic.id)
			}
			className="text-gray-300 hover:text-indigo-500 transition-colors"
			title="Regenerate this topic"
		>
			<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
			</svg>
		</button>
		<button
			type="button"
			onClick={() => handleDeleteTopic(topic.id)}
			className="text-gray-300 hover:text-red-500 transition-colors"
		>
			<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
			</svg>
		</button>
	</div>

	{/* Regenerate hint input */}
	{showRegenInput === topic.id && (
		<div className="flex gap-2">
			<input
				type="text"
				placeholder="Optional hint (e.g., 'make it more educational')"
				className="flex-1 px-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
				value={regenHints[topic.id] ?? ""}
				onChange={(e) =>
					setRegenHints((prev) => ({ ...prev, [topic.id]: e.target.value }))
				}
				onKeyDown={(e) => {
					if (e.key === "Enter") handleRegenerateSingle(topic.id);
				}}
			/>
			<button
				type="button"
				onClick={() => handleRegenerateSingle(topic.id)}
				className="px-3 py-1.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
			>
				Go
			</button>
		</div>
	)}

	{/* Editable title */}
	<input
		type="text"
		value={topic.title}
		onChange={(e) => handleTopicFieldChange(topic.id, "title", e.target.value)}
		className="w-full text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none transition-colors pb-0.5"
	/>

	{/* Editable description */}
	<textarea
		value={topic.description ?? ""}
		onChange={(e) => handleTopicFieldChange(topic.id, "description", e.target.value)}
		placeholder="Add a description..."
		rows={2}
		className="w-full text-xs text-gray-600 bg-transparent border border-transparent hover:border-gray-200 focus:border-indigo-400 focus:outline-none rounded-md p-1 resize-none transition-colors"
	/>

	{/* Editable metadata row */}
	<div className="grid grid-cols-2 gap-2">
		{/* Pillar */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Pillar</label>
			{contentPillars.length > 0 ? (
				<select
					value={topic.pillar ?? ""}
					onChange={(e) => handleTopicFieldChange(topic.id, "pillar", e.target.value)}
					className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
				>
					<option value="">None</option>
					{contentPillars.map((p) => (
						<option key={p} value={p}>{p}</option>
					))}
				</select>
			) : (
				<input
					type="text"
					value={topic.pillar ?? ""}
					onChange={(e) => handleTopicFieldChange(topic.id, "pillar", e.target.value)}
					placeholder="Pillar"
					className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
				/>
			)}
		</div>

		{/* Format */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Format</label>
			<select
				value={topic.format ?? ""}
				onChange={(e) => handleTopicFieldChange(topic.id, "format", e.target.value)}
				className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
			>
				<option value="">None</option>
				{(PLATFORM_FORMATS[topic.platform ?? platform] ?? []).map((f) => (
					<option key={f.value} value={f.value}>{f.icon} {f.label}</option>
				))}
			</select>
		</div>

		{/* Platform */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Platform</label>
			<select
				value={topic.platform ?? ""}
				onChange={(e) => handleTopicFieldChange(topic.id, "platform", e.target.value)}
				className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
			>
				<option value="">None</option>
				{PLATFORMS.map((p) => (
					<option key={p.value} value={p.value}>{p.label}</option>
				))}
			</select>
		</div>

		{/* Objective */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Objective</label>
			<select
				value={topic.objective ?? ""}
				onChange={(e) => handleTopicFieldChange(topic.id, "objective", e.target.value)}
				className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
			>
				<option value="">None</option>
				{OBJECTIVES.map((o) => (
					<option key={o.value} value={o.value}>{o.label}</option>
				))}
			</select>
		</div>

		{/* Publish Date */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Publish Date</label>
			<input
				type="date"
				value={topic.publishDate ? topic.publishDate.split("T")[0] : ""}
				onChange={(e) => handleTopicFieldChange(topic.id, "publishDate", e.target.value)}
				className="w-full text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
			/>
		</div>

		{/* Products */}
		<div>
			<label className="block text-[10px] text-gray-400 mb-0.5">Products</label>
			<div className="flex flex-wrap gap-1">
				{filteredProducts.map((p) => (
					<button
						key={p.id}
						type="button"
						onClick={() => {
							// Products are tracked at card level via a separate state if needed
							// For now, products are inherited from the form selection
						}}
						className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
							selectedProductIds.includes(p.id)
								? "bg-indigo-100 text-indigo-700 border-indigo-200"
								: "bg-gray-50 text-gray-400 border-gray-200"
						}`}
					>
						{p.name}
					</button>
				))}
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat: add inline editing and per-card regeneration to topic cards"
```

---

### Task 13: Frontend — Update TopicLibraryPage for Multi-Product Display

**Files:**
- Modify: `frontend/src/pages/TopicLibraryPage.tsx`

- [ ] **Step 1: Update the Topic interface**

In `frontend/src/pages/TopicLibraryPage.tsx`, update the `Topic` interface (lines 12-25) to include products:

```typescript
interface Topic {
  id: string;
  title: string;
  description?: string | null;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  objective?: string | null;
  publishDate?: string | null;
  status: string;
  brandId?: string | null;
  brand?: { id: string; name: string } | null;
  products?: Array<{
    id: string;
    product: { id: string; name: string };
  }>;
  createdAt: string;
}
```

- [ ] **Step 2: Update topic display to show multiple products**

Find where topics are rendered in the table/card view and replace the single product display with a multi-product badge list. Where the component previously showed a single product name, replace with:

```tsx
{topic.products && topic.products.length > 0 && (
	<div className="flex flex-wrap gap-1">
		{topic.products.map((tp) => (
			<span
				key={tp.id}
				className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600"
			>
				{tp.product.name}
			</span>
		))}
	</div>
)}
```

- [ ] **Step 3: Update "Generate" link to pass product IDs**

Find the "Generate" button that navigates to GeneratePage and update the URL params to pass product IDs from the join table instead of a single `productId`. Also pass `format`:

```typescript
const productIds = topic.products?.map((tp) => tp.product.id) ?? [];
const params = new URLSearchParams({
	brandId: topic.brandId ?? "",
	platform: topic.platform ?? "",
	objective: topic.objective ?? "",
	topicId: topic.id,
	...(topic.format ? { format: topic.format } : {}),
});
productIds.forEach((pid) => params.append("productId", pid));
navigate(`/generate?${params.toString()}`);
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TopicLibraryPage.tsx
git commit -m "feat: update topic library for multi-product display"
```

---

### Task 14: Frontend — Auto-Fill Format on GeneratePage from Topic

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Check and update URL param reading**

In `GeneratePage.tsx`, find where URL search params are read (where `topicId`, `brandId`, `platform` are extracted from the URL). Add `format` to the extracted params:

```typescript
const format = searchParams.get("format");
```

Then in the effect that pre-fills form state from URL params, add:

```typescript
if (format) {
	setContentType(format);
}
```

This ensures that when a user clicks "Generate content" from a topic that has a format, the content type is pre-selected.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: auto-fill content format from topic when navigating from library"
```

---

### Task 15: Run Full Backend Tests and Type Check

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && bun test`
Expected: All tests pass including the new topic service tests.

- [ ] **Step 2: Run backend type check**

Run: `cd backend && bunx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run frontend type check and build**

Run: `cd frontend && npm run build`
Expected: TypeScript check passes and production build succeeds.

- [ ] **Step 4: Run Biome format check**

Run: `cd backend && bunx biome check --write .`
Expected: All files formatted correctly.

- [ ] **Step 5: Final commit if any formatting changes**

```bash
git add -A
git commit -m "chore: format and fix lint issues"
```
