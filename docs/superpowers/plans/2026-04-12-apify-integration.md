# Apify Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Apify web scraping platform as a new provider for enhanced brand scraping, competitor intelligence, and content research with a dedicated Research hub.

**Architecture:** New `ApifyProvider` following existing DI pattern, `ResearchService` + `ResearchRepository` for business logic, `ResearchRunJob` for async pg-boss processing, 6 curated actor parsers via an extensible registry, workspace-level API key management, and a Research hub frontend page with "Use as Inspiration" flow into content generation.

**Tech Stack:** TypeScript, Bun, Hono, Prisma 7, pg-boss, apify-client SDK, React 19, Tailwind CSS 4, lucide-react

---

## Task 1: Prisma Schema — New Models

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add enums and WorkspaceSetting model**

Add after the `AiProviderLog` model (end of schema):

```prisma
// ─── Research / Apify ──────────────────────────────────────────

model WorkspaceSetting {
  id          String   @id @default(uuid())
  workspaceId String   @unique @map("workspace_id")
  apifyApiKey String?  @map("apify_api_key")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("workspace_settings")
}

model ResearchRun {
  id           String    @id @default(uuid())
  workspaceId  String    @map("workspace_id")
  userId       String    @map("user_id")
  brandId      String?   @map("brand_id")
  actorType    String    @map("actor_type")
  actorId      String    @map("actor_id")
  input        Json
  apifyRunId   String?   @map("apify_run_id")
  status       String    @default("pending")
  errorMessage String?   @map("error_message")
  resultCount  Int       @default(0) @map("result_count")
  startedAt    DateTime? @map("started_at")
  completedAt  DateTime? @map("completed_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  workspace Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  brand     Brand?           @relation(fields: [brandId], references: [id], onDelete: SetNull)
  results   ResearchResult[]

  @@index([workspaceId])
  @@index([userId])
  @@index([brandId])
  @@index([status])
  @@map("research_runs")
}

model ResearchResult {
  id          String   @id @default(uuid())
  runId       String   @map("run_id")
  workspaceId String   @map("workspace_id")
  dataType    String   @map("data_type")
  title       String?
  url         String?
  content     String
  metadata    Json     @default("{}")
  scrapedAt   DateTime @map("scraped_at")
  createdAt   DateTime @default(now()) @map("created_at")

  run       ResearchRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  workspace Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@index([workspaceId])
  @@map("research_results")
}
```

- [ ] **Step 2: Add relation fields to existing models**

Add to the `Workspace` model (after the `aiProviderLogs` line):

```prisma
  workspaceSetting WorkspaceSetting?
  researchRuns     ResearchRun[]
  researchResults  ResearchResult[]
```

Add to the `User` model (after `createdWorkspaces` line):

```prisma
  researchRuns ResearchRun[]
```

Add to the `Brand` model (after the last relation field):

```prisma
  researchRuns ResearchRun[]
```

- [ ] **Step 3: Push schema to database**

Run: `cd backend && bunx prisma db push`
Expected: Schema synced successfully, no errors.

- [ ] **Step 4: Verify generated client**

Run: `cd backend && bunx prisma generate`
Expected: Prisma Client generated successfully.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(schema): add WorkspaceSetting, ResearchRun, ResearchResult models"
```

---

## Task 2: Apify Provider Interface & Implementation

**Files:**
- Create: `backend/src/interfaces/providers/apify.interface.ts`
- Create: `backend/src/providers/apify.provider.ts`

- [ ] **Step 1: Create the Apify provider interface**

Create `backend/src/interfaces/providers/apify.interface.ts`:

```typescript
export interface ApifyRunStatus {
	status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "ABORTING" | "ABORTED" | "TIMED-OUT";
	startedAt?: string;
	finishedAt?: string;
}

export interface ApifyResultItem {
	[key: string]: any;
}

export interface IApifyProvider {
	runActor(
		actorId: string,
		input: Record<string, any>,
		apiKey: string,
	): Promise<{ runId: string }>;
	getRunStatus(runId: string, apiKey: string): Promise<ApifyRunStatus>;
	getRunResults(runId: string, apiKey: string): Promise<ApifyResultItem[]>;
	testConnection(apiKey: string): Promise<boolean>;
}
```

- [ ] **Step 2: Create the Apify provider implementation**

Create `backend/src/providers/apify.provider.ts`:

```typescript
import { ApifyClient } from "apify-client";
import type {
	ApifyResultItem,
	ApifyRunStatus,
	IApifyProvider,
} from "../interfaces/providers/apify.interface";

export class ApifyProvider implements IApifyProvider {
	private getClient(apiKey: string): ApifyClient {
		return new ApifyClient({ token: apiKey });
	}

	async runActor(
		actorId: string,
		input: Record<string, any>,
		apiKey: string,
	): Promise<{ runId: string }> {
		const client = this.getClient(apiKey);
		const run = await client.actor(actorId).call(input, { waitForFinish: 0 });
		return { runId: run.id };
	}

	async getRunStatus(runId: string, apiKey: string): Promise<ApifyRunStatus> {
		const client = this.getClient(apiKey);
		const run = await client.run(runId).get();
		if (!run) {
			throw new Error(`Run ${runId} not found`);
		}
		return {
			status: run.status as ApifyRunStatus["status"],
			startedAt: run.startedAt?.toISOString(),
			finishedAt: run.finishedAt?.toISOString(),
		};
	}

	async getRunResults(runId: string, apiKey: string): Promise<ApifyResultItem[]> {
		const client = this.getClient(apiKey);
		const run = await client.run(runId).get();
		if (!run?.defaultDatasetId) {
			return [];
		}
		const { items } = await client.dataset(run.defaultDatasetId).listItems();
		return items;
	}

	async testConnection(apiKey: string): Promise<boolean> {
		try {
			const client = this.getClient(apiKey);
			const user = await client.user().get();
			return !!user;
		} catch {
			return false;
		}
	}
}
```

- [ ] **Step 3: Install apify-client dependency**

Run: `cd backend && bun add apify-client`
Expected: Package installed successfully.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/providers/apify.interface.ts backend/src/providers/apify.provider.ts backend/package.json backend/bun.lock
git commit -m "feat: add ApifyProvider with interface and apify-client SDK"
```

---

## Task 3: Actor Result Parsers & Registry

**Files:**
- Create: `backend/src/providers/apify-parsers/types.ts`
- Create: `backend/src/providers/apify-parsers/website-crawler.parser.ts`
- Create: `backend/src/providers/apify-parsers/instagram.parser.ts`
- Create: `backend/src/providers/apify-parsers/tiktok.parser.ts`
- Create: `backend/src/providers/apify-parsers/facebook.parser.ts`
- Create: `backend/src/providers/apify-parsers/google-trends.parser.ts`
- Create: `backend/src/providers/apify-parsers/google-search.parser.ts`
- Create: `backend/src/config/apify-actors.ts`

- [ ] **Step 1: Create shared parser types**

Create `backend/src/providers/apify-parsers/types.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedResearchResult {
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title?: string;
	url?: string;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: Date;
}

export interface IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
}
```

- [ ] **Step 2: Create website crawler parser**

Create `backend/src/providers/apify-parsers/website-crawler.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class WebsiteCrawlerParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.markdown)
			.map((item) => ({
				dataType: "page_content" as const,
				title: item.metadata?.title || item.title || undefined,
				url: item.url || undefined,
				content: item.text || item.markdown || "",
				metadata: {
					description: item.metadata?.description,
					language: item.metadata?.languageCode,
					loadedAt: item.loadedAt,
				},
				scrapedAt: item.loadedAt ? new Date(item.loadedAt) : new Date(),
			}));
	}
}
```

- [ ] **Step 3: Create Instagram parser**

