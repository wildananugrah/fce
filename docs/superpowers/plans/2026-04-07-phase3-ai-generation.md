# Phase 3: AI Generation Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement configurable AI providers, background job processing with pgboss, SSE notifications, and generation/campaign/topic endpoints.

**Architecture:** AI providers behind interfaces, pgboss for async job processing, SSE for real-time notifications. Provider selection configurable via .env per use case.

**Tech Stack:** Hono, pgboss, @anthropic-ai/sdk, @google/genai, SSE

---

## Task 1: AI Provider Interfaces

Create the four AI use-case interfaces:

**Files:**
- `backend/src/interfaces/providers/content-generator.interface.ts`
- `backend/src/interfaces/providers/campaign-generator.interface.ts`
- `backend/src/interfaces/providers/topic-generator.interface.ts`
- `backend/src/interfaces/providers/brand-scraper.interface.ts`

Each interface defines what the AI provider must do for that use case. The provider implementations (Anthropic, Gemini) implement ALL four interfaces.

### content-generator.interface.ts
```typescript
export interface ContentGenerationInput {
	brandContext: string;    // serialized brand brain
	productContext?: string; // serialized product brain
	platform: string;
	contentType: string;     // single_image, carousel, video, story
	framework: string;       // AIDA, PAS, BAB
	hookType: string;
	language: string;
	prompt?: string;
}

export interface ContentGenerationOutput {
	contentTitle: string;
	content: {
		hook?: string;
		headline?: string;
		body?: string;
		cta?: string;
		hashtags?: string[];
		slides?: Array<{ headline: string; body: string; visualDirection?: string }>;
		scenes?: Array<{ visualDirection: string; voiceover: string; onScreenText?: string }>;
		frames?: Array<{ visual: string; textOverlay?: string }>;
	};
}

export interface IContentGenerator {
	generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
}
```

### campaign-generator.interface.ts
```typescript
export interface CampaignGenerationInput {
	brandContext: string;
	objective?: string;
	budget?: string;
	channelMix?: string[];
	culturalContext?: string;
}

export interface CampaignGenerationOutput {
	bigIdea: string;
	messagingPillars: Array<{ name: string; description: string }>;
	funnelJourney: any;
	channelRoles: any;
}

export interface ICampaignGenerator {
	generate(input: CampaignGenerationInput): Promise<CampaignGenerationOutput>;
}
```

### topic-generator.interface.ts
```typescript
export interface TopicGenerationInput {
	brandContext: string;
	productContext?: string;
	platform?: string;
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

### brand-scraper.interface.ts
```typescript
export interface BrandScrapingInput {
	url: string;
}

export interface BrandScrapingOutput {
	name: string;
	category?: string;
	personality?: string;
	tone?: string;
	values?: string[];
	vocabulary?: { preferred?: string[]; avoided?: string[] };
}

export interface IBrandScraper {
	scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput>;
}
```

Commit: `git commit -m "feat: add AI provider interfaces for content, campaign, topic, and brand scraping"`

---

## Task 2: Anthropic + Gemini Provider Implementations

Create two provider classes that implement all four interfaces:

**Files:**
- `backend/src/providers/anthropic.provider.ts`
- `backend/src/providers/gemini.provider.ts`

Each provider:
1. Takes API key and model name in constructor
2. Implements IContentGenerator, ICampaignGenerator, ITopicGenerator, IBrandScraper
3. Builds appropriate prompts for each use case
4. Parses AI response as JSON
5. Returns typed output

For Anthropic: use `@anthropic-ai/sdk` — `new Anthropic({ apiKey })`, `client.messages.create(...)`.
For Gemini: use `@google/genai` — `new GoogleGenAI({ apiKey })`, `ai.models.generateContent(...)`.

Install SDK: `bun add @anthropic-ai/sdk @google/genai`

The prompts should instruct the AI to return JSON matching the output interfaces. Include the brand/product context as system context.

Commit: `git commit -m "feat: add Anthropic and Gemini AI provider implementations"`

---

## Task 3: Notification Service (SSE)

**Files:**
- `backend/src/interfaces/services/notification.service.interface.ts`
- `backend/src/services/notification.service.ts`
- `backend/src/routes/sse.route.ts`

### notification.service.interface.ts
```typescript
export interface SSEEvent {
	type: string;
	data: Record<string, unknown>;
}