Create `backend/src/providers/apify-parsers/instagram.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class InstagramParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.caption || item.type)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.ownerUsername ? `@${item.ownerUsername}` : undefined,
				url: item.url || item.shortCode ? `https://instagram.com/p/${item.shortCode}` : undefined,
				content: item.caption || "",
				metadata: {
					platform: "instagram",
					type: item.type,
					likesCount: item.likesCount ?? 0,
					commentsCount: item.commentsCount ?? 0,
					videoViewCount: item.videoViewCount,
					hashtags: item.hashtags || [],
					mentions: item.mentions || [],
					imageUrl: item.displayUrl || item.thumbnailUrl,
					ownerUsername: item.ownerUsername,
				},
				scrapedAt: item.timestamp ? new Date(item.timestamp) : new Date(),
			}));
	}
}
```

- [ ] **Step 4: Create TikTok parser**

Create `backend/src/providers/apify-parsers/tiktok.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class TikTokParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.desc)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.authorMeta?.name || item.author?.nickname || undefined,
				url: item.webVideoUrl || undefined,
				content: item.text || item.desc || "",
				metadata: {
					platform: "tiktok",
					diggCount: item.diggCount ?? item.stats?.diggCount ?? 0,
					shareCount: item.shareCount ?? item.stats?.shareCount ?? 0,
					playCount: item.playCount ?? item.stats?.playCount ?? 0,
					commentCount: item.commentCount ?? item.stats?.commentCount ?? 0,
					hashtags: item.hashtags?.map((h: any) => h.name || h) || [],
					musicName: item.musicMeta?.musicName || item.music?.title,
					authorUsername: item.authorMeta?.nickName || item.author?.uniqueId,
				},
				scrapedAt: item.createTime ? new Date(item.createTime * 1000) : new Date(),
			}));
	}
}
```

- [ ] **Step 5: Create Facebook parser**

Create `backend/src/providers/apify-parsers/facebook.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class FacebookParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.message)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.pageName || item.user?.name || undefined,
				url: item.url || item.postUrl || undefined,
				content: item.text || item.message || "",
				metadata: {
					platform: "facebook",
					likes: item.likes ?? item.reactionsCount ?? 0,
					comments: item.comments ?? item.commentsCount ?? 0,
					shares: item.shares ?? item.sharesCount ?? 0,
					type: item.type,
					pageName: item.pageName,
				},
				scrapedAt: item.time ? new Date(item.time) : new Date(),
			}));
	}
}
```

- [ ] **Step 6: Create Google Trends parser**

Create `backend/src/providers/apify-parsers/google-trends.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class GoogleTrendsParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.query || item.title || item.keyword)
			.map((item) => ({
				dataType: "trend" as const,
				title: item.query || item.title || item.keyword || undefined,
				url: item.exploreLink
					? `https://trends.google.com${item.exploreLink}`
					: undefined,
				content: item.query || item.title || item.keyword || "",
				metadata: {
					platform: "google_trends",
					value: item.value ?? item.interest,
					formattedValue: item.formattedValue,
					relatedQueries: item.relatedQueries,
					geo: item.geo,
					timeRange: item.timeRange,
				},
				scrapedAt: new Date(),
			}));
	}
}
```

- [ ] **Step 7: Create Google Search parser**

Create `backend/src/providers/apify-parsers/google-search.parser.ts`:

```typescript
import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class GoogleSearchParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		const results: ParsedResearchResult[] = [];

		for (const item of rawItems) {
			// Handle organic results array (common Apify Google search structure)
			const organicResults = item.organicResults || [item];
			for (const result of organicResults) {
				if (!result.title && !result.description) continue;
				results.push({
					dataType: "search_result" as const,
					title: result.title || undefined,
					url: result.url || result.link || undefined,
					content: result.description || result.snippet || "",
					metadata: {
						platform: "google_search",
						position: result.position,
						displayedUrl: result.displayedUrl,
						searchQuery: item.searchQuery?.term || item.keyword,
					},
					scrapedAt: new Date(),
				});
			}
		}

		return results;
	}
}
```

- [ ] **Step 8: Create actor registry**

Create `backend/src/config/apify-actors.ts`:

```typescript
import { FacebookParser } from "../providers/apify-parsers/facebook.parser";
import { GoogleSearchParser } from "../providers/apify-parsers/google-search.parser";
import { GoogleTrendsParser } from "../providers/apify-parsers/google-trends.parser";
import { InstagramParser } from "../providers/apify-parsers/instagram.parser";
import { TikTokParser } from "../providers/apify-parsers/tiktok.parser";
import type { IActorResultParser } from "../providers/apify-parsers/types";
import { WebsiteCrawlerParser } from "../providers/apify-parsers/website-crawler.parser";

export type ActorType =
	| "website_crawler"
	| "instagram"
	| "tiktok"
	| "facebook"
	| "google_trends"
	| "google_search";

interface ActorConfig {
	actorId: string;
	label: string;
	description: string;
	parser: IActorResultParser;
}

export const APIFY_ACTORS: Record<ActorType, ActorConfig> = {
	website_crawler: {
		actorId: "apify/website-content-crawler",
		label: "Website Crawler",
		description: "Extract content from any website",
		parser: new WebsiteCrawlerParser(),
	},
	instagram: {
		actorId: "apify/instagram-scraper",
		label: "Instagram",
		description: "Scrape posts from an account",
		parser: new InstagramParser(),
	},
	tiktok: {
		actorId: "clockworks/free-tiktok-scraper",
		label: "TikTok",
		description: "Scrape videos from an account",
		parser: new TikTokParser(),
	},
	facebook: {
		actorId: "apify/facebook-posts-scraper",
		label: "Facebook",
		description: "Scrape posts from a page",
		parser: new FacebookParser(),
	},
	google_trends: {
		actorId: "emastra/google-trends-scraper",
		label: "Google Trends",
		description: "Discover trending topics",
		parser: new GoogleTrendsParser(),
	},
	google_search: {
		actorId: "apify/google-search-scraper",
		label: "Google Search",
		description: "Analyze search results",
		parser: new GoogleSearchParser(),
	},
};
```

- [ ] **Step 9: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add backend/src/providers/apify-parsers/ backend/src/config/apify-actors.ts
git commit -m "feat: add 6 Apify actor result parsers and actor registry"
```

---

## Task 4: Parser Unit Tests

**Files:**
- Create: `backend/tests/parsers/website-crawler.parser.test.ts`
- Create: `backend/tests/parsers/instagram.parser.test.ts`
- Create: `backend/tests/parsers/google-search.parser.test.ts`

- [ ] **Step 1: Write website crawler parser test**

Create `backend/tests/parsers/website-crawler.parser.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { WebsiteCrawlerParser } from "../../src/providers/apify-parsers/website-crawler.parser";

describe("WebsiteCrawlerParser", () => {
	const parser = new WebsiteCrawlerParser();

	it("should parse crawled page items", () => {
		const raw = [
			{
				url: "https://example.com/about",
				text: "We are a tech company building products.",
				metadata: { title: "About Us", description: "Company info" },
				loadedAt: "2026-04-12T10:00:00Z",
			},
		];

		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].dataType).toBe("page_content");
		expect(results[0].title).toBe("About Us");
		expect(results[0].url).toBe("https://example.com/about");
		expect(results[0].content).toBe("We are a tech company building products.");
		expect(results[0].metadata.description).toBe("Company info");
	});

	it("should skip items without text or markdown", () => {
		const raw = [{ url: "https://example.com/empty" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});

	it("should fall back to markdown when text is missing", () => {
		const raw = [{ markdown: "# Hello\nWorld", url: "https://example.com" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe("# Hello\nWorld");
	});
});
```

- [ ] **Step 2: Write Instagram parser test**

Create `backend/tests/parsers/instagram.parser.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { InstagramParser } from "../../src/providers/apify-parsers/instagram.parser";

describe("InstagramParser", () => {
	const parser = new InstagramParser();

	it("should parse Instagram post items", () => {
		const raw = [
			{
				caption: "Check out our new product! #launch #tech",
				ownerUsername: "brandname",
				shortCode: "ABC123",
				type: "Image",
				likesCount: 1500,
				commentsCount: 42,
				hashtags: ["launch", "tech"],
				displayUrl: "https://instagram.com/p/ABC123/media",
				timestamp: "2026-04-10T12:00:00Z",
			},
		];

		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].dataType).toBe("social_post");
		expect(results[0].title).toBe("@brandname");
		expect(results[0].content).toBe("Check out our new product! #launch #tech");
		expect(results[0].metadata.platform).toBe("instagram");
		expect(results[0].metadata.likesCount).toBe(1500);
		expect(results[0].metadata.commentsCount).toBe(42);
		expect(results[0].metadata.hashtags).toEqual(["launch", "tech"]);
	});

	it("should skip items without caption or type", () => {
		const raw = [{ url: "https://instagram.com/p/empty" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});
});
```

- [ ] **Step 3: Write Google Search parser test**

Create `backend/tests/parsers/google-search.parser.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";
import { GoogleSearchParser } from "../../src/providers/apify-parsers/google-search.parser";

describe("GoogleSearchParser", () => {
	const parser = new GoogleSearchParser();

	it("should parse organic results array", () => {
		const raw = [
			{
				searchQuery: { term: "content marketing tips" },
				organicResults: [
					{
						title: "10 Content Marketing Tips",
						url: "https://blog.com/tips",
						description: "Learn the best strategies for content marketing.",
						position: 1,
					},
					{
						title: "Marketing Guide 2026",
						url: "https://guide.com",
						description: "Complete marketing guide.",
						position: 2,
					},
				],
			},
		];

		const results = parser.parse(raw);
		expect(results).toHaveLength(2);
		expect(results[0].dataType).toBe("search_result");
		expect(results[0].title).toBe("10 Content Marketing Tips");
		expect(results[0].metadata.position).toBe(1);
		expect(results[0].metadata.searchQuery).toBe("content marketing tips");
		expect(results[1].metadata.position).toBe(2);
	});

	it("should skip items without title or description", () => {
		const raw = [{ organicResults: [{ position: 1 }] }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test tests/parsers/`
Expected: All 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/parsers/
git commit -m "test: add unit tests for Apify actor result parsers"
```

---

## Task 5: Research Repository & Interface

**Files:**
- Create: `backend/src/interfaces/repositories/research.repository.interface.ts`
- Create: `backend/src/repositories/research.repository.ts`
- Create: `backend/src/types/research.types.ts`

- [ ] **Step 1: Create research types**

Create `backend/src/types/research.types.ts`:

```typescript
import type { ActorType } from "../config/apify-actors";

export interface CreateResearchRunInput {
	actorType: ActorType;
	input: Record<string, any>;
	brandId?: string;
}