export interface INotificationService {
	addConnection(userId: string, stream: ReadableStreamDefaultController): void;
	removeConnection(userId: string): void;
	notify(userId: string, event: SSEEvent): void;
}
```

### notification.service.ts
Manages a Map of userId → ReadableStreamDefaultController. When notify is called, writes SSE-formatted data to the user's stream.

### sse.route.ts
```
GET /sse — creates SSE stream, registers with notification service, auth via query param token
```

Uses Hono's streaming response. Verifies JWT from `?token=xxx` query param.

Commit: `git commit -m "feat: add SSE notification service and endpoint"`

---

## Task 4: pgboss Setup + Job Handlers

**Files:**
- `backend/src/jobs/content-generation.job.ts`
- `backend/src/jobs/campaign-generation.job.ts`
- `backend/src/jobs/topic-generation.job.ts`
- `backend/src/jobs/brand-scraping.job.ts`

Each job handler:
1. Receives provider + repository + notification service via constructor
2. Has a `handle(jobData)` method
3. Fetches context from DB (brand brain, product brain)
4. Calls AI provider
5. Saves result to DB
6. Notifies user via notification service

Install: `bun add pg-boss` (already installed)

Note: pgboss is initialized in the composition root with `DATABASE_URL` and started with `await boss.start()`.

Commit: `git commit -m "feat: add pgboss job handlers for AI generation tasks"`

---

## Task 5: Generation, Campaign, Topic Routes + Types

**Files:**
- `backend/src/types/generation.types.ts`
- `backend/src/types/campaign.types.ts`
- `backend/src/types/topic.types.ts`
- `backend/src/interfaces/repositories/generation.repository.interface.ts`
- `backend/src/repositories/generation.repository.ts`
- `backend/src/interfaces/repositories/campaign.repository.interface.ts`
- `backend/src/repositories/campaign.repository.ts`
- `backend/src/interfaces/repositories/topic.repository.interface.ts`
- `backend/src/repositories/topic.repository.ts`
- `backend/src/interfaces/services/generation.service.interface.ts`
- `backend/src/services/generation.service.ts`
- `backend/src/interfaces/services/campaign.service.interface.ts`
- `backend/src/services/campaign.service.ts`
- `backend/src/interfaces/services/topic.service.interface.ts`
- `backend/src/services/topic.service.ts`
- `backend/src/routes/generation.route.ts`
- `backend/src/routes/campaign.route.ts`
- `backend/src/routes/topic.route.ts`
- `backend/src/interfaces/services/library.service.interface.ts`
- `backend/src/services/library.service.ts`
- `backend/src/routes/library.route.ts`

Generation service: creates request record with status "pending", enqueues pgboss job, returns immediately.
Library service: lists outputs, updates output status (approve/reject), adds feedback events.

Commit: `git commit -m "feat: add generation, campaign, topic, and library endpoints"`

---

## Task 6: Wire Phase 3 in Composition Root

Update `backend/src/index.ts`:
1. Initialize pgboss with DATABASE_URL
2. Start pgboss
3. Resolve AI providers based on env config
4. Instantiate notification service
5. Instantiate job handlers
6. Register pgboss workers
7. Instantiate new repositories and services
8. Register new routes (generation, campaign, topic, library under workspace scope)
9. Register SSE route

Provider resolution logic:
```typescript
function resolveProvider(override: string, defaultProvider: string) {
	const name = override || defaultProvider;
	if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
	if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
	throw new Error(`Unknown AI provider: ${name}`);
}

const contentGenerator = resolveProvider(env.aiContentProvider, env.aiProvider);
const campaignGenerator = resolveProvider(env.aiCampaignProvider, env.aiProvider);
const topicGenerator = resolveProvider(env.aiTopicProvider, env.aiProvider);
const brandScraper = resolveProvider(env.aiBrandScraperProvider, env.aiProvider);
```

Commit: `git commit -m "feat: wire AI providers, pgboss, SSE, and generation routes in composition root"`

---

## Task 7: Tests + Verification

- Unit tests for generation service (mock pgboss, verify job enqueue)
- Run all tests
- TypeScript typecheck
- E2E test: submit generation request, verify job is enqueued

Commit: `git commit -m "test: add generation service tests and verify Phase 3"`

---

## Phase 3 Checkpoint

- [x] AI provider interfaces defined (content, campaign, topic, brand-scraper)
- [x] Anthropic provider implementation
- [x] Gemini provider implementation
- [x] Provider selection configurable via .env
- [x] SSE notification service + endpoint
- [x] pgboss initialized and workers registered
- [x] Content generation job handler
- [x] Campaign generation job handler
- [x] Topic generation job handler
- [x] Brand scraping job handler
- [x] POST /api/workspaces/:wid/generations — enqueues job
- [x] GET /api/workspaces/:wid/generations — list requests
- [x] GET /api/workspaces/:wid/generations/:id — get request + outputs
- [x] POST /api/workspaces/:wid/campaigns — create/generate campaign
- [x] GET/PATCH /api/workspaces/:wid/campaigns
- [x] POST /api/workspaces/:wid/topics — create/generate topics
- [x] GET/PATCH /api/workspaces/:wid/topics
- [x] GET /api/workspaces/:wid/library — list outputs
- [x] PATCH /api/workspaces/:wid/library/:id — approve/reject
- [x] POST /api/workspaces/:wid/library/:id/feedback — add feedback
- [x] POST /api/workspaces/:wid/brands/:id/scrape — scrape brand from URL
- [x] All tests pass
- [x] TypeScript typecheck passes