export interface ResearchRunFilters {
	actorType?: string;
	status?: string;
	brandId?: string;
}
```

- [ ] **Step 2: Create research repository interface**

Create `backend/src/interfaces/repositories/research.repository.interface.ts`:

```typescript
import type { ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { ResearchRunFilters } from "../../types/research.types";

export interface IResearchRepository {
	findRunsByWorkspace(
		workspaceId: string,
		filters?: ResearchRunFilters,
	): Promise<(ResearchRun & { brand: { name: string } | null; user: { fullName: string | null; email: string } })[]>;
	findRunById(id: string): Promise<(ResearchRun & { results: ResearchResult[] }) | null>;
	createRun(data: {
		workspaceId: string;
		userId: string;
		brandId?: string;
		actorType: string;
		actorId: string;
		input: any;
	}): Promise<ResearchRun>;
	updateRun(id: string, data: Partial<ResearchRun>): Promise<ResearchRun>;
	createResults(
		runId: string,
		workspaceId: string,
		results: Array<{
			dataType: string;
			title?: string;
			url?: string;
			content: string;
			metadata: any;
			scrapedAt: Date;
		}>,
	): Promise<number>;
	findResultById(id: string): Promise<ResearchResult | null>;
	findResultsByRun(
		runId: string,
		skip?: number,
		take?: number,
	): Promise<ResearchResult[]>;

	// Workspace settings
	getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null>;
	upsertWorkspaceSetting(
		workspaceId: string,
		data: { apifyApiKey?: string | null },
	): Promise<WorkspaceSetting>;
}
```

- [ ] **Step 3: Create research repository implementation**

Create `backend/src/repositories/research.repository.ts`:

```typescript
import type { PrismaClient, ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { IResearchRepository } from "../interfaces/repositories/research.repository.interface";
import type { ResearchRunFilters } from "../types/research.types";

export class ResearchRepository implements IResearchRepository {
	constructor(private prisma: PrismaClient) {}

	async findRunsByWorkspace(
		workspaceId: string,
		filters?: ResearchRunFilters,
	) {
		const where: any = { workspaceId };
		if (filters?.actorType) where.actorType = filters.actorType;
		if (filters?.status) where.status = filters.status;
		if (filters?.brandId) where.brandId = filters.brandId;

		return this.prisma.researchRun.findMany({
			where,
			orderBy: { createdAt: "desc" },
			include: {
				brand: { select: { name: true } },
				user: { select: { fullName: true, email: true } },
			},
		});
	}

	async findRunById(id: string) {
		return this.prisma.researchRun.findUnique({
			where: { id },
			include: { results: { orderBy: { createdAt: "asc" } } },
		});
	}

	async createRun(data: {
		workspaceId: string;
		userId: string;
		brandId?: string;
		actorType: string;
		actorId: string;
		input: any;
	}): Promise<ResearchRun> {
		return this.prisma.researchRun.create({ data });
	}

	async updateRun(id: string, data: Partial<ResearchRun>): Promise<ResearchRun> {
		return this.prisma.researchRun.update({ where: { id }, data: data as any });
	}

	async createResults(
		runId: string,
		workspaceId: string,
		results: Array<{
			dataType: string;
			title?: string;
			url?: string;
			content: string;
			metadata: any;
			scrapedAt: Date;
		}>,
	): Promise<number> {
		const data = results.map((r) => ({
			runId,
			workspaceId,
			dataType: r.dataType,
			title: r.title ?? null,
			url: r.url ?? null,
			content: r.content,
			metadata: r.metadata,
			scrapedAt: r.scrapedAt,
		}));
		const { count } = await this.prisma.researchResult.createMany({ data });
		return count;
	}

	async findResultById(id: string): Promise<ResearchResult | null> {
		return this.prisma.researchResult.findUnique({ where: { id } });
	}

	async findResultsByRun(
		runId: string,
		skip = 0,
		take = 50,
	): Promise<ResearchResult[]> {
		return this.prisma.researchResult.findMany({
			where: { runId },
			orderBy: { createdAt: "asc" },
			skip,
			take,
		});
	}

	async getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null> {
		return this.prisma.workspaceSetting.findUnique({ where: { workspaceId } });
	}

	async upsertWorkspaceSetting(
		workspaceId: string,
		data: { apifyApiKey?: string | null },
	): Promise<WorkspaceSetting> {
		return this.prisma.workspaceSetting.upsert({
			where: { workspaceId },
			update: data,
			create: { workspaceId, ...data },
		});
	}
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/types/research.types.ts backend/src/interfaces/repositories/research.repository.interface.ts backend/src/repositories/research.repository.ts
git commit -m "feat: add ResearchRepository with workspace settings support"
```

---

## Task 6: Research Service & Interface

**Files:**
- Create: `backend/src/interfaces/services/research.service.interface.ts`
- Create: `backend/src/services/research.service.ts`

- [ ] **Step 1: Create research service interface**

Create `backend/src/interfaces/services/research.service.interface.ts`:

```typescript
import type { ResearchResult, ResearchRun } from "@prisma/client";
import type { CreateResearchRunInput, ResearchRunFilters } from "../../types/research.types";

export interface IResearchService {
	createRun(
		workspaceId: string,
		userId: string,
		input: CreateResearchRunInput,
	): Promise<ResearchRun>;
	listRuns(
		workspaceId: string,
		filters?: ResearchRunFilters,
	): Promise<any[]>;
	getRun(runId: string): Promise<any>;
	getRunResults(runId: string, skip?: number, take?: number): Promise<ResearchResult[]>;
	getResult(resultId: string): Promise<ResearchResult>;
	getResultAsContext(resultId: string): Promise<string>;

	// Workspace settings
	getSettings(workspaceId: string): Promise<{ hasApifyKey: boolean; maskedKey?: string }>;
	setApifyKey(workspaceId: string, apiKey: string): Promise<void>;
	testApifyKey(workspaceId: string): Promise<boolean>;
	removeApifyKey(workspaceId: string): Promise<void>;
}
```

- [ ] **Step 2: Create research service implementation**

Create `backend/src/services/research.service.ts`:

```typescript
import type { PgBoss } from "pg-boss";
import type { ResearchResult, ResearchRun } from "@prisma/client";
import { APIFY_ACTORS, type ActorType } from "../config/apify-actors";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IResearchRepository } from "../interfaces/repositories/research.repository.interface";
import type { IResearchService } from "../interfaces/services/research.service.interface";
import type { CreateResearchRunInput, ResearchRunFilters } from "../types/research.types";

export class ResearchService implements IResearchService {
	constructor(
		private researchRepository: IResearchRepository,
		private apifyProvider: IApifyProvider,
		private boss: PgBoss,
		private logger: ILogger,
	) {}

	async createRun(
		workspaceId: string,
		userId: string,
		input: CreateResearchRunInput,
	): Promise<ResearchRun> {
		// Validate actor type
		const actorConfig = APIFY_ACTORS[input.actorType];
		if (!actorConfig) {
			throw new Error(`Unknown actor type: ${input.actorType}`);
		}

		// Check Apify key exists
		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey) {
			throw new Error("Apify API key not configured. Set it in workspace settings.");
		}

		// Create run record
		const run = await this.researchRepository.createRun({
			workspaceId,
			userId,
			brandId: input.brandId,
			actorType: input.actorType,
			actorId: actorConfig.actorId,
			input: input.input,
		});

		// Enqueue job
		await this.boss.send("research-run", { researchRunId: run.id });
		this.logger.info("Research run enqueued", { runId: run.id, actorType: input.actorType });

		return run;
	}

	async listRuns(workspaceId: string, filters?: ResearchRunFilters) {
		return this.researchRepository.findRunsByWorkspace(workspaceId, filters);
	}

	async getRun(runId: string) {
		const run = await this.researchRepository.findRunById(runId);
		if (!run) throw new Error("Research run not found");
		return run;
	}

	async getRunResults(
		runId: string,
		skip = 0,
		take = 50,
	): Promise<ResearchResult[]> {
		return this.researchRepository.findResultsByRun(runId, skip, take);
	}

	async getResult(resultId: string): Promise<ResearchResult> {
		const result = await this.researchRepository.findResultById(resultId);
		if (!result) throw new Error("Research result not found");
		return result;
	}

	async getResultAsContext(resultId: string): Promise<string> {
		const result = await this.getResult(resultId);
		const parts: string[] = [];

		if (result.title) parts.push(`Title: ${result.title}`);
		if (result.url) parts.push(`Source: ${result.url}`);
		parts.push(`Content: ${result.content}`);

		const meta = result.metadata as Record<string, any>;
		if (meta.platform) parts.push(`Platform: ${meta.platform}`);
		if (meta.hashtags?.length) parts.push(`Hashtags: ${meta.hashtags.join(", ")}`);

		return parts.join("\n");
	}

	// Workspace settings
	async getSettings(workspaceId: string) {
		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey) {
			return { hasApifyKey: false };
		}
		const key = settings.apifyApiKey;
		const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "****";
		return { hasApifyKey: true, maskedKey: masked };
	}

	async setApifyKey(workspaceId: string, apiKey: string): Promise<void> {
		await this.researchRepository.upsertWorkspaceSetting(workspaceId, {
			apifyApiKey: apiKey,
		});
	}

	async testApifyKey(workspaceId: string): Promise<boolean> {
		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey) return false;
		return this.apifyProvider.testConnection(settings.apifyApiKey);
	}

	async removeApifyKey(workspaceId: string): Promise<void> {
		await this.researchRepository.upsertWorkspaceSetting(workspaceId, {
			apifyApiKey: null,
		});
	}
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/interfaces/services/research.service.interface.ts backend/src/services/research.service.ts
git commit -m "feat: add ResearchService with workspace settings and run management"
```

---

## Task 7: Research Service Unit Tests

**Files:**
- Create: `backend/tests/helpers/mock-research.repository.ts`
- Create: `backend/tests/helpers/mock-apify.provider.ts`
- Create: `backend/tests/services/research.service.test.ts`

- [ ] **Step 1: Create mock Apify provider**

Create `backend/tests/helpers/mock-apify.provider.ts`:

```typescript
import type {
	ApifyResultItem,
	ApifyRunStatus,
	IApifyProvider,
} from "../../src/interfaces/providers/apify.interface";

export class MockApifyProvider implements IApifyProvider {
	public lastRunInput: Record<string, any> | null = null;
	public shouldFail = false;

	async runActor(
		actorId: string,
		input: Record<string, any>,
		_apiKey: string,
	): Promise<{ runId: string }> {
		if (this.shouldFail) throw new Error("Apify run failed");
		this.lastRunInput = input;
		return { runId: `run-${crypto.randomUUID().slice(0, 8)}` };
	}

	async getRunStatus(_runId: string, _apiKey: string): Promise<ApifyRunStatus> {
		return { status: "SUCCEEDED", finishedAt: new Date().toISOString() };
	}

	async getRunResults(_runId: string, _apiKey: string): Promise<ApifyResultItem[]> {
		return [];
	}

	async testConnection(_apiKey: string): Promise<boolean> {
		return !this.shouldFail;
	}
}
```

- [ ] **Step 2: Create mock research repository**

Create `backend/tests/helpers/mock-research.repository.ts`:

```typescript
import type { ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { IResearchRepository } from "../../src/interfaces/repositories/research.repository.interface";
import type { ResearchRunFilters } from "../../src/types/research.types";

export class MockResearchRepository implements IResearchRepository {
	private runs: any[] = [];
	private results: ResearchResult[] = [];
	private settings: WorkspaceSetting[] = [];

	async findRunsByWorkspace(workspaceId: string, filters?: ResearchRunFilters) {
		let filtered = this.runs.filter((r) => r.workspaceId === workspaceId);
		if (filters?.actorType) filtered = filtered.filter((r) => r.actorType === filters.actorType);
		if (filters?.status) filtered = filtered.filter((r) => r.status === filters.status);
		if (filters?.brandId) filtered = filtered.filter((r) => r.brandId === filters.brandId);
		return filtered;
	}

	async findRunById(id: string) {
		const run = this.runs.find((r) => r.id === id);
		if (!run) return null;
		return { ...run, results: this.results.filter((r) => r.runId === id) };
	}

	async createRun(data: any): Promise<ResearchRun> {
		const run = {
			id: crypto.randomUUID(),
			...data,
			apifyRunId: null,
			status: "pending",
			errorMessage: null,
			resultCount: 0,
			startedAt: null,
			completedAt: null,
			createdAt: new Date(),
			brand: data.brandId ? { name: "Test Brand" } : null,
			user: { fullName: "Test User", email: "test@test.com" },
		};
		this.runs.push(run);
		return run as any;
	}

	async updateRun(id: string, data: any): Promise<ResearchRun> {
		const idx = this.runs.findIndex((r) => r.id === id);
		if (idx === -1) throw new Error("Run not found");
		this.runs[idx] = { ...this.runs[idx], ...data };
		return this.runs[idx] as any;
	}

	async createResults(runId: string, workspaceId: string, results: any[]): Promise<number> {
		for (const r of results) {
			this.results.push({
				id: crypto.randomUUID(),
				runId,
				workspaceId,
				dataType: r.dataType,
				title: r.title ?? null,
				url: r.url ?? null,
				content: r.content,
				metadata: r.metadata,
				scrapedAt: r.scrapedAt,
				createdAt: new Date(),
			} as any);
		}
		return results.length;
	}

	async findResultById(id: string): Promise<ResearchResult | null> {
		return this.results.find((r) => r.id === id) ?? null;
	}

	async findResultsByRun(runId: string, skip = 0, take = 50): Promise<ResearchResult[]> {
		return this.results.filter((r) => r.runId === runId).slice(skip, skip + take);
	}

	async getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null> {
		return this.settings.find((s) => s.workspaceId === workspaceId) ?? null;
	}

	async upsertWorkspaceSetting(
		workspaceId: string,
		data: { apifyApiKey?: string | null },
	): Promise<WorkspaceSetting> {
		const idx = this.settings.findIndex((s) => s.workspaceId === workspaceId);
		if (idx >= 0) {
			this.settings[idx] = { ...this.settings[idx], ...data, updatedAt: new Date() } as any;
			return this.settings[idx];
		}
		const setting = {
			id: crypto.randomUUID(),
			workspaceId,
			apifyApiKey: data.apifyApiKey ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as WorkspaceSetting;
		this.settings.push(setting);
		return setting;
	}

	clear(): void {
		this.runs = [];
		this.results = [];
		this.settings = [];
	}
}
```

- [ ] **Step 3: Write research service tests**

Create `backend/tests/services/research.service.test.ts`:

```typescript
import { afterEach, describe, expect, it } from "bun:test";
import { ResearchService } from "../../src/services/research.service";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockResearchRepository } from "../helpers/mock-research.repository";

// Minimal mock PgBoss
const mockBoss = {
	send: async () => undefined,
} as any;

// Minimal mock logger
const mockLogger = {
	info: () => {},
	warn: () => {},
	error: () => {},
} as any;

describe("ResearchService", () => {
	const repo = new MockResearchRepository();
	const apify = new MockApifyProvider();
	const service = new ResearchService(repo, apify, mockBoss, mockLogger);
	const workspaceId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		repo.clear();
		apify.shouldFail = false;
	});

	describe("createRun", () => {
		it("should throw if no Apify key is configured", async () => {
			await expect(
				service.createRun(workspaceId, userId, {
					actorType: "instagram",
					input: { username: "test" },
				}),
			).rejects.toThrow("Apify API key not configured");
		});

		it("should create a run when Apify key exists", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });

			const run = await service.createRun(workspaceId, userId, {
				actorType: "instagram",
				input: { username: "competitor" },
			});

			expect(run.workspaceId).toBe(workspaceId);
			expect(run.userId).toBe(userId);
			expect(run.actorType).toBe("instagram");
			expect(run.status).toBe("pending");
		});

		it("should throw for unknown actor type", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });

			await expect(
				service.createRun(workspaceId, userId, {
					actorType: "unknown_actor" as any,
					input: {},
				}),
			).rejects.toThrow("Unknown actor type");
		});
	});

	describe("listRuns", () => {
		it("should return runs for workspace", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			await service.createRun(workspaceId, userId, {
				actorType: "instagram",
				input: { username: "a" },
			});
			await service.createRun(workspaceId, userId, {
				actorType: "google_search",
				input: { query: "test" },
			});

			const runs = await service.listRuns(workspaceId);
			expect(runs).toHaveLength(2);
		});

		it("should filter by actorType", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			await service.createRun(workspaceId, userId, {
				actorType: "instagram",
				input: {},
			});
			await service.createRun(workspaceId, userId, {
				actorType: "google_search",
				input: {},
			});

			const runs = await service.listRuns(workspaceId, { actorType: "instagram" });
			expect(runs).toHaveLength(1);
			expect(runs[0].actorType).toBe("instagram");
		});
	});

	describe("settings", () => {
		it("should report no key when not set", async () => {
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(false);
		});

		it("should set and mask key", async () => {
			await service.setApifyKey(workspaceId, "apify_api_1234567890");
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(true);
			expect(settings.maskedKey).toBe("apif...7890");
		});

		it("should remove key", async () => {
			await service.setApifyKey(workspaceId, "apify_api_1234567890");
			await service.removeApifyKey(workspaceId);
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(false);
		});
	});
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && bun test tests/services/research.service.test.ts`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/helpers/mock-apify.provider.ts backend/tests/helpers/mock-research.repository.ts backend/tests/services/research.service.test.ts
git commit -m "test: add ResearchService unit tests with mock repository and provider"
```

---

## Task 8: Research Run Job

**Files:**
- Create: `backend/src/jobs/research-run.job.ts`

- [ ] **Step 1: Create the research run job**

Create `backend/src/jobs/research-run.job.ts`:

```typescript
import type { PrismaClient } from "@prisma/client";
import { APIFY_ACTORS } from "../config/apify-actors";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface ResearchRunJobData {
	researchRunId: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResearchRunJob {
	constructor(
		private prisma: PrismaClient,
		private apifyProvider: IApifyProvider,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: ResearchRunJobData): Promise<void> {
		const { researchRunId } = data;

		const run = await this.prisma.researchRun.findUnique({
			where: { id: researchRunId },
		});
		if (!run) {
			this.logger.error("Research run not found", { researchRunId });
			return;
		}

		// Get Apify API key
		const settings = await this.prisma.workspaceSetting.findUnique({
			where: { workspaceId: run.workspaceId },
		});
		if (!settings?.apifyApiKey) {
			await this.failRun(run.id, run.userId, run.actorType, "No Apify API key configured");
			return;
		}
		const apiKey = settings.apifyApiKey;

		// Resolve actor config
		const actorConfig = APIFY_ACTORS[run.actorType as keyof typeof APIFY_ACTORS];
		if (!actorConfig) {
			await this.failRun(run.id, run.userId, run.actorType, `Unknown actor type: ${run.actorType}`);
			return;
		}

		try {
			// Start Apify actor run
			const { runId: apifyRunId } = await this.apifyProvider.runActor(
				actorConfig.actorId,
				run.input as Record<string, any>,
				apiKey,
			);

			await this.prisma.researchRun.update({
				where: { id: run.id },
				data: { apifyRunId, status: "running", startedAt: new Date() },
			});

			// Poll for completion with exponential backoff
			let delay = 1000;
			const maxDelay = 30000;
			const timeout = 5 * 60 * 1000; // 5 minutes
			const startTime = Date.now();

			while (Date.now() - startTime < timeout) {
				await sleep(delay);
				const status = await this.apifyProvider.getRunStatus(apifyRunId, apiKey);

				if (status.status === "SUCCEEDED") {
					break;
				}
				if (status.status === "FAILED" || status.status === "ABORTED" || status.status === "TIMED-OUT") {
					await this.failRun(run.id, run.userId, run.actorType, `Apify run ${status.status}`);
					return;
				}

				delay = Math.min(delay * 2, maxDelay);
			}

			// Check for timeout
			if (Date.now() - startTime >= timeout) {
				await this.failRun(run.id, run.userId, run.actorType, "Apify run timed out after 5 minutes");
				return;
			}

			// Fetch and parse results
			const rawResults = await this.apifyProvider.getRunResults(apifyRunId, apiKey);
			const parsed = actorConfig.parser.parse(rawResults);

			// Bulk insert results
			let resultCount = 0;
			if (parsed.length > 0) {
				resultCount = await this.prisma.researchResult.createMany({
					data: parsed.map((r) => ({
						runId: run.id,
						workspaceId: run.workspaceId,
						dataType: r.dataType,
						title: r.title ?? null,
						url: r.url ?? null,
						content: r.content,
						metadata: r.metadata,
						scrapedAt: r.scrapedAt,
					})),
				}).then((r) => r.count);
			}

			// Update run as completed
			await this.prisma.researchRun.update({
				where: { id: run.id },
				data: { status: "completed", resultCount, completedAt: new Date() },
			});

			// Notify via SSE
			this.notificationService.notify(run.userId, {
				type: "research_run_complete",
				data: { runId: run.id, actorType: run.actorType, resultCount },
			});

			this.logger.info("Research run completed", {
				runId: run.id,
				actorType: run.actorType,
				resultCount,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await this.failRun(run.id, run.userId, run.actorType, message);
		}
	}

	private async failRun(
		runId: string,
		userId: string,
		actorType: string,
		errorMessage: string,
	): Promise<void> {
		await this.prisma.researchRun.update({
			where: { id: runId },
			data: { status: "failed", errorMessage, completedAt: new Date() },
		});
		this.notificationService.notify(userId, {
			type: "research_run_failed",
			data: { runId, actorType, errorMessage },
		});
		this.logger.error("Research run failed", { runId, actorType, error: errorMessage });
	}
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/jobs/research-run.job.ts
git commit -m "feat: add ResearchRunJob with Apify polling and result parsing"
```

---

## Task 9: Research Routes

**Files:**
- Create: `backend/src/routes/research.route.ts`

- [ ] **Step 1: Create research routes**

Create `backend/src/routes/research.route.ts`:

```typescript
import { Hono } from "hono";
import type { IResearchService } from "../interfaces/services/research.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createResearchRoutes(researchService: IResearchService) {
	const app = new Hono<{ Variables: Variables }>();

	// ── Settings ──────────────────────────────────────────────

	app.get("/settings", async (c) => {
		const workspaceId = c.get("workspaceId");
		const settings = await researchService.getSettings(workspaceId);
		return c.json({ data: settings });
	});

	app.put("/settings/apify", async (c) => {
		const workspaceId = c.get("workspaceId");
		const role = c.get("workspaceRole");
		if (role !== "admin") {
			return c.json({ error: "Only admins can manage integrations" }, 403);
		}
		const { apiKey } = await c.req.json<{ apiKey: string }>();
		if (!apiKey || typeof apiKey !== "string") {
			return c.json({ error: "apiKey is required" }, 400);
		}
		await researchService.setApifyKey(workspaceId, apiKey);
		return c.json({ data: { success: true } });
	});

	app.post("/settings/apify/test", async (c) => {
		const workspaceId = c.get("workspaceId");
		const connected = await researchService.testApifyKey(workspaceId);
		return c.json({ data: { connected } });
	});

	app.delete("/settings/apify", async (c) => {
		const workspaceId = c.get("workspaceId");
		const role = c.get("workspaceRole");
		if (role !== "admin") {
			return c.json({ error: "Only admins can manage integrations" }, 403);
		}
		await researchService.removeApifyKey(workspaceId);
		return c.json({ data: { success: true } });
	});

	// ── Runs ─────────────────────────────────────────────────

	app.post("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();

		const run = await researchService.createRun(workspaceId, userId, {
			actorType: body.actorType,
			input: body.input,
			brandId: body.brandId,
		});

		return c.json({ data: run }, 201);
	});

	app.get("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const actorType = c.req.query("actorType") || undefined;
		const status = c.req.query("status") || undefined;
		const brandId = c.req.query("brandId") || undefined;

		const runs = await researchService.listRuns(workspaceId, { actorType, status, brandId });
		return c.json({ data: runs });
	});

	app.get("/runs/:runId", async (c) => {
		const run = await researchService.getRun(c.req.param("runId"));
		return c.json({ data: run });
	});

	app.get("/runs/:runId/results", async (c) => {
		const runId = c.req.param("runId");
		const skip = Number(c.req.query("skip") || "0");
		const take = Number(c.req.query("take") || "50");
		const results = await researchService.getRunResults(runId, skip, take);
		return c.json({ data: results });
	});

	app.get("/runs/:runId/results/:resultId", async (c) => {
		const result = await researchService.getResult(c.req.param("resultId"));
		return c.json({ data: result });
	});

	app.get("/runs/:runId/results/:resultId/as-context", async (c) => {
		const context = await researchService.getResultAsContext(c.req.param("resultId"));
		return c.json({ data: { context } });
	});

	return app;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/research.route.ts
git commit -m "feat: add research routes for runs, results, and workspace settings"
```

---

## Task 10: Composition Root Wiring

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Add imports**

Add these imports at the appropriate places in `backend/src/index.ts` (after the existing import groups):

After the job imports (after line 13 `import { RecommendationRecomputeJob }`):
```typescript
import { ResearchRunJob } from "./jobs/research-run.job";
```

After the provider imports (after line 22 `import { WinstonLogger }`):
```typescript
import { ApifyProvider } from "./providers/apify.provider";
```

After the repository imports (after line 33 `import { WorkspaceRepository }`):
```typescript
import { ResearchRepository } from "./repositories/research.repository";
```

After the route imports (after line 50 `import { createWorkspaceRoutes }`):
```typescript
import { createResearchRoutes } from "./routes/research.route";
```

After the service imports (after line 60 `import { ProductService }`):
```typescript
import { ResearchService } from "./services/research.service";
```

- [ ] **Step 2: Add provider, repository, service, and job instantiation**

After the `storageProvider` line (around line 123), add:
```typescript
	const apifyProvider = new ApifyProvider();
```

After `documentRepository` (around line 117), add:
```typescript
	const researchRepository = new ResearchRepository(prisma);
```

After `adminService` (around line 149), add:
```typescript
	const researchService = new ResearchService(researchRepository, apifyProvider, boss, logger);
```

After `recommendationRecomputeJob` (around line 189), add:
```typescript
	const researchRunJob = new ResearchRunJob(prisma, apifyProvider, notificationService, logger);
```

- [ ] **Step 3: Register queue and worker**

After `await boss.createQueue("recommendation-recompute");` (line 199), add:
```typescript
	await boss.createQueue("research-run");
```

After the `recommendation-recompute` worker registration (line 225), add:
```typescript
	await boss.work("research-run", async (jobs) => {
		for (const job of jobs) await researchRunJob.handle(job.data as any);
	});
```

- [ ] **Step 4: Mount research routes**

After `workspaceScoped.route("/ai-logs", createAiLogRoutes(prisma));` (line 326), add:
```typescript
	workspaceScoped.route("/research", createResearchRoutes(researchService));
```

- [ ] **Step 5: Add "Research run not found" to knownErrors**

In the `knownErrors` array (around line 235), add:
```typescript
	"Research run not found",
	"Research result not found",
	"Apify API key not configured. Set it in workspace settings.",
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat: wire ApifyProvider, ResearchService, and ResearchRunJob into composition root"
```

---

## Task 11: Enhanced Brand Scraping with Apify Pre-Step

**Files:**
- Modify: `backend/src/jobs/brand-scraping.job.ts`

- [ ] **Step 1: Add Apify provider to constructor**

Modify `backend/src/jobs/brand-scraping.job.ts`. Update the import and constructor:

```typescript
import type { PrismaClient } from "@prisma/client";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { IBrandScraper } from "../interfaces/providers/brand-scraper.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { WebsiteCrawlerParser } from "../providers/apify-parsers/website-crawler.parser";

interface BrandScrapingJobData {
	brandId: string;
	url: string;
	userId: string;
}

export class BrandScrapingJob {
	constructor(
		private prisma: PrismaClient,
		private brandScraper: IBrandScraper,
		private notificationService: INotificationService,
		private logger: ILogger,
		private apifyProvider?: IApifyProvider,
	) {}
```

- [ ] **Step 2: Add Apify pre-step in handle method**

Replace the beginning of the `handle` method's try block (after `const { brandId, url, userId } = data;` and inside the `try`). Add the Apify enrichment before the AI scrape call:

Replace:
```typescript
			// Scrape brand data from URL
			const scraped = await this.brandScraper.scrape({ url });
```

With:
```typescript
			// Apify pre-step: enrich with structured content if API key available
			let enrichedContent: string | undefined;
			if (this.apifyProvider) {
				try {
					const settings = await this.prisma.workspaceSetting.findFirst({
						where: {
							workspace: {
								brands: { some: { id: brandId } },
							},
						},
					});
					if (settings?.apifyApiKey) {
						this.logger.info("Using Apify to pre-scrape brand URL", { brandId, url });
						const { runId } = await this.apifyProvider.runActor(
							"apify/website-content-crawler",
							{ startUrls: [{ url }], maxCrawlPages: 5 },
							settings.apifyApiKey,
						);

						// Wait for Apify completion (max 2 min for brand scraping)
						let delay = 1000;
						const start = Date.now();
						while (Date.now() - start < 120000) {
							await new Promise((r) => setTimeout(r, delay));
							const status = await this.apifyProvider.getRunStatus(runId, settings.apifyApiKey);
							if (status.status === "SUCCEEDED") break;
							if (status.status === "FAILED" || status.status === "ABORTED") break;
							delay = Math.min(delay * 2, 15000);
						}

						const rawResults = await this.apifyProvider.getRunResults(runId, settings.apifyApiKey);
						const parser = new WebsiteCrawlerParser();
						const parsed = parser.parse(rawResults);
						if (parsed.length > 0) {
							enrichedContent = parsed
								.slice(0, 5)
								.map((p) => `## ${p.title || "Page"}\n${p.content}`)
								.join("\n\n---\n\n")
								.slice(0, 10000);
							this.logger.info("Apify enrichment complete", {
								brandId,
								pages: parsed.length,
								chars: enrichedContent.length,
							});
						}
					}
				} catch (err) {
					this.logger.warn("Apify pre-step failed, falling back to AI-only scraping", {
						brandId,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			// Scrape brand data from URL (with optional enriched content)
			const scraped = enrichedContent
				? await this.brandScraper.scrape({ url, enrichedContent } as any)
				: await this.brandScraper.scrape({ url });
```

- [ ] **Step 3: Update BrandScrapingJob wiring in index.ts**

In `backend/src/index.ts`, update the `BrandScrapingJob` instantiation to pass `apifyProvider`:

Replace:
```typescript
	const brandScrapingJob = new BrandScrapingJob(
		prisma,
		resolveBrandScraper(),
		notificationService,
		logger,
	);
```

With:
```typescript
	const brandScrapingJob = new BrandScrapingJob(
		prisma,
		resolveBrandScraper(),
		notificationService,
		logger,
		apifyProvider,
	);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/brand-scraping.job.ts backend/src/index.ts
git commit -m "feat: enhance brand scraping with Apify website crawler pre-step"
```

---

## Task 12: Content Generation — Research Context Support

**Files:**
- Modify: `backend/src/interfaces/providers/content-generator.interface.ts`
- Modify: `backend/src/types/generation.types.ts`
- Modify: `backend/src/routes/generation.route.ts`
- Modify: `backend/src/services/generation.service.ts`
- Modify: `backend/src/jobs/content-generation.job.ts`

- [ ] **Step 1: Add researchContext to ContentGenerationInput**

In `backend/src/interfaces/providers/content-generator.interface.ts`, add after `referenceImages`:

```typescript
	researchContext?: string;
```

- [ ] **Step 2: Add researchContext to CreateGenerationInput**

In `backend/src/types/generation.types.ts`, add after `referenceImages`:

```typescript
	researchContext?: string;
```

- [ ] **Step 3: Pass researchContext through the route**

In `backend/src/routes/generation.route.ts`, add `researchContext: body.researchContext,` to the `generationService.create()` call, after the `referenceImages` line.

- [ ] **Step 4: Pass researchContext through the service**

In `backend/src/services/generation.service.ts`, store researchContext in the job payload. In the `boss.send` call, add `researchContext: input.researchContext,` after `referenceImages`.

- [ ] **Step 5: Inject researchContext in content generation job**

In `backend/src/jobs/content-generation.job.ts`:

1. Add `researchContext?: string;` to the `ContentJobData` interface.

2. Add `researchContext` to the destructured `data` at the top of `handle`.

3. After the product reference context injection block (around line 179), add:

```typescript
			// Inject research context (from "Use as Inspiration")
			if (researchContext) {
				generationInput.researchContext = researchContext;
				this.logger.info("Research context injected into content generation", {
					requestId,
					charCount: researchContext.length,
				});
			}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/providers/content-generator.interface.ts backend/src/types/generation.types.ts backend/src/routes/generation.route.ts backend/src/services/generation.service.ts backend/src/jobs/content-generation.job.ts
git commit -m "feat: add researchContext pass-through for 'Use as Inspiration' flow"
```

---

## Task 13: Frontend — Research API Service

**Files:**
- Create: `frontend/src/services/research.service.ts`

- [ ] **Step 1: Create research API service**

Create `frontend/src/services/research.service.ts`:

```typescript
import { api } from "./api";

export interface ResearchRun {
	id: string;
	workspaceId: string;
	userId: string;
	brandId: string | null;
	actorType: string;
	actorId: string;
	input: Record<string, any>;
	apifyRunId: string | null;
	status: "pending" | "running" | "completed" | "failed";
	errorMessage: string | null;
	resultCount: number;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
	brand?: { name: string } | null;
	user?: { fullName: string | null; email: string };
}

export interface ResearchResult {
	id: string;
	runId: string;
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title: string | null;
	url: string | null;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: string;
	createdAt: string;
}

export interface WorkspaceResearchSettings {
	hasApifyKey: boolean;
	maskedKey?: string;
}

export const researchApi = {
	// Settings
	getSettings(workspaceId: string) {
		return api<WorkspaceResearchSettings>(
			`/api/workspaces/${workspaceId}/research/settings`,
		);
	},

	setApifyKey(workspaceId: string, apiKey: string) {
		return api<{ success: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify`,
			{ method: "PUT", body: JSON.stringify({ apiKey }) },
		);
	},

	testApifyKey(workspaceId: string) {
		return api<{ connected: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify/test`,
			{ method: "POST" },
		);
	},

	removeApifyKey(workspaceId: string) {
		return api<{ success: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify`,
			{ method: "DELETE" },
		);
	},

	// Runs
	createRun(
		workspaceId: string,
		data: { actorType: string; input: Record<string, any>; brandId?: string },
	) {
		return api<ResearchRun>(
			`/api/workspaces/${workspaceId}/research/runs`,
			{ method: "POST", body: JSON.stringify(data) },
		);
	},

	listRuns(
		workspaceId: string,
		filters?: { actorType?: string; status?: string; brandId?: string },
	) {
		const params = new URLSearchParams();
		if (filters?.actorType) params.set("actorType", filters.actorType);
		if (filters?.status) params.set("status", filters.status);
		if (filters?.brandId) params.set("brandId", filters.brandId);
		const qs = params.toString() ? `?${params.toString()}` : "";
		return api<ResearchRun[]>(
			`/api/workspaces/${workspaceId}/research/runs${qs}`,
		);
	},

	getRun(workspaceId: string, runId: string) {
		return api<ResearchRun & { results: ResearchResult[] }>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}`,
		);
	},

	getRunResults(
		workspaceId: string,
		runId: string,
		skip = 0,
		take = 50,
	) {
		return api<ResearchResult[]>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}/results?skip=${skip}&take=${take}`,
		);
	},

	getResultAsContext(workspaceId: string, runId: string, resultId: string) {
		return api<{ context: string }>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}/results/${resultId}/as-context`,
		);
	},
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/research.service.ts
git commit -m "feat: add frontend research API service"
```

---

## Task 14: Frontend — Research Hub Page

**Files:**
- Create: `frontend/src/pages/Research/ResearchPage.tsx`

- [ ] **Step 1: Create the Research hub page**

Create `frontend/src/pages/Research/ResearchPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
	Globe,
	Instagram,
	Music2,
	Facebook,
	TrendingUp,
	Search,
	Play,
	Settings,
	ExternalLink,
} from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import { useSSE } from "../../hooks/useSSE";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Modal } from "../../components/ui/Modal";
import { Spinner } from "../../components/ui/Spinner";
import { Toast } from "../../components/ui/Toast";
import { Badge } from "../../components/ui/Badge";
import {
	researchApi,
	type ResearchRun,
	type WorkspaceResearchSettings,
} from "../../services/research.service";
import { api } from "../../services/api";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface Brand {
	id: string;
	name: string;
}

const ACTORS = [
	{ type: "website_crawler", label: "Website Crawler", description: "Extract content from any website", icon: Globe },
	{ type: "instagram", label: "Instagram", description: "Scrape posts from an account", icon: Instagram },
	{ type: "tiktok", label: "TikTok", description: "Scrape videos from an account", icon: Music2 },
	{ type: "facebook", label: "Facebook", description: "Scrape posts from a page", icon: Facebook },
	{ type: "google_trends", label: "Google Trends", description: "Discover trending topics", icon: TrendingUp },
	{ type: "google_search", label: "Google Search", description: "Analyze search results", icon: Search },
] as const;

const STATUS_OPTIONS = [
	{ value: "", label: "All statuses" },
	{ value: "pending", label: "Pending" },
	{ value: "running", label: "Running" },
	{ value: "completed", label: "Completed" },
	{ value: "failed", label: "Failed" },
];

function statusBadgeVariant(status: string): "default" | "info" | "success" | "danger" | "warning" {
	if (status === "completed") return "success";
	if (status === "running") return "info";
	if (status === "failed") return "danger";
	return "default";
}

export function ResearchPage() {
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [settings, setSettings] = useState<WorkspaceResearchSettings | null>(null);
	const [runs, setRuns] = useState<ResearchRun[]>([]);
	const [brands, setBrands] = useState<Brand[]>([]);
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<ToastState>(null);

	// Filters
	const [actorFilter, setActorFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");

	// Modal state
	const [modalOpen, setModalOpen] = useState(false);
	const [selectedActor, setSelectedActor] = useState<string>("");
	const [formInput, setFormInput] = useState<Record<string, string>>({});
	const [formBrandId, setFormBrandId] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const wsId = activeWorkspace?.id;

	const loadData = useCallback(async () => {
		if (!wsId) return;
		setLoading(true);
		try {
			const [settingsData, runsData, brandsData] = await Promise.all([
				researchApi.getSettings(wsId),
				researchApi.listRuns(wsId, {
					actorType: actorFilter || undefined,
					status: statusFilter || undefined,
				}),
				api<Brand[]>(`/api/workspaces/${wsId}/brands`),
			]);
			setSettings(settingsData);
			setRuns(runsData);
			setBrands(brandsData);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load", type: "error" });
		} finally {
			setLoading(false);
		}
	}, [wsId, actorFilter, statusFilter]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	// Listen for SSE updates
	useSSE((event) => {
		if (event.type === "research_run_complete" || event.type === "research_run_failed") {
			loadData();
		}
	});

	const openActorForm = (actorType: string) => {
		setSelectedActor(actorType);
		setFormInput({});
		setFormBrandId("");
		setModalOpen(true);
	};

	const handleSubmit = async () => {
		if (!wsId || !selectedActor) return;
		setSubmitting(true);
		try {
			let input: Record<string, any> = {};

			if (selectedActor === "website_crawler") {
				input = { startUrls: [{ url: formInput.url }], maxCrawlPages: Number(formInput.maxPages || 10) };
			} else if (selectedActor === "instagram") {
				input = { directUrls: [formInput.username?.startsWith("http") ? formInput.username : `https://instagram.com/${formInput.username}`], resultsLimit: Number(formInput.maxPosts || 50) };
			} else if (selectedActor === "tiktok") {
				input = { profiles: [formInput.username?.startsWith("http") ? formInput.username : `https://tiktok.com/@${formInput.username}`], resultsPerPage: Number(formInput.maxVideos || 50) };
			} else if (selectedActor === "facebook") {
				input = { startUrls: [{ url: formInput.pageUrl }], maxPosts: Number(formInput.maxPosts || 50) };
			} else if (selectedActor === "google_trends") {
				input = { searchTerms: formInput.keywords?.split(",").map((k: string) => k.trim()), geo: formInput.geo || "US" };
			} else if (selectedActor === "google_search") {
				input = { queries: formInput.query, maxPagesPerQuery: 1, resultsPerPage: Number(formInput.maxResults || 30) };
			}

			await researchApi.createRun(wsId, {
				actorType: selectedActor,
				input,
				brandId: formBrandId || undefined,
			});
			setModalOpen(false);
			setToast({ message: "Research run started!", type: "success" });
			loadData();
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to start run", type: "error" });
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	// No Apify key empty state
	if (settings && !settings.hasApifyKey) {
		return (
			<div className="flex flex-col items-center justify-center h-96 text-center">
				<Search size={48} className="text-zinc-400 mb-4" />
				<h2 className="text-xl font-semibold text-zinc-100 mb-2">Connect Apify to start researching</h2>
				<p className="text-zinc-400 mb-6 max-w-md">
					Apify lets you scrape competitor social media, discover trends, and extract website content to power your content creation.
				</p>
				<Button onClick={() => navigate("/workspace-settings")}>Set up Apify</Button>
			</div>
		);
	}

	return (
		<div className="space-y-8 p-6">
			<div>
				<h1 className="text-2xl font-bold text-zinc-100">Research</h1>
				<p className="text-zinc-400 mt-1">Scrape competitors, discover trends, and research content ideas.</p>
			</div>

			{/* Launch Panel */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{ACTORS.map((actor) => {
					const Icon = actor.icon;
					return (
						<button
							key={actor.type}
							onClick={() => openActorForm(actor.type)}
							className="flex items-start gap-4 rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-5 text-left hover:border-violet-500/50 hover:bg-zinc-800 transition-colors"
						>
							<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
								<Icon size={20} className="text-violet-400" />
							</div>
							<div>
								<h3 className="font-medium text-zinc-100">{actor.label}</h3>
								<p className="text-sm text-zinc-400 mt-0.5">{actor.description}</p>
							</div>
						</button>
					);
				})}
			</div>

			{/* Filters */}
			<div className="flex gap-3">
				<Select
					options={[{ value: "", label: "All types" }, ...ACTORS.map((a) => ({ value: a.type, label: a.label }))]}
					value={actorFilter}
					onChange={(e) => setActorFilter(e.target.value)}
				/>
				<Select
					options={STATUS_OPTIONS}
					value={statusFilter}
					onChange={(e) => setStatusFilter(e.target.value)}
				/>
			</div>

			{/* Recent Runs */}
			{runs.length === 0 ? (
				<p className="text-zinc-500 text-center py-12">No research runs yet. Pick a scraper above to get started.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-zinc-700/50 text-left text-zinc-400">
								<th className="py-3 pr-4 font-medium">Type</th>
								<th className="py-3 pr-4 font-medium">Input</th>
								<th className="py-3 pr-4 font-medium">Brand</th>
								<th className="py-3 pr-4 font-medium">Status</th>
								<th className="py-3 pr-4 font-medium">Results</th>
								<th className="py-3 pr-4 font-medium">Date</th>
							</tr>
						</thead>
						<tbody>
							{runs.map((run) => {
								const actor = ACTORS.find((a) => a.type === run.actorType);
								const Icon = actor?.icon || Globe;
								return (
									<tr
										key={run.id}
										onClick={() => navigate(`/research/${run.id}`)}
										className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer"
									>
										<td className="py-3 pr-4">
											<div className="flex items-center gap-2">
												<Icon size={16} className="text-zinc-400" />
												<span className="text-zinc-200">{actor?.label || run.actorType}</span>
											</div>
										</td>
										<td className="py-3 pr-4 text-zinc-400 max-w-xs truncate">
											{JSON.stringify(run.input).slice(0, 60)}
										</td>
										<td className="py-3 pr-4 text-zinc-400">{run.brand?.name || "—"}</td>
										<td className="py-3 pr-4">
											<Badge variant={statusBadgeVariant(run.status)}>
												{run.status}
											</Badge>
										</td>
										<td className="py-3 pr-4 text-zinc-300">{run.resultCount}</td>
										<td className="py-3 pr-4 text-zinc-400">
											{new Date(run.createdAt).toLocaleDateString()}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}

			{/* Actor Form Modal */}
			<Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={ACTORS.find((a) => a.type === selectedActor)?.label || "Run Research"} size="md">
				<div className="space-y-4">
					{selectedActor === "website_crawler" && (
						<>
							<Input label="URL" placeholder="https://example.com" value={formInput.url || ""} onChange={(e) => setFormInput({ ...formInput, url: e.target.value })} />
							<Input label="Max pages" type="number" placeholder="10" value={formInput.maxPages || ""} onChange={(e) => setFormInput({ ...formInput, maxPages: e.target.value })} />
						</>
					)}
					{selectedActor === "instagram" && (
						<>
							<Input label="Username or profile URL" placeholder="@competitor or https://instagram.com/competitor" value={formInput.username || ""} onChange={(e) => setFormInput({ ...formInput, username: e.target.value })} />
							<Input label="Max posts" type="number" placeholder="50" value={formInput.maxPosts || ""} onChange={(e) => setFormInput({ ...formInput, maxPosts: e.target.value })} />
						</>
					)}
					{selectedActor === "tiktok" && (
						<>
							<Input label="Username or profile URL" placeholder="@competitor or https://tiktok.com/@competitor" value={formInput.username || ""} onChange={(e) => setFormInput({ ...formInput, username: e.target.value })} />
							<Input label="Max videos" type="number" placeholder="50" value={formInput.maxVideos || ""} onChange={(e) => setFormInput({ ...formInput, maxVideos: e.target.value })} />
						</>
					)}
					{selectedActor === "facebook" && (
						<>
							<Input label="Page URL" placeholder="https://facebook.com/pagename" value={formInput.pageUrl || ""} onChange={(e) => setFormInput({ ...formInput, pageUrl: e.target.value })} />
							<Input label="Max posts" type="number" placeholder="50" value={formInput.maxPosts || ""} onChange={(e) => setFormInput({ ...formInput, maxPosts: e.target.value })} />
						</>
					)}
					{selectedActor === "google_trends" && (
						<>
							<Input label="Keywords (comma-separated)" placeholder="marketing, AI, content" value={formInput.keywords || ""} onChange={(e) => setFormInput({ ...formInput, keywords: e.target.value })} />
							<Select
								label="Region"
								options={[
									{ value: "US", label: "United States" },
									{ value: "GB", label: "United Kingdom" },
									{ value: "ID", label: "Indonesia" },
									{ value: "SG", label: "Singapore" },
									{ value: "", label: "Worldwide" },
								]}
								value={formInput.geo || "US"}
								onChange={(e) => setFormInput({ ...formInput, geo: e.target.value })}
							/>
						</>
					)}
					{selectedActor === "google_search" && (
						<>
							<Input label="Search query" placeholder="best content marketing tools 2026" value={formInput.query || ""} onChange={(e) => setFormInput({ ...formInput, query: e.target.value })} />
							<Input label="Max results" type="number" placeholder="30" value={formInput.maxResults || ""} onChange={(e) => setFormInput({ ...formInput, maxResults: e.target.value })} />
						</>
					)}

					{/* Brand selector */}
					<Select
						label="Link to brand (optional)"
						options={[{ value: "", label: "No brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))]}
						value={formBrandId}
						onChange={(e) => setFormBrandId(e.target.value)}
					/>

					<div className="flex justify-end gap-2 pt-2">
						<Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
						<Button onClick={handleSubmit} loading={submitting}>
							<Play size={16} className="mr-1" /> Run Research
						</Button>
					</div>
				</div>
			</Modal>

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Research/ResearchPage.tsx
git commit -m "feat: add Research hub page with launch panel and runs list"
```

---

## Task 15: Frontend — Run Detail Page

**Files:**
- Create: `frontend/src/pages/Research/ResearchRunDetail.tsx`

- [ ] **Step 1: Create run detail page**

Create `frontend/src/pages/Research/ResearchRunDetail.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Sparkles, ExternalLink } from "lucide-react";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Spinner } from "../../components/ui/Spinner";
import { Toast } from "../../components/ui/Toast";
import {
	researchApi,
	type ResearchRun,
	type ResearchResult,
} from "../../services/research.service";

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "default" | "info" | "success" | "danger" | "warning" {
	if (status === "completed") return "success";
	if (status === "running") return "info";
	if (status === "failed") return "danger";
	return "default";
}

export function ResearchRunDetail() {
	const { runId } = useParams<{ runId: string }>();
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [run, setRun] = useState<(ResearchRun & { results: ResearchResult[] }) | null>(null);
	const [loading, setLoading] = useState(true);
	const [toast, setToast] = useState<ToastState>(null);

	const wsId = activeWorkspace?.id;

	const loadRun = useCallback(async () => {
		if (!wsId || !runId) return;
		setLoading(true);
		try {
			const data = await researchApi.getRun(wsId, runId);
			setRun(data);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load run", type: "error" });
		} finally {
			setLoading(false);
		}
	}, [wsId, runId]);

	useEffect(() => {
		loadRun();
	}, [loadRun]);

	const handleUseAsInspiration = async (result: ResearchResult) => {
		if (!wsId || !runId) return;
		try {
			const { context } = await researchApi.getResultAsContext(wsId, runId, result.id);
			navigate(`/generate?researchContext=${encodeURIComponent(context)}&researchTitle=${encodeURIComponent(result.title || "Research")}`);
		} catch (e) {
			setToast({ message: e instanceof Error ? e.message : "Failed to load context", type: "error" });
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<Spinner size="lg" />
			</div>
		);
	}

	if (!run) {
		return <p className="text-zinc-400 text-center py-12">Run not found.</p>;
	}

	return (
		<div className="space-y-6 p-6">
			{/* Header */}
			<div className="flex items-center gap-4">
				<button onClick={() => navigate("/research")} className="text-zinc-400 hover:text-zinc-200">
					<ArrowLeft size={20} />
				</button>
				<div className="flex-1">
					<h1 className="text-xl font-bold text-zinc-100">
						{run.actorType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Run
					</h1>
					<p className="text-sm text-zinc-400 mt-0.5">
						{new Date(run.createdAt).toLocaleString()} · {run.resultCount} results
					</p>
				</div>
				<Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
			</div>

			{run.errorMessage && (
				<div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
					{run.errorMessage}
				</div>
			)}

			{/* Results */}
			{run.results.length === 0 ? (
				<p className="text-zinc-500 text-center py-12">
					{run.status === "running" ? "Run in progress, results will appear when complete..." : "No results."}
				</p>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{run.results.map((result) => {
						const meta = result.metadata as Record<string, any>;
						return (
							<div
								key={result.id}
								className="rounded-xl border border-zinc-700/50 bg-zinc-800/50 p-5 space-y-3"
							>
								{result.title && (
									<h3 className="font-medium text-zinc-100 truncate">{result.title}</h3>
								)}
								<p className="text-sm text-zinc-300 line-clamp-4">{result.content}</p>

								{/* Platform metrics */}
								{meta.platform && (
									<div className="flex flex-wrap gap-2 text-xs text-zinc-400">
										{meta.likesCount != null && <span>Likes: {meta.likesCount.toLocaleString()}</span>}
										{meta.commentsCount != null && <span>Comments: {meta.commentsCount.toLocaleString()}</span>}
										{meta.diggCount != null && <span>Likes: {meta.diggCount.toLocaleString()}</span>}
										{meta.playCount != null && <span>Views: {meta.playCount.toLocaleString()}</span>}
										{meta.shares != null && <span>Shares: {meta.shares.toLocaleString()}</span>}
										{meta.position != null && <span>Position: #{meta.position}</span>}
										{meta.hashtags?.length > 0 && (
											<span>#{meta.hashtags.slice(0, 5).join(" #")}</span>
										)}
									</div>
								)}

								<div className="flex items-center gap-2 pt-1">
									<Button
										size="sm"
										onClick={() => handleUseAsInspiration(result)}
									>
										<Sparkles size={14} className="mr-1" />
										Use as Inspiration
									</Button>
									{result.url && (
										<a
											href={result.url}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200"
										>
											<ExternalLink size={12} /> Source
										</a>
									)}
								</div>
							</div>
						);
					})}
				</div>
			)}

			{toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
		</div>
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Research/ResearchRunDetail.tsx
git commit -m "feat: add Research run detail page with Use as Inspiration flow"
```

---

## Task 16: Frontend — Route Registration & Sidebar

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppShell.tsx`
- Modify: `frontend/src/hooks/useSSE.ts`

- [ ] **Step 1: Add Research routes to App.tsx**

In `frontend/src/App.tsx`:

Add imports:
```typescript
import { ResearchPage } from "./pages/Research/ResearchPage";
import { ResearchRunDetail } from "./pages/Research/ResearchRunDetail";
```

Add these routes inside the `<Route element={<AppShell />}>` block, after the `/content-library` route:
```tsx
<Route path="/research" element={<ResearchPage />} />
<Route path="/research/:runId" element={<ResearchRunDetail />} />
```

- [ ] **Step 2: Add Research to sidebar navigation**

In `frontend/src/components/layout/AppShell.tsx`:

Add `Search` to the lucide imports (it's already imported — verify, if not add it).

Add a new section in the `navSections` array, after the "Manage" section (before the closing `]`):

```typescript
  {
    label: "Research",
    items: [
      { to: "/research", label: "Research Hub", icon: Search },
    ],
  },
```

- [ ] **Step 3: Add SSE event listeners for research**

In `frontend/src/hooks/useSSE.ts`, add two new event listeners after the existing ones (before `es.onerror`):

```typescript
    es.addEventListener("research_run_complete", (e) => {
      onEventRef.current({ type: "research_run_complete", data: JSON.parse(e.data) });
    });

    es.addEventListener("research_run_failed", (e) => {
      onEventRef.current({ type: "research_run_failed", data: JSON.parse(e.data) });
    });
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/AppShell.tsx frontend/src/hooks/useSSE.ts
git commit -m "feat: register Research routes, sidebar nav, and SSE events"
```

---

## Task 17: Frontend — Workspace Settings Integrations Tab

**Files:**
- Modify: `frontend/src/pages/WorkspaceSettingsPage.tsx`

- [ ] **Step 1: Add Integrations tab**

In `frontend/src/pages/WorkspaceSettingsPage.tsx`:

Add `"integrations"` to the `TABS` array:
```typescript
const TABS = [
  { key: "general", label: "General" },
  { key: "team", label: "Team" },
  { key: "invitations", label: "Invitations" },
  { key: "integrations", label: "Integrations" },
];
```

- [ ] **Step 2: Add IntegrationsTab component**

Add the component before the main `WorkspaceSettingsPage` function:

```tsx
import { researchApi } from "../services/research.service";
// (add this import at the top alongside the existing imports)

interface IntegrationsTabProps {
  workspaceId: string;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

function IntegrationsTab({ workspaceId, showToast }: IntegrationsTabProps) {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    researchApi.getSettings(workspaceId).then((s) => {
      setHasKey(s.hasApifyKey);
      setMaskedKey(s.maskedKey || "");
      setLoading(false);
    });
  }, [workspaceId]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      await researchApi.setApifyKey(workspaceId, apiKey.trim());
      const s = await researchApi.getSettings(workspaceId);
      setHasKey(s.hasApifyKey);
      setMaskedKey(s.maskedKey || "");
      setApiKey("");
      setTestResult(null);
      showToast("Apify API key saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { connected } = await researchApi.testApifyKey(workspaceId);
      setTestResult(connected);
      showToast(connected ? "Connected to Apify!" : "Connection failed — check your key", connected ? "success" : "error");
    } catch (e) {
      setTestResult(false);
      showToast("Connection test failed", "error");
    } finally {
      setTesting(false);
    }
  };

  const handleRemove = async () => {
    try {
      await researchApi.removeApifyKey(workspaceId);
      setHasKey(false);
      setMaskedKey("");
      setTestResult(null);
      showToast("Apify API key removed", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to remove", "error");
    }
  };

  if (loading) return <Spinner size="sm" />;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-zinc-100">Apify</h3>
        <p className="text-sm text-zinc-400 mt-1">
          Connect your Apify account to enable competitor research and enhanced brand scraping.
        </p>
      </div>

      {hasKey ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 font-mono">
              {maskedKey}
            </div>
            <Badge variant="success">Connected</Badge>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handleTest} loading={testing}>
              Test Connection
            </Button>
            <Button size="sm" variant="danger" onClick={handleRemove}>Remove</Button>
          </div>
          {testResult === true && <p className="text-sm text-green-400">Connection successful</p>}
          {testResult === false && <p className="text-sm text-red-400">Connection failed</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="apify_api_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} loading={saving} disabled={!apiKey.trim()}>
              Save Key
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Render the IntegrationsTab in the page**

In the main `WorkspaceSettingsPage` component, find where the tabs are conditionally rendered (e.g., `{activeTab === "general" && ...}`). Add after the last tab section:

```tsx
{activeTab === "integrations" && activeWorkspace && (
  <IntegrationsTab
    workspaceId={activeWorkspace.id}
    showToast={(msg, type) => setToast({ message: msg, type })}
  />
)}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/WorkspaceSettingsPage.tsx
git commit -m "feat: add Integrations tab with Apify API key management"
```

---

## Task 18: Frontend — Generate Page Research Context Banner

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add research context support to GeneratePage**

In `frontend/src/pages/GeneratePage.tsx` (or wherever the generate form is):

Add at the top of the component:
```typescript
import { useSearchParams } from "react-router-dom";

// Inside the component:
const [searchParams, setSearchParams] = useSearchParams();
const researchContext = searchParams.get("researchContext") || "";
const researchTitle = searchParams.get("researchTitle") || "";
```

Add a dismissible banner before the form:
```tsx
{researchContext && (
  <div className="flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 mb-4">
    <div className="flex items-center gap-2 text-sm text-violet-300">
      <Sparkles size={16} />
      <span>Using research as inspiration: {researchTitle || "Research result"}</span>
    </div>
    <button
      onClick={() => {
        searchParams.delete("researchContext");
        searchParams.delete("researchTitle");
        setSearchParams(searchParams);
      }}
      className="text-xs text-violet-400 hover:text-violet-200"
    >
      Dismiss
    </button>
  </div>
)}
```

When submitting the generation form, include the research context in the request body:
```typescript
// In the submit handler, add to the body object:
researchContext: researchContext || undefined,
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: add research context banner and pass-through in Generate page"
```

---

## Task 19: Run All Tests & Final Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && bun test`
Expected: All tests pass (existing + new parser + research service tests).

- [ ] **Step 2: Run backend type check**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Run backend lint**

Run: `cd backend && bunx biome check --write .`
Expected: No lint errors (auto-fixed if any).

- [ ] **Step 5: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No lint errors.

- [ ] **Step 6: Commit any lint fixes**

```bash
git add -A
git commit -m "chore: lint fixes from final verification"
```
