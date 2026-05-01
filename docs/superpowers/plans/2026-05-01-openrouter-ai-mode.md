# OpenRouter AI Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `AI_MODE=openrouter` deployment flag that routes every AI call (text, chat, image, video) through OpenRouter, with a per-workspace UI for OpenRouter API key + per-generator model overrides. `AI_MODE=legacy` (the default) keeps today's Anthropic+Gemini path.

**Architecture:** Four new provider classes (`OpenRouterProvider` for the 5 text generators, plus dedicated chat/image/video providers) implement the same interfaces as today's Anthropic/Gemini providers. `AiProviderFactory` gains a `mode` parameter at construction; in `openrouter` mode it returns OpenRouter providers and ignores the workspace's Anthropic/Gemini fields. A new `GET /api/system/ai-mode` lets the frontend render mode-aware UI.

**Tech Stack:** Bun + Hono + Prisma 7. OpenRouter via plain `fetch()` (no new SDK). React 19 + Vite frontend.

**Spec:** [docs/superpowers/specs/2026-05-01-openrouter-ai-mode-design.md](docs/superpowers/specs/2026-05-01-openrouter-ai-mode-design.md)

---

## Pre-flight

- [ ] **Step 0: Confirm clean working tree on a feature branch**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status
git checkout -b feat/openrouter-ai-mode
```

Pre-existing dirty files (`.claude/settings.local.json`, `backend/Makefile`, `docs/notes.md`) follow the branch and stay unstaged throughout.

---

## File Plan

### Backend — new files

- `backend/src/providers/openrouter.provider.ts` — 5 text-gen interfaces in one class, fetch-based.
- `backend/src/providers/openrouter-chat.provider.ts` — `IChatAiProvider`, streaming via `fetch` + ReadableStream.
- `backend/src/providers/openrouter-image.provider.ts` — image gen via OpenRouter chat-completions with image-capable model.
- `backend/src/providers/openrouter-video.provider.ts` — video analysis: upload to MinIO → signed URL → OpenRouter.
- `backend/src/routes/system.route.ts` — `GET /api/system/ai-mode`.
- `frontend/src/hooks/useOpenRouterModels.ts` — session-cached fetch of OpenRouter model list.
- `frontend/src/components/settings/OpenRouterModelPicker.tsx` — combobox with category filter.
- `frontend/src/contexts/SystemContext.tsx` — exposes `aiMode` to the app.
- `backend/tests/providers/openrouter.provider.test.ts`
- `backend/tests/providers/openrouter-chat.provider.test.ts`
- `backend/tests/providers/openrouter-image.provider.test.ts`
- `backend/tests/providers/openrouter-video.provider.test.ts`
- `backend/tests/routes/system.route.test.ts`

### Backend — modified files

- `backend/prisma/schema.prisma` — 9 nullable columns on `WorkspaceSetting`.
- `backend/src/repositories/workspace-setting.repository.ts` — `AiSettingsPatch` type + `findByWorkspace` cover new columns.
- `backend/src/services/ai-provider-factory.service.ts` — `mode` constructor param, branching, OpenRouter env defaults, renamed image/video methods.
- `backend/src/index.ts` — read `AI_MODE`, pass to factory; mount `/api/system` route.
- `backend/src/services/scene-image.service.ts` — call renamed `getImageProvider`.
- `backend/src/services/competitor-pipeline.service.ts` — call renamed `getVideoAnalyzer`.
- `backend/src/routes/workspace-ai-settings.route.ts` — accept new OpenRouter fields in PUT, add `/test-openrouter` endpoint.
- `.env.example` — `AI_MODE` + `OPENROUTER_*` keys.
- `backend/tests/services/ai-provider-factory.service.test.ts` — extend with mode-branching cases.

### Frontend — modified files

- `frontend/src/main.tsx` — wrap app in `<SystemProvider>`.
- `frontend/src/components/workspace-settings/AiProvidersSection.tsx` — mode-aware rendering with OpenRouter card.
- `frontend/src/services/api.ts` — no change; existing `api()` helper covers the new endpoints.

### Docs

- `CLAUDE.md` — append paragraph to "Per-Workspace AI Provider Resolution" describing `AI_MODE`.

---

## Task 1: Schema + repository + env config

**Files:**
- Modify: `backend/prisma/schema.prisma:710-737` (add 9 columns to `WorkspaceSetting`)
- Modify: `backend/src/repositories/workspace-setting.repository.ts` (extend `AiSettingsPatch` and any explicit field lists)
- Modify: `.env.example` (append `AI_MODE` + `OPENROUTER_*`)
- Run: `bunx prisma db push && bunx prisma generate`

This task is the data foundation. After this commit, the Prisma client knows about the new fields, the repo can read/write them, and the env example documents them. No behavior change yet — just plumbing.

- [ ] **Step 1: Add the 9 nullable columns to `backend/prisma/schema.prisma`**

Find the `WorkspaceSetting` model at lines 710–737 and replace it with:

```prisma
model WorkspaceSetting {
  id          String   @id @default(uuid())
  workspaceId String   @unique @map("workspace_id")
  apifyApiKey String?  @map("apify_api_key")

  // AI provider selection — null means "inherit env default".
  aiProvider              String? @map("ai_provider")               // "anthropic" | "gemini"
  aiContentProvider       String? @map("ai_content_provider")
  aiCampaignProvider      String? @map("ai_campaign_provider")
  aiTopicProvider         String? @map("ai_topic_provider")
  aiBrandScraperProvider  String? @map("ai_brand_scraper_provider")
  aiChatProvider          String? @map("ai_chat_provider")

  // AI provider credentials — plaintext for now (matches Apify key pattern;
  // encryption at rest is a separate initiative).
  anthropicApiKey  String? @map("anthropic_api_key")
  anthropicModel   String? @map("anthropic_model")
  geminiApiKey     String? @map("gemini_api_key")
  geminiModel      String? @map("gemini_model")
  geminiImageModel String? @map("gemini_image_model")

  // OpenRouter mode (used when AI_MODE=openrouter). Per-generator model fields
  // fall back to openrouterModel when blank.
  openrouterApiKey            String? @map("openrouter_api_key")
  openrouterModel             String? @map("openrouter_model")
  openrouterContentModel      String? @map("openrouter_content_model")
  openrouterCampaignModel     String? @map("openrouter_campaign_model")
  openrouterTopicModel        String? @map("openrouter_topic_model")
  openrouterBrandScraperModel String? @map("openrouter_brand_scraper_model")
  openrouterChatModel         String? @map("openrouter_chat_model")
  openrouterImageModel        String? @map("openrouter_image_model")
  openrouterVideoModel        String? @map("openrouter_video_model")

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@map("workspace_settings")
}
```

- [ ] **Step 2: Push schema and regenerate Prisma client**

```bash
cd backend
set -a && source .env && set +a
bunx prisma db push
bunx prisma generate
```

Expected: "Your database is now in sync with your Prisma schema." and "Generated Prisma Client". 9 new columns added to `workspace_settings`.

- [ ] **Step 3: Extend `WorkspaceSettingRepository` patch type**

Read `backend/src/repositories/workspace-setting.repository.ts`. Find the `AiSettingsPatch` type definition. Add the 9 new fields:

```ts
openrouterApiKey?: string | null;
openrouterModel?: string | null;
openrouterContentModel?: string | null;
openrouterCampaignModel?: string | null;
openrouterTopicModel?: string | null;
openrouterBrandScraperModel?: string | null;
openrouterChatModel?: string | null;
openrouterImageModel?: string | null;
openrouterVideoModel?: string | null;
```

If the repo's `upsertAiSettings` method or `findByWorkspace` method has explicit field lists rather than a generic spread, add the new fields there too. (Most likely the generic `data: patch` spread works as-is.)

- [ ] **Step 4: Append `AI_MODE` + OpenRouter env keys to `.env.example`**

Find the AI section near the bottom of `.env.example` and append:

```dotenv
# AI provider mode. "legacy" = current Anthropic+Gemini setup. "openrouter" =
# all generators (text, chat, image, video) routed through OpenRouter.
AI_MODE=legacy

# Used only when AI_MODE=openrouter. Per-workspace overrides land in
# WorkspaceSetting.openrouter*; these env values are the deployment fallback.
OPENROUTER_API_KEY=
OPENROUTER_MODEL=                    # default for all generators if unset below
OPENROUTER_CONTENT_MODEL=
OPENROUTER_CAMPAIGN_MODEL=
OPENROUTER_TOPIC_MODEL=
OPENROUTER_BRAND_SCRAPER_MODEL=
OPENROUTER_CHAT_MODEL=
OPENROUTER_IMAGE_MODEL=              # must be image-capable
OPENROUTER_VIDEO_MODEL=              # must accept video URL input
```

- [ ] **Step 5: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: pre-existing errors only (8 in unrelated files: `brand-scraping.job.ts`, `content-generation.job.ts`, `document-extraction.job.ts`, `dashboard.route.ts`, `generation.service.ts`, `pdf-extractor.ts`). Zero new errors.

- [ ] **Step 6: Run full backend tests**

```bash
cd backend && bun test
```

Expected: all pass except the pre-existing chat.service.test.ts failure.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma \
        backend/src/repositories/workspace-setting.repository.ts \
        .env.example
git commit -m "feat(backend): add openrouter columns + AI_MODE env

Schema gains 9 nullable openrouter* columns on WorkspaceSetting.
WorkspaceSettingRepository.AiSettingsPatch covers the new fields.
.env.example documents AI_MODE and OPENROUTER_* keys. No behavior
change yet — providers wired in later commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: `OpenRouterProvider` (text generation, 5 interfaces)

**Files:**
- Create: `backend/src/providers/openrouter.provider.ts`
- Create: `backend/tests/providers/openrouter.provider.test.ts`

The class implements `IContentGenerator`, `ICampaignGenerator`, `ITopicGenerator`, `IBrandScraper`, `ICampaignBriefSummarizer` — same shape as `AnthropicProvider` at `backend/src/providers/anthropic.provider.ts`. Reuses the shared prompt builders from `backend/src/utils/prompt-builder.ts` so prompt logic stays consistent across providers. Uses plain `fetch()` against `https://openrouter.ai/api/v1/chat/completions`.

The implementer should read `backend/src/providers/anthropic.provider.ts` for full reference — every public method has the same input/output types and uses the same prompt builder. Differences:
- Replace `this.client.messages.create({...})` with `fetch("https://openrouter.ai/api/v1/chat/completions", {...})`.
- Image references use OpenAI format `{type: "image_url", image_url: {url}}` (Anthropic uses `{type: "image", source: {type: "url", url}}`).
- Response shape is `{choices: [{message: {content}}], usage: {prompt_tokens, completion_tokens}}` rather than Anthropic's `{content: [{type, text}], usage: {input_tokens, output_tokens}}`.

Do NOT inject `tonePreset` or `visualStyle` into the prompt — that's a separate spec gap consistent with the legacy providers.

- [ ] **Step 1: Write the test file**

Create `backend/tests/providers/openrouter.provider.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { OpenRouterProvider } from "../../src/providers/openrouter.provider";

function mockFetchOnce(responseBody: unknown, status = 200) {
	return mock(async (_url: string, _init?: RequestInit) => {
		return new Response(JSON.stringify(responseBody), { status });
	});
}

describe("OpenRouterProvider", () => {
	it("generateContent: calls /chat/completions with the configured model and parses JSON response", async () => {
		const fakeResponse = {
			choices: [
				{ message: { content: '{"caption":"hello","hashtags":["#a"],"sections":[]}' } },
			],
			usage: { prompt_tokens: 10, completion_tokens: 20 },
		};
		const fetchMock = mockFetchOnce(fakeResponse);
		const provider = new OpenRouterProvider("api-key", "anthropic/claude-sonnet-4.5", fetchMock as any);

		const result = await provider.generate({
			brandContext: { name: "B", description: "d", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: [],
		} as any);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.model).toBe("anthropic/claude-sonnet-4.5");
		expect(body.messages).toBeArray();
		expect(provider.lastUsage).toEqual({ inputTokens: 10, outputTokens: 20 });
		expect(result).toEqual({ caption: "hello", hashtags: ["#a"], sections: [] });
	});

	it("generateContent: throws a descriptive error when response is not JSON", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: "not json at all" } }],
			usage: { prompt_tokens: 1, completion_tokens: 1 },
		});
		const provider = new OpenRouterProvider("api-key", "model", fetchMock as any);

		await expect(
			provider.generate({
				brandContext: { name: "B", description: "d", language: "en" },
				productContext: null,
				platform: "instagram",
				contentType: "post",
				framework: "aida",
				hookType: "curiosity-hook",
				objective: null,
				referenceImages: [],
			} as any),
		).rejects.toThrow(/OpenRouterProvider: Failed to parse content generation response/);
	});

	it("forwards Authorization header with bearer api key", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: '{"caption":"","hashtags":[],"sections":[]}' } }],
			usage: { prompt_tokens: 0, completion_tokens: 0 },
		});
		const provider = new OpenRouterProvider("sk-or-v1-secret", "model", fetchMock as any);
		await provider.generate({
			brandContext: { name: "B", description: "", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: [],
		} as any);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer sk-or-v1-secret");
	});

	it("includes reference images using OpenAI-compatible image_url format", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: '{"caption":"","hashtags":[],"sections":[]}' } }],
			usage: { prompt_tokens: 0, completion_tokens: 0 },
		});
		const provider = new OpenRouterProvider("k", "model", fetchMock as any);
		await provider.generate({
			brandContext: { name: "B", description: "", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
		} as any);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(init.body as string);
		const userContent = body.messages.find((m: any) => m.role === "user").content;
		expect(userContent).toBeArray();
		const imageParts = userContent.filter((p: any) => p.type === "image_url");
		expect(imageParts).toHaveLength(2);
		expect(imageParts[0].image_url.url).toBe("https://example.com/a.jpg");
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && bun test tests/providers/openrouter.provider.test.ts
```

Expected: FAIL with "Cannot find module" (file doesn't exist yet).

- [ ] **Step 3: Create `backend/src/providers/openrouter.provider.ts`**

```ts
import {
	generatorTuning,
	resolveThinkingBudget,
	type GeneratorTuning,
} from "../config/generator-tuning";
import type {
	BrandScrapingInput,
	BrandScrapingOutput,
	IBrandScraper,
} from "../interfaces/providers/brand-scraper.interface";
import type {
	BriefSummaryInput,
	BriefSummaryOutput,
	ICampaignBriefSummarizer,
} from "../interfaces/providers/campaign-brief-summarizer.interface";
import type {
	CampaignGenerationInput,
	CampaignGenerationOutput,
	ICampaignGenerator,
} from "../interfaces/providers/campaign-generator.interface";
import type {
	ContentGenerationInput,
	ContentGenerationOutput,
	IContentGenerator,
} from "../interfaces/providers/content-generator.interface";
import type {
	ITopicGenerator,
	TopicGenerationInput,
	TopicGenerationOutput,
} from "../interfaces/providers/topic-generator.interface";
import {
	buildBriefSummaryPrompt,
	buildCampaignGenerationPrompt,
	buildContentGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../utils/prompt-builder";
import { extractOgImage, fetchMultipleUrls, fetchUrlContent } from "../utils/url-fetcher";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

interface ChatCompletionMessage {
	role: "system" | "user" | "assistant";
	content: string | Array<
		| { type: "text"; text: string }
		| { type: "image_url"; image_url: { url: string } }
	>;
}

interface ChatCompletionResponse {
	choices: Array<{ message: { content: string } }>;
	usage: { prompt_tokens: number; completion_tokens: number };
}

function parseJsonResponse(text: string): any {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) {
		cleaned = cleaned.slice("```json".length);
	} else if (cleaned.startsWith("```")) {
		cleaned = cleaned.slice("```".length);
	}
	if (cleaned.endsWith("```")) {
		cleaned = cleaned.slice(0, -"```".length);
	}
	return JSON.parse(cleaned.trim());
}

function languageDirective(language?: string): string {
	const normalized = (language ?? "indonesian").toLowerCase();
	if (normalized === "english" || normalized === "en") {
		return "Write all extracted text fields in English.";
	}
	return "Write all extracted text fields in Bahasa Indonesia.";
}

export class OpenRouterProvider
	implements IContentGenerator, ICampaignGenerator, ICampaignBriefSummarizer, ITopicGenerator, IBrandScraper
{
	public lastUsage: { inputTokens: number; outputTokens: number } | null = null;

	constructor(
		private apiKey: string,
		private model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	private async callOpenRouter(
		systemPrompt: string,
		userContent: ChatCompletionMessage["content"],
		tuning: GeneratorTuning,
	): Promise<string> {
		const messages: ChatCompletionMessage[] = [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userContent },
		];

		const body: Record<string, unknown> = {
			model: this.model,
			messages,
			max_tokens: tuning.maxOutputTokens,
			temperature: tuning.temperature,
		};

		const reasoningBudget = resolveThinkingBudget(tuning);
		if (reasoningBudget > 0) {
			// OpenRouter exposes per-model reasoning controls under `reasoning`.
			// `max_tokens` budget is the most portable shape.
			body.reasoning = { max_tokens: reasoningBudget };
			body.max_tokens = tuning.maxOutputTokens + reasoningBudget;
		}

		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(`OpenRouterProvider: HTTP ${response.status} - ${errText}`);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		this.lastUsage = {
			inputTokens: json.usage.prompt_tokens,
			outputTokens: json.usage.completion_tokens,
		};
		return json.choices[0]?.message?.content ?? "";
	}

	async generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
	async generate(input: CampaignGenerationInput): Promise<CampaignGenerationOutput>;
	async generate(input: TopicGenerationInput): Promise<TopicGenerationOutput>;
	async generate(
		input: ContentGenerationInput | CampaignGenerationInput | TopicGenerationInput,
	): Promise<ContentGenerationOutput | CampaignGenerationOutput | TopicGenerationOutput> {
		if ("platform" in input && "contentType" in input) {
			return this.generateContent(input as ContentGenerationInput);
		} else if (
			"channelMix" in input ||
			("brandContext" in input && !("count" in input) && !("platform" in input))
		) {
			return this.generateCampaign(input as CampaignGenerationInput);
		} else {
			return this.generateTopics(input as TopicGenerationInput);
		}
	}

	private async generateContent(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
		const { systemPrompt, userPrompt } = buildContentGenerationPrompt(input);

		const userContent: ChatCompletionMessage["content"] = input.referenceImages?.length
			? [
					...input.referenceImages.map((url) => ({
						type: "image_url" as const,
						image_url: { url },
					})),
					{ type: "text" as const, text: userPrompt },
				]
			: userPrompt;

		const text = await this.callOpenRouter(systemPrompt, userContent, generatorTuning.content);
		try {
			return parseJsonResponse(text) as ContentGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateCampaign(
		input: CampaignGenerationInput,
	): Promise<CampaignGenerationOutput> {
		const { systemPrompt, userPrompt } = buildCampaignGenerationPrompt(input);
		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.campaign);
		try {
			return parseJsonResponse(text) as CampaignGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse campaign generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
		const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);
		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.topic);
		try {
			return parseJsonResponse(text) as TopicGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
			);
		}
	}

	async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
		const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);
		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.campaign);
		try {
			return parseJsonResponse(text) as BriefSummaryOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
			);
		}
	}

	async scrapeProduct(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		if (!input.urls || input.urls.length === 0) {
			throw new Error("OpenRouterProvider: at least one URL is required for product scraping");
		}

		const fetched = await fetchMultipleUrls(input.urls);
		const ogImage = await extractOgImage(input.urls[0]).catch(() => null);
		const language = input.language ?? "indonesian";
		const directive = languageDirective(language);

		const systemPrompt =
			"You are a brand researcher extracting structured product information from web pages. " +
			directive +
			" Respond ONLY with valid JSON matching the requested schema.";

		const userPrompt = [
			"Extract product information from the following web pages:",
			...fetched.map((f, i) => `--- Page ${i + 1} (${f.url}) ---\n${f.content}`),
			"",
			input.skillContext ? `Skill context:\n${input.skillContext}` : "",
			"Return JSON with: { name, description, category, keyBenefits[], targetAudience, priceRange, productUrl, imageUrl }",
		]
			.filter(Boolean)
			.join("\n\n");

		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.brandScraper);
		try {
			const parsed = parseJsonResponse(text) as BrandScrapingOutput;
			if (ogImage && !parsed.imageUrl) {
				parsed.imageUrl = ogImage;
			}
			return parsed;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
			);
		}
	}

	async scrapeBrand(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		// Same pipeline as scrapeProduct — they share an interface today.
		return this.scrapeProduct(input);
	}
}
```

If any of the prompt-builder calls expect different inputs than `OpenRouterProvider` provides, adjust by reading `backend/src/providers/anthropic.provider.ts` for the canonical pattern. The `BrandScrapingInput`/`BrandScrapingOutput` shapes may differ from what's shown — read the interface file before finalizing.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && bun test tests/providers/openrouter.provider.test.ts
```

Expected: 4 pass / 0 fail.

- [ ] **Step 5: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only. No new errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/openrouter.provider.ts \
        backend/tests/providers/openrouter.provider.test.ts
git commit -m "feat(backend): add OpenRouterProvider for text generation

Implements the 5 text-gen interfaces (Content/Campaign/Topic/
BrandScraper/BriefSummarizer) using plain fetch against
https://openrouter.ai/api/v1/chat/completions. Reuses the shared
prompt builders. 4 tests cover happy path, parse-failure path, auth
header, and reference-image inclusion in OpenAI-compatible format.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `OpenRouterChatProvider`

**Files:**
- Create: `backend/src/providers/openrouter-chat.provider.ts`
- Create: `backend/tests/providers/openrouter-chat.provider.test.ts`

Mirrors `backend/src/providers/anthropic-chat.provider.ts` (77 lines). Streaming via SSE — OpenRouter's chat-completions endpoint emits OpenAI-style `data:` events when `stream: true`.

- [ ] **Step 1: Read the existing chat-provider interface**

```bash
cat /Users/bellinnn/Documents/projects/fce/backend/src/interfaces/providers/chat-ai.provider.interface.ts
```

Note the method signatures `OpenRouterChatProvider` must implement.

- [ ] **Step 2: Write the test file**

Create `backend/tests/providers/openrouter-chat.provider.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { OpenRouterChatProvider } from "../../src/providers/openrouter-chat.provider";

function streamingResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const c of chunks) {
				controller.enqueue(encoder.encode(c));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("OpenRouterChatProvider", () => {
	it("streamChat: emits tokens in order from SSE events", async () => {
		const sse = [
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
			'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
			"data: [DONE]\n\n",
		];
		const fetchMock = mock(async () => streamingResponse(sse));
		const provider = new OpenRouterChatProvider("k", "model", fetchMock as any);

		const tokens: string[] = [];
		const result = await provider.streamChat(
			[{ role: "user", content: "hi" }],
			{ onToken: (t) => tokens.push(t) },
		);

		expect(tokens).toEqual(["Hello", " ", "world"]);
		expect(result.text).toBe("Hello world");
	});

	it("forwards Authorization header and stream:true", async () => {
		const fetchMock = mock(async () =>
			streamingResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', "data: [DONE]\n\n"]),
		);
		const provider = new OpenRouterChatProvider("sk-secret", "model", fetchMock as any);
		await provider.streamChat([{ role: "user", content: "hi" }], { onToken: () => {} });

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer sk-secret");
		const body = JSON.parse(init.body as string);
		expect(body.stream).toBe(true);
		expect(body.model).toBe("model");
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && bun test tests/providers/openrouter-chat.provider.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Create `backend/src/providers/openrouter-chat.provider.ts`**

```ts
import type { IChatAiProvider, ChatMessage, StreamChatOptions, StreamChatResult } from "../interfaces/providers/chat-ai.provider.interface";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export class OpenRouterChatProvider implements IChatAiProvider {
	constructor(
		private apiKey: string,
		private model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	async streamChat(
		messages: ChatMessage[],
		options: StreamChatOptions,
	): Promise<StreamChatResult> {
		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages,
				stream: true,
			}),
		});

		if (!response.ok || !response.body) {
			throw new Error(`OpenRouterChatProvider: HTTP ${response.status}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let fullText = "";

		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let newlineIdx: number;
			while ((newlineIdx = buffer.indexOf("\n\n")) >= 0) {
				const event = buffer.slice(0, newlineIdx);
				buffer = buffer.slice(newlineIdx + 2);
				const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
				if (!dataLine) continue;
				const payload = dataLine.slice("data: ".length);
				if (payload === "[DONE]") continue;
				try {
					const parsed = JSON.parse(payload);
					const token: string = parsed.choices?.[0]?.delta?.content ?? "";
					if (token) {
						fullText += token;
						options.onToken(token);
					}
				} catch {
					// Tolerate keep-alive / heartbeat / non-JSON lines.
				}
			}
		}

		return { text: fullText };
	}
}
```

If `IChatAiProvider`'s actual method shape differs (e.g. different option names), adjust to match.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && bun test tests/providers/openrouter-chat.provider.test.ts
```

Expected: 2 pass / 0 fail.

- [ ] **Step 6: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/openrouter-chat.provider.ts \
        backend/tests/providers/openrouter-chat.provider.test.ts
git commit -m "feat(backend): add OpenRouterChatProvider for streaming chat

Implements IChatAiProvider with SSE streaming against OpenRouter's
chat-completions endpoint. Tests cover token-order delivery and
Authorization header.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `OpenRouterImageProvider`

**Files:**
- Create: `backend/src/providers/openrouter-image.provider.ts`
- Create: `backend/tests/providers/openrouter-image.provider.test.ts`

Mirrors the public shape of `backend/src/providers/gemini-image.provider.ts` (53 lines). Calls OpenRouter chat-completions with an image-capable model and parses returned images.

OpenRouter image-capable models return image data in the `message.images` array as `{type: "image_url", image_url: {url: "data:image/png;base64,..."}}` (or hosted URLs).

- [ ] **Step 1: Read the existing image provider's interface**

```bash
head -60 /Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini-image.provider.ts
```

Note the method signature(s) the new provider must match. Pay attention to whether scene image gen returns bytes, a URL, or both.

- [ ] **Step 2: Write the test file**

Create `backend/tests/providers/openrouter-image.provider.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { OpenRouterImageProvider } from "../../src/providers/openrouter-image.provider";

describe("OpenRouterImageProvider", () => {
	it("generateImage: extracts image_url from response", async () => {
		const fakeResponse = {
			choices: [
				{
					message: {
						content: "Here is the image",
						images: [
							{ type: "image_url", image_url: { url: "https://cdn.openrouter.ai/img/abc.png" } },
						],
					},
				},
			],
			usage: { prompt_tokens: 5, completion_tokens: 0 },
		};
		const fetchMock = mock(async () => new Response(JSON.stringify(fakeResponse)));
		const provider = new OpenRouterImageProvider("key", "google/gemini-2.5-flash-image-preview", fetchMock as any);

		const result = await provider.generateImage({
			prompt: "a cat in a hat",
			referenceImageUrl: null,
		} as any);

		expect(result.imageUrl).toBe("https://cdn.openrouter.ai/img/abc.png");
	});

	it("generateImage: includes reference image in user content as image_url", async () => {
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								images: [{ type: "image_url", image_url: { url: "https://cdn.openrouter.ai/img/x.png" } }],
							},
						},
					],
					usage: { prompt_tokens: 0, completion_tokens: 0 },
				}),
			),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await provider.generateImage({
			prompt: "stylize",
			referenceImageUrl: "https://example.com/ref.jpg",
		} as any);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(init.body as string);
		const userContent = body.messages.find((m: any) => m.role === "user").content;
		const refPart = userContent.find((p: any) => p.type === "image_url");
		expect(refPart.image_url.url).toBe("https://example.com/ref.jpg");
	});

	it("generateImage: throws when response has no images", async () => {
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "no image" } }],
					usage: { prompt_tokens: 0, completion_tokens: 0 },
				}),
			),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await expect(
			provider.generateImage({ prompt: "p", referenceImageUrl: null } as any),
		).rejects.toThrow(/no image/i);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && bun test tests/providers/openrouter-image.provider.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Create `backend/src/providers/openrouter-image.provider.ts`**

Match the public method signature observed in `gemini-image.provider.ts` (Step 1). Skeleton:

```ts
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

interface ImageGenInput {
	prompt: string;
	referenceImageUrl: string | null;
}

interface ImageGenOutput {
	imageUrl: string;
}

export class OpenRouterImageProvider {
	constructor(
		private apiKey: string,
		private model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	async generateImage(input: ImageGenInput): Promise<ImageGenOutput> {
		const userContent: Array<
			| { type: "text"; text: string }
			| { type: "image_url"; image_url: { url: string } }
		> = [];
		if (input.referenceImageUrl) {
			userContent.push({ type: "image_url", image_url: { url: input.referenceImageUrl } });
		}
		userContent.push({ type: "text", text: input.prompt });

		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: [{ role: "user", content: userContent }],
				modalities: ["image", "text"],
			}),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(`OpenRouterImageProvider: HTTP ${response.status} - ${errText}`);
		}

		const json = (await response.json()) as {
			choices: Array<{ message: { content?: string; images?: Array<{ image_url: { url: string } }> } }>;
		};

		const url = json.choices[0]?.message?.images?.[0]?.image_url?.url;
		if (!url) {
			throw new Error("OpenRouterImageProvider: response contained no image");
		}
		return { imageUrl: url };
	}
}
```

If the existing `GeminiImageProvider` returns a different shape (e.g. base64 bytes alongside URL, or expects an additional field), match that shape exactly so the upstream call site (`SceneImageService`) needs no changes.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && bun test tests/providers/openrouter-image.provider.test.ts
```

Expected: 3 pass / 0 fail.

- [ ] **Step 6: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/openrouter-image.provider.ts \
        backend/tests/providers/openrouter-image.provider.test.ts
git commit -m "feat(backend): add OpenRouterImageProvider

Image generation via OpenRouter chat-completions with image-capable
models (e.g. google/gemini-2.5-flash-image-preview). Returns the
generated image URL extracted from message.images[0]. Tests cover
happy path, reference image forwarding, and missing-image error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `OpenRouterVideoAnalyzerProvider`

**Files:**
- Create: `backend/src/providers/openrouter-video.provider.ts`
- Create: `backend/tests/providers/openrouter-video.provider.test.ts`

Mirrors the public shape of `backend/src/providers/gemini-video.provider.ts` (244 lines). The key difference: instead of uploading via Gemini's Files API, this provider uploads bytes to MinIO via the existing `MinioStorageProvider`, generates a signed URL, and passes that URL to OpenRouter as `{type: "video_url", video_url: {url}}`.

- [ ] **Step 1: Read the existing video provider's interface and the MinIO provider's API**

```bash
head -80 /Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini-video.provider.ts
grep -n "uploadFile\|getPresignedUrl\|signedUrl\|publicUrl" /Users/bellinnn/Documents/projects/fce/backend/src/providers/minio.provider.ts | head -20
```

Note: the public method name(s), input shape (video bytes? URL? both?), and output shape (the structured analysis). Note which MinIO method generates a signed URL.

- [ ] **Step 2: Write the test file**

Create `backend/tests/providers/openrouter-video.provider.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import { OpenRouterVideoAnalyzerProvider } from "../../src/providers/openrouter-video.provider";

function makeMockMinio(signedUrl: string) {
	return {
		uploadBytes: mock(async (_key: string, _bytes: Uint8Array, _contentType: string) => {
			return { key: _key };
		}),
		getSignedUrl: mock(async (_key: string, _ttlSeconds: number) => signedUrl),
	} as any;
}

describe("OpenRouterVideoAnalyzerProvider", () => {
	it("analyzeVideo: uploads to MinIO, gets signed URL, sends as video_url to OpenRouter", async () => {
		const minio = makeMockMinio("https://minio.example.com/signed/video.mp4?sig=abc");
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: '{"summary":"a cat","tags":["cat"]}' } }],
					usage: { prompt_tokens: 100, completion_tokens: 30 },
				}),
			),
		);
		const provider = new OpenRouterVideoAnalyzerProvider(
			"key",
			"google/gemini-2.5-flash",
			minio,
			fetchMock as any,
		);

		const result = await provider.analyzeVideo({
			videoBytes: new Uint8Array([1, 2, 3, 4]),
			mimeType: "video/mp4",
			prompt: "describe this video",
		} as any);

		expect(minio.uploadBytes).toHaveBeenCalledTimes(1);
		expect(minio.getSignedUrl).toHaveBeenCalledTimes(1);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(init.body as string);
		const userContent = body.messages.find((m: any) => m.role === "user").content;
		const videoPart = userContent.find((p: any) => p.type === "video_url");
		expect(videoPart.video_url.url).toBe("https://minio.example.com/signed/video.mp4?sig=abc");

		expect(result).toEqual({ summary: "a cat", tags: ["cat"] });
	});

	it("analyzeVideo: throws when response is not parseable JSON", async () => {
		const minio = makeMockMinio("https://minio.example.com/x");
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "not json" } }],
					usage: { prompt_tokens: 0, completion_tokens: 0 },
				}),
			),
		);
		const provider = new OpenRouterVideoAnalyzerProvider(
			"k",
			"m",
			minio,
			fetchMock as any,
		);
		await expect(
			provider.analyzeVideo({
				videoBytes: new Uint8Array([1]),
				mimeType: "video/mp4",
				prompt: "p",
			} as any),
		).rejects.toThrow(/parse/i);
	});
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd backend && bun test tests/providers/openrouter-video.provider.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 4: Create `backend/src/providers/openrouter-video.provider.ts`**

```ts
import type { MinioStorageProvider } from "./minio.provider";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const SIGNED_URL_TTL_SECONDS = 60 * 30; // 30 minutes — enough for OpenRouter to fetch.

interface VideoAnalysisInput {
	videoBytes: Uint8Array;
	mimeType: string;
	prompt: string;
}

function parseJsonResponse(text: string): any {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) cleaned = cleaned.slice("```json".length);
	else if (cleaned.startsWith("```")) cleaned = cleaned.slice("```".length);
	if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -"```".length);
	return JSON.parse(cleaned.trim());
}

export class OpenRouterVideoAnalyzerProvider {
	constructor(
		private apiKey: string,
		private model: string,
		private minio: MinioStorageProvider,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	async analyzeVideo(input: VideoAnalysisInput): Promise<any> {
		const ext = input.mimeType.split("/")[1] || "mp4";
		const key = `openrouter-video-temp/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
		await this.minio.uploadBytes(key, input.videoBytes, input.mimeType);
		const signedUrl = await this.minio.getSignedUrl(key, SIGNED_URL_TTL_SECONDS);

		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: [
					{
						role: "user",
						content: [
							{ type: "video_url", video_url: { url: signedUrl } },
							{ type: "text", text: input.prompt },
						],
					},
				],
			}),
		});

		if (!response.ok) {
			const errText = await response.text().catch(() => "");
			throw new Error(`OpenRouterVideoAnalyzerProvider: HTTP ${response.status} - ${errText}`);
		}

		const json = (await response.json()) as {
			choices: Array<{ message: { content: string } }>;
			usage: { prompt_tokens: number; completion_tokens: number };
		};
		const text = json.choices[0]?.message?.content ?? "";
		try {
			return parseJsonResponse(text);
		} catch (_err) {
			throw new Error(
				`OpenRouterVideoAnalyzerProvider: Failed to parse video analysis response. Raw: ${text}`,
			);
		}
	}
}
```

If `MinioStorageProvider` doesn't have `uploadBytes` and `getSignedUrl` methods with these exact names, look at `gemini-video.provider.ts` for the actual MinIO call patterns and adapt.

If the existing `GeminiVideoAnalyzerProvider` exposes additional methods or returns a more structured type, mirror that shape exactly.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && bun test tests/providers/openrouter-video.provider.test.ts
```

Expected: 2 pass / 0 fail.

- [ ] **Step 6: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/openrouter-video.provider.ts \
        backend/tests/providers/openrouter-video.provider.test.ts
git commit -m "feat(backend): add OpenRouterVideoAnalyzerProvider

Uploads video bytes to MinIO, generates a signed URL with a 30-minute
TTL, and sends the URL to OpenRouter as video_url. Tests cover happy
path (MinIO upload + signed URL forwarded correctly) and parse-failure.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Factory mode branching + image/video method renames

**Files:**
- Modify: `backend/src/services/ai-provider-factory.service.ts`
- Modify: `backend/src/services/scene-image.service.ts` (call site rename)
- Modify: `backend/src/services/competitor-pipeline.service.ts` (call site rename)
- Modify: `backend/tests/services/ai-provider-factory.service.test.ts` (extend with mode-branching cases)

This is the core wiring task. The factory gains a `mode` constructor parameter; in `openrouter` mode it returns OpenRouter providers regardless of the workspace's `aiProvider` field. The image/video provider getters get renamed to mode-aware names.

- [ ] **Step 1: Extend `EnvAiDefaults` and `ResolvedAiSettings` types**

In `backend/src/services/ai-provider-factory.service.ts`, find the `EnvAiDefaults` interface and `ResolvedAiSettings` interface. Add OpenRouter fields:

```ts
export type ProviderName = "anthropic" | "gemini" | "openrouter";
export type AiMode = "openrouter" | "legacy";

export interface ResolvedAiSettings {
	mode: AiMode;
	providers: {
		default: ProviderName;
		content: ProviderName;
		campaign: ProviderName;
		topic: ProviderName;
		brandScraper: ProviderName;
		chat: ProviderName;
	};
	anthropic: { apiKey: string; model: string };
	gemini: { apiKey: string; model: string; imageModel: string };
	openrouter: {
		apiKey: string;
		defaultModel: string;
		contentModel: string;
		campaignModel: string;
		topicModel: string;
		brandScraperModel: string;
		chatModel: string;
		imageModel: string;
		videoModel: string;
	};
	source: {
		// existing source fields stay
		aiProvider: "workspace" | "env";
		aiContentProvider: "workspace" | "env";
		aiCampaignProvider: "workspace" | "env";
		aiTopicProvider: "workspace" | "env";
		aiBrandScraperProvider: "workspace" | "env";
		aiChatProvider: "workspace" | "env";
		anthropicApiKey: "workspace" | "env";
		anthropicModel: "workspace" | "env";
		geminiApiKey: "workspace" | "env";
		geminiModel: "workspace" | "env";
		geminiImageModel: "workspace" | "env";
		// new openrouter source fields
		openrouterApiKey: "workspace" | "env";
		openrouterModel: "workspace" | "env";
		openrouterContentModel: "workspace" | "env";
		openrouterCampaignModel: "workspace" | "env";
		openrouterTopicModel: "workspace" | "env";
		openrouterBrandScraperModel: "workspace" | "env";
		openrouterChatModel: "workspace" | "env";
		openrouterImageModel: "workspace" | "env";
		openrouterVideoModel: "workspace" | "env";
	};
}

export interface EnvAiDefaults {
	aiProvider: string;
	aiContentProvider: string;
	aiCampaignProvider: string;
	aiTopicProvider: string;
	aiBrandScraperProvider: string;
	aiChatProvider: string;
	anthropicApiKey: string;
	anthropicModel: string;
	geminiApiKey: string;
	geminiModel: string;
	geminiImageModel: string;
	// new
	openrouterApiKey: string;
	openrouterModel: string;
	openrouterContentModel: string;
	openrouterCampaignModel: string;
	openrouterTopicModel: string;
	openrouterBrandScraperModel: string;
	openrouterChatModel: string;
	openrouterImageModel: string;
	openrouterVideoModel: string;
}
```

- [ ] **Step 2: Add `mode` constructor param and wire into the factory**

In the same file, update the class:

```ts
import { OpenRouterProvider } from "../providers/openrouter.provider";
import { OpenRouterChatProvider } from "../providers/openrouter-chat.provider";
import { OpenRouterImageProvider } from "../providers/openrouter-image.provider";
import { OpenRouterVideoAnalyzerProvider } from "../providers/openrouter-video.provider";
import type { MinioStorageProvider } from "../providers/minio.provider";
// ... existing imports

export class AiProviderFactory {
	private settingsCache = new Map<string, ResolvedAiSettings>();

	constructor(
		private repo: WorkspaceSettingRepository,
		private envDefaults: EnvAiDefaults,
		private mode: AiMode,
		private minio: MinioStorageProvider,
	) {}

	// existing invalidate / invalidateAll / getSettings methods unchanged

	// Add image and video getters (renamed from getGeminiImageProvider).
	async getImageProvider(workspaceId: string) {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterImageProvider(s.openrouter.apiKey, s.openrouter.imageModel);
		}
		// Legacy path — preserve current behavior of getGeminiImageProvider.
		if (!s.gemini.apiKey) return null;
		return new GeminiImageProvider(s.gemini.apiKey, s.gemini.imageModel);
	}

	async getVideoAnalyzer(workspaceId: string) {
		const s = await this.getSettings(workspaceId);
		if (this.mode === "openrouter") {
			this.requireKey("openrouter", s.openrouter.apiKey);
			return new OpenRouterVideoAnalyzerProvider(
				s.openrouter.apiKey,
				s.openrouter.videoModel,
				this.minio,
			);
		}
		// Legacy path — preserve current behavior.
		if (!s.gemini.apiKey) return null;
		return new GeminiVideoAnalyzerProvider(s.gemini.apiKey, s.gemini.model);
	}
}
```

(Adjust the legacy `GeminiVideoAnalyzerProvider` constructor args to match what's in the repo — read `gemini-video.provider.ts` to confirm.)

- [ ] **Step 3: Branch each generator getter on `mode`**

Update `getContentGenerator`, `getCampaignGenerator`, `getBriefSummarizer`, `getTopicGenerator`, `getBrandScraper`, `getChatProvider` to short-circuit in OpenRouter mode:

```ts
async getContentGenerator(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.contentModel);
	}
	return this.buildGenerator(s, s.providers.content);
}

async getCampaignGenerator(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.campaignModel);
	}
	return this.buildGenerator(s, s.providers.campaign);
}

async getBriefSummarizer(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.campaignModel);
	}
	return this.buildGenerator(s, s.providers.campaign);
}

async getTopicGenerator(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.topicModel);
	}
	return this.buildGenerator(s, s.providers.topic);
}

async getBrandScraper(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterProvider(s.openrouter.apiKey, s.openrouter.brandScraperModel);
	}
	return this.buildGenerator(s, s.providers.brandScraper);
}

async getChatProvider(workspaceId: string) {
	const s = await this.getSettings(workspaceId);
	if (this.mode === "openrouter") {
		this.requireKey("openrouter", s.openrouter.apiKey);
		return new OpenRouterChatProvider(s.openrouter.apiKey, s.openrouter.chatModel);
	}
	if (s.providers.chat === "anthropic") {
		this.requireKey("anthropic", s.anthropic.apiKey);
		return new AnthropicChatProvider(s.anthropic.apiKey, s.anthropic.model);
	}
	this.requireKey("gemini", s.gemini.apiKey);
	return new GeminiChatProvider(s.gemini.apiKey, s.gemini.model);
}
```

Update `requireKey` to accept the new provider name:

```ts
private requireKey(provider: ProviderName, apiKey: string): void {
	if (apiKey && apiKey.length > 0) return;
	const label =
		provider === "anthropic" ? "Anthropic" : provider === "gemini" ? "Gemini" : "OpenRouter";
	throw new MissingApiKeyError(label);
}
```

- [ ] **Step 4: Extend the `resolve()` method**

Inside `resolve(record)`, add OpenRouter resolution alongside the existing Anthropic/Gemini resolution:

```ts
const openrouterApiKey = pick(record?.openrouterApiKey, env.openrouterApiKey);
const openrouterModel = pick(record?.openrouterModel, env.openrouterModel);
const orContentModel = pick(record?.openrouterContentModel, env.openrouterContentModel);
const orCampaignModel = pick(record?.openrouterCampaignModel, env.openrouterCampaignModel);
const orTopicModel = pick(record?.openrouterTopicModel, env.openrouterTopicModel);
const orBrandModel = pick(record?.openrouterBrandScraperModel, env.openrouterBrandScraperModel);
const orChatModel = pick(record?.openrouterChatModel, env.openrouterChatModel);
const orImageModel = pick(record?.openrouterImageModel, env.openrouterImageModel);
const orVideoModel = pick(record?.openrouterVideoModel, env.openrouterVideoModel);

// Per-generator falls back to default openrouter model when blank.
const fallbackToDefault = (val: { value: string; source: "workspace" | "env" }) =>
	val.value && val.value.length > 0 ? val : openrouterModel;
```

In the returned object, add:

```ts
mode: this.mode,
openrouter: {
	apiKey: openrouterApiKey.value,
	defaultModel: openrouterModel.value,
	contentModel: fallbackToDefault(orContentModel).value,
	campaignModel: fallbackToDefault(orCampaignModel).value,
	topicModel: fallbackToDefault(orTopicModel).value,
	brandScraperModel: fallbackToDefault(orBrandModel).value,
	chatModel: fallbackToDefault(orChatModel).value,
	imageModel: fallbackToDefault(orImageModel).value,
	videoModel: fallbackToDefault(orVideoModel).value,
},
source: {
	// ... existing source fields
	openrouterApiKey: openrouterApiKey.source,
	openrouterModel: openrouterModel.source,
	openrouterContentModel: orContentModel.source,
	openrouterCampaignModel: orCampaignModel.source,
	openrouterTopicModel: orTopicModel.source,
	openrouterBrandScraperModel: orBrandModel.source,
	openrouterChatModel: orChatModel.source,
	openrouterImageModel: orImageModel.source,
	openrouterVideoModel: orVideoModel.source,
},
```

- [ ] **Step 5: Update call sites for the renamed image/video methods**

Run `grep` first to find all callers:

```bash
grep -rnE "getGeminiImageProvider|getGeminiVideoAnalyzer|getVideoAnalyzer|getImageProvider" backend/src
```

Rename `getGeminiImageProvider` calls to `getImageProvider` in:
- `backend/src/services/scene-image.service.ts`
- any other consumers (typically just SceneImageService).

Rename the corresponding video method calls similarly:
- `backend/src/services/competitor-pipeline.service.ts`
- and anywhere else found by grep.

If the legacy `getGeminiVideoAnalyzer` doesn't exist on the factory today (the factory may currently expose video access differently), this step needs to add the missing method and also update the caller in one go.

- [ ] **Step 6: Extend factory tests with mode-branching cases**

Read `backend/tests/services/ai-provider-factory.service.test.ts` to find the existing test setup pattern. Add new cases (full code for each):

```ts
it("openrouter mode: returns OpenRouterProvider regardless of record.aiProvider", async () => {
	const repo = {
		findByWorkspace: async () => ({
			aiProvider: "anthropic", // explicitly set, but mode overrides
			openrouterApiKey: "or-key",
			openrouterModel: "anthropic/claude-sonnet-4.5",
			openrouterContentModel: null,
		}),
	} as any;
	const env = makeEnvDefaults({ openrouterApiKey: "", openrouterModel: "" });
	const minio = {} as any;
	const factory = new AiProviderFactory(repo, env, "openrouter", minio);

	const provider = await factory.getContentGenerator("ws-1");
	expect(provider.constructor.name).toBe("OpenRouterProvider");
});

it("openrouter mode: per-generator override falls back to default openrouter model", async () => {
	const repo = {
		findByWorkspace: async () => ({
			openrouterApiKey: "or-key",
			openrouterModel: "default-model",
			openrouterContentModel: "content-model",
			openrouterTopicModel: null,
		}),
	} as any;
	const env = makeEnvDefaults({});
	const factory = new AiProviderFactory(repo, env, "openrouter", {} as any);

	const settings = await factory.getSettings("ws-1");
	expect(settings.openrouter.contentModel).toBe("content-model");
	expect(settings.openrouter.topicModel).toBe("default-model");
});

it("legacy mode: behaves exactly like before (regression guard)", async () => {
	const repo = {
		findByWorkspace: async () => ({
			aiProvider: "anthropic",
			anthropicApiKey: "ant-key",
			anthropicModel: "claude-sonnet-4",
		}),
	} as any;
	const env = makeEnvDefaults({});
	const factory = new AiProviderFactory(repo, env, "legacy", {} as any);

	const provider = await factory.getContentGenerator("ws-1");
	expect(provider.constructor.name).toBe("AnthropicProvider");
});

it("openrouter mode: missing API key throws MissingApiKeyError(\"OpenRouter\")", async () => {
	const repo = { findByWorkspace: async () => ({ openrouterApiKey: null }) } as any;
	const env = makeEnvDefaults({ openrouterApiKey: "" });
	const factory = new AiProviderFactory(repo, env, "openrouter", {} as any);

	await expect(factory.getContentGenerator("ws-1")).rejects.toThrow(/OpenRouter/);
});
```

`makeEnvDefaults({})` is a small helper — add it once at the top of the file if it doesn't exist:

```ts
function makeEnvDefaults(over: Partial<EnvAiDefaults>): EnvAiDefaults {
	return {
		aiProvider: "anthropic",
		aiContentProvider: "",
		aiCampaignProvider: "",
		aiTopicProvider: "",
		aiBrandScraperProvider: "",
		aiChatProvider: "",
		anthropicApiKey: "",
		anthropicModel: "claude-sonnet-4",
		geminiApiKey: "",
		geminiModel: "gemini-2.5-flash",
		geminiImageModel: "gemini-2.5-flash-image-preview",
		openrouterApiKey: "",
		openrouterModel: "",
		openrouterContentModel: "",
		openrouterCampaignModel: "",
		openrouterTopicModel: "",
		openrouterBrandScraperModel: "",
		openrouterChatModel: "",
		openrouterImageModel: "",
		openrouterVideoModel: "",
		...over,
	};
}
```

If a similar helper already exists, reuse it and just add the new fields to its return.

- [ ] **Step 7: Run factory tests**

```bash
cd backend && bun test tests/services/ai-provider-factory.service.test.ts
```

Expected: all pass, including the 4 new cases.

- [ ] **Step 8: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 9: Run full backend tests**

```bash
cd backend && bun test
```

Expected: all pass except the 1 pre-existing chat.service.test.ts failure.

- [ ] **Step 10: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/ai-provider-factory.service.ts \
        backend/src/services/scene-image.service.ts \
        backend/src/services/competitor-pipeline.service.ts \
        backend/tests/services/ai-provider-factory.service.test.ts
git commit -m "feat(backend): mode-aware AiProviderFactory for OpenRouter

Factory gains a mode parameter ('openrouter' | 'legacy'). In openrouter
mode, every generator returns an OpenRouter provider with the per-
generator model resolved as: per-generator override → default
openrouter model → env per-generator → env default. Legacy mode is
unchanged. Image/video provider getters renamed to mode-aware
getImageProvider/getVideoAnalyzer; SceneImageService and
CompetitorPipelineService updated. Four new tests cover branching.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: index.ts wiring + system route

**Files:**
- Modify: `backend/src/index.ts` (read AI_MODE; pass to factory; mount /api/system route)
- Create: `backend/src/routes/system.route.ts`
- Create: `backend/tests/routes/system.route.test.ts`

- [ ] **Step 1: Write the system-route test**

Create `backend/tests/routes/system.route.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createSystemRoutes } from "../../src/routes/system.route";

describe("system routes", () => {
	it("GET /ai-mode returns the configured mode", async () => {
		const app = new Hono();
		app.route("/", createSystemRoutes("openrouter"));
		const res = await app.request("/ai-mode");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ data: { mode: "openrouter" } });
	});

	it("GET /ai-mode reflects legacy mode", async () => {
		const app = new Hono();
		app.route("/", createSystemRoutes("legacy"));
		const res = await app.request("/ai-mode");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ data: { mode: "legacy" } });
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && bun test tests/routes/system.route.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `backend/src/routes/system.route.ts`**

```ts
import { Hono } from "hono";
import type { AiMode } from "../services/ai-provider-factory.service";

export function createSystemRoutes(mode: AiMode) {
	const app = new Hono();
	app.get("/ai-mode", (c) => c.json({ data: { mode } }));
	return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && bun test tests/routes/system.route.test.ts
```

Expected: 2 pass / 0 fail.

- [ ] **Step 5: Wire `AI_MODE` and mount the route in `backend/src/index.ts`**

Read `backend/src/index.ts`. Find the section near the top where other env vars are read (search for `ANTHROPIC_API_KEY` to locate the AI env block). Add:

```ts
const aiMode: "openrouter" | "legacy" =
	process.env.AI_MODE === "openrouter" ? "openrouter" : "legacy";
```

Find the `EnvAiDefaults` construction (search for `envDefaults` or `EnvAiDefaults`). Add the OpenRouter fields:

```ts
openrouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
openrouterModel: process.env.OPENROUTER_MODEL ?? "",
openrouterContentModel: process.env.OPENROUTER_CONTENT_MODEL ?? "",
openrouterCampaignModel: process.env.OPENROUTER_CAMPAIGN_MODEL ?? "",
openrouterTopicModel: process.env.OPENROUTER_TOPIC_MODEL ?? "",
openrouterBrandScraperModel: process.env.OPENROUTER_BRAND_SCRAPER_MODEL ?? "",
openrouterChatModel: process.env.OPENROUTER_CHAT_MODEL ?? "",
openrouterImageModel: process.env.OPENROUTER_IMAGE_MODEL ?? "",
openrouterVideoModel: process.env.OPENROUTER_VIDEO_MODEL ?? "",
```

Find the `new AiProviderFactory(...)` constructor call. Update the call to pass `aiMode` and the existing minio provider:

```ts
const aiFactory = new AiProviderFactory(workspaceSettingRepository, envAiDefaults, aiMode, minioStorageProvider);
```

(`minioStorageProvider` is the existing variable name; if it's named differently in this codebase, adjust.)

Find where other routes are mounted (search for `app.route("/api/`). Add:

```ts
import { createSystemRoutes } from "./routes/system.route";
// ...
app.route("/api/system", createSystemRoutes(aiMode));
```

Place the `import` near other route imports (alphabetical or otherwise; follow existing order). Place the `app.route(...)` call near other unauthenticated route mounts (the system route doesn't need auth).

- [ ] **Step 6: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 7: Run full backend tests**

```bash
cd backend && bun test
```

Expected: all pass except the 1 pre-existing failure.

- [ ] **Step 8: Smoke test the new endpoint**

```bash
cd backend
set -a && source .env && set +a
bun run --hot src/index.ts &
sleep 3
curl -s http://localhost:3001/api/system/ai-mode
kill %1
```

Expected: `{"data":{"mode":"legacy"}}` (since `.env` has no `AI_MODE` set yet).

- [ ] **Step 9: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/index.ts \
        backend/src/routes/system.route.ts \
        backend/tests/routes/system.route.test.ts
git commit -m "feat(backend): wire AI_MODE env + GET /api/system/ai-mode

index.ts reads AI_MODE (default 'legacy'), threads it into the factory
constructor along with the OpenRouter env fallbacks. New system route
exposes the active mode so the frontend can render mode-aware UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Workspace AI settings route — new fields + test-openrouter endpoint

**Files:**
- Modify: `backend/src/routes/workspace-ai-settings.route.ts`

Two changes: (1) GET/PUT cover the 9 new OpenRouter fields, (2) new `POST /test-openrouter` endpoint validates an OpenRouter key + model.

- [ ] **Step 1: Read the current route file**

```bash
cat /Users/bellinnn/Documents/projects/fce/backend/src/routes/workspace-ai-settings.route.ts
```

Confirm the current GET shape, PUT field handling, and POST /test patterns.

- [ ] **Step 2: Extend GET response with OpenRouter fields**

In the `app.get("/", ...)` handler, after the existing `data:` object:

```ts
return c.json({
	data: {
		mode: resolved.mode,
		providers: resolved.providers,
		workspaceValues: {
			// existing fields...
			openrouterModel: record?.openrouterModel ?? null,
			openrouterContentModel: record?.openrouterContentModel ?? null,
			openrouterCampaignModel: record?.openrouterCampaignModel ?? null,
			openrouterTopicModel: record?.openrouterTopicModel ?? null,
			openrouterBrandScraperModel: record?.openrouterBrandScraperModel ?? null,
			openrouterChatModel: record?.openrouterChatModel ?? null,
			openrouterImageModel: record?.openrouterImageModel ?? null,
			openrouterVideoModel: record?.openrouterVideoModel ?? null,
		},
		credentials: {
			anthropic: maskKey(record?.anthropicApiKey),
			gemini: maskKey(record?.geminiApiKey),
			openrouter: maskKey(record?.openrouterApiKey),
		},
		source: resolved.source,
		effectiveModels: {
			anthropic: resolved.anthropic.model,
			gemini: resolved.gemini.model,
			geminiImage: resolved.gemini.imageModel,
			openrouter: resolved.openrouter.defaultModel,
			openrouterContent: resolved.openrouter.contentModel,
			openrouterCampaign: resolved.openrouter.campaignModel,
			openrouterTopic: resolved.openrouter.topicModel,
			openrouterBrandScraper: resolved.openrouter.brandScraperModel,
			openrouterChat: resolved.openrouter.chatModel,
			openrouterImage: resolved.openrouter.imageModel,
			openrouterVideo: resolved.openrouter.videoModel,
		},
	},
});
```

- [ ] **Step 3: Extend PUT field handling**

In the PUT handler, find the `stringFields` array and add the OpenRouter fields:

```ts
const stringFields = [
	"anthropicApiKey",
	"anthropicModel",
	"geminiApiKey",
	"geminiModel",
	"geminiImageModel",
	"openrouterApiKey",
	"openrouterModel",
	"openrouterContentModel",
	"openrouterCampaignModel",
	"openrouterTopicModel",
	"openrouterBrandScraperModel",
	"openrouterChatModel",
	"openrouterImageModel",
	"openrouterVideoModel",
] as const;
```

The existing `sanitizeString` works for all of them.

- [ ] **Step 4: Add `/test-openrouter` endpoint**

After the existing `app.post("/test", ...)` handler:

```ts
// POST /test-openrouter — verify an OpenRouter API key + model.
// body: { apiKey: string; model: string }
app.post("/test-openrouter", async (c) => {
	const body = (await c.req.json()) as { apiKey?: unknown; model?: unknown };
	const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
	const model = typeof body.model === "string" ? body.model : "";
	if (!apiKey || !model) {
		return c.json({ data: { connected: false, error: "apiKey and model are required" } }, 400);
	}

	try {
		// 1-token completion validates both the key and the model id in one call.
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: "ping" }],
				max_tokens: 1,
			}),
		});
		if (!response.ok) {
			const text = await response.text().catch(() => "");
			return c.json({
				data: { connected: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` },
			});
		}
		return c.json({ data: { connected: true } });
	} catch (e) {
		return c.json({
			data: {
				connected: false,
				error: e instanceof Error ? e.message : "Connection failed",
			},
		});
	}
});
```

- [ ] **Step 5: Typecheck**

```bash
cd backend && bunx tsc --noEmit
```

Expected: 8 pre-existing errors only.

- [ ] **Step 6: Run full backend tests**

```bash
cd backend && bun test
```

Expected: all pass except the 1 pre-existing failure.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/workspace-ai-settings.route.ts
git commit -m "feat(backend): expose openrouter fields on ai-settings route

GET returns OpenRouter mask + workspace values + effective models for
each generator. PUT accepts the 9 new openrouter* fields. New
POST /test-openrouter validates an apiKey+model with a 1-token ping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Frontend — SystemContext + mode fetch on app boot

**Files:**
- Create: `frontend/src/contexts/SystemContext.tsx`
- Modify: `frontend/src/main.tsx` (wrap app in `<SystemProvider>`)

- [ ] **Step 1: Create `frontend/src/contexts/SystemContext.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../services/api";

export type AiMode = "openrouter" | "legacy";

interface SystemContextValue {
	aiMode: AiMode | null; // null while loading; defaults to legacy on error
	loading: boolean;
}

const SystemContext = createContext<SystemContextValue>({ aiMode: null, loading: true });

export function SystemProvider({ children }: { children: ReactNode }) {
	const [aiMode, setAiMode] = useState<AiMode | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		api<{ mode: AiMode }>("/api/system/ai-mode")
			.then((res) => setAiMode(res.mode))
			.catch(() => setAiMode("legacy")) // fail-closed to legacy
			.finally(() => setLoading(false));
	}, []);

	return (
		<SystemContext.Provider value={{ aiMode, loading }}>{children}</SystemContext.Provider>
	);
}

export function useSystemContext() {
	return useContext(SystemContext);
}
```

If `api()` returns the data unwrapped vs wrapped (`{data: {...}}`), match the existing pattern — read another `useEffect` + `api()` call site to confirm. The system route returns `{ data: { mode } }`, so unwrap accordingly.

- [ ] **Step 2: Wrap the app in `<SystemProvider>` in `frontend/src/main.tsx`**

Read `frontend/src/main.tsx`. Find the existing provider stack (likely `AuthProvider`, possibly `WorkspaceProvider`). Add `<SystemProvider>` as one of the outermost providers (after `<AuthProvider>` is fine):

```tsx
import { SystemProvider } from "./contexts/SystemContext";
// ...
<AuthProvider>
	<SystemProvider>
		{/* existing children */}
	</SystemProvider>
</AuthProvider>
```

- [ ] **Step 3: Frontend typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/contexts/SystemContext.tsx frontend/src/main.tsx
git commit -m "feat(frontend): add SystemContext exposing AI_MODE

Calls GET /api/system/ai-mode once on app boot and exposes the result
via useSystemContext(). Falls back to legacy on error so the UI never
breaks if the endpoint is unreachable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Frontend — `useOpenRouterModels` hook + `<OpenRouterModelPicker>` component

**Files:**
- Create: `frontend/src/hooks/useOpenRouterModels.ts`
- Create: `frontend/src/components/settings/OpenRouterModelPicker.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useOpenRouterModels.ts`**

```ts
import { useEffect, useState } from "react";

export interface OpenRouterModel {
	id: string;
	name: string;
	architecture?: {
		input_modalities?: string[];
		output_modalities?: string[];
	};
}

let cachedModels: OpenRouterModel[] | null = null;
let inflight: Promise<OpenRouterModel[]> | null = null;

async function fetchModels(): Promise<OpenRouterModel[]> {
	if (cachedModels) return cachedModels;
	if (inflight) return inflight;
	inflight = fetch("https://openrouter.ai/api/v1/models")
		.then((r) => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json() as Promise<{ data: OpenRouterModel[] }>;
		})
		.then((j) => {
			cachedModels = j.data;
			return j.data;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

export function refreshOpenRouterModels(): void {
	cachedModels = null;
}

export function useOpenRouterModels() {
	const [models, setModels] = useState<OpenRouterModel[] | null>(cachedModels);
	const [loading, setLoading] = useState(!cachedModels);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (cachedModels) {
			setModels(cachedModels);
			return;
		}
		setLoading(true);
		fetchModels()
			.then((data) => setModels(data))
			.catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}, []);

	return { models, loading, error, refresh: () => {
		refreshOpenRouterModels();
		setLoading(true);
		fetchModels()
			.then((data) => { setModels(data); setError(null); })
			.catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
			.finally(() => setLoading(false));
	}};
}
```

- [ ] **Step 2: Create `frontend/src/components/settings/OpenRouterModelPicker.tsx`**

```tsx
import { useMemo, useState, useRef, useEffect } from "react";
import { useOpenRouterModels, type OpenRouterModel } from "../../hooks/useOpenRouterModels";

interface Props {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	category?: "image" | "video";
	disabled?: boolean;
}

function modalityFilter(m: OpenRouterModel, category: "image" | "video"): boolean {
	const inputs = m.architecture?.input_modalities ?? [];
	const outputs = m.architecture?.output_modalities ?? [];
	if (category === "image") return outputs.includes("image");
	if (category === "video") return inputs.includes("video");
	return true;
}

export function OpenRouterModelPicker({ value, onChange, placeholder, category, disabled }: Props) {
	const { models, loading, error, refresh } = useOpenRouterModels();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState(value);
	const wrapRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => setQuery(value), [value]);

	useEffect(() => {
		const onClick = (e: MouseEvent) => {
			if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", onClick);
		return () => document.removeEventListener("mousedown", onClick);
	}, []);

	const filtered = useMemo(() => {
		if (!models) return [];
		const lc = query.toLowerCase();
		return models
			.filter((m) => (category ? modalityFilter(m, category) : true))
			.filter((m) => !lc || m.id.toLowerCase().includes(lc) || m.name.toLowerCase().includes(lc))
			.slice(0, 100);
	}, [models, query, category]);

	if (error) {
		// Fallback: free-text input.
		return (
			<div className="flex flex-col gap-1">
				<input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={placeholder}
					disabled={disabled}
					className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
				/>
				<span className="text-xs text-amber-600">
					Couldn't load model list — type model id manually.{" "}
					<button type="button" onClick={refresh} className="underline">
						Retry
					</button>
				</span>
			</div>
		);
	}

	return (
		<div ref={wrapRef} className="relative">
			<input
				type="text"
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				placeholder={placeholder ?? (loading ? "Loading models…" : "Type or pick a model")}
				disabled={disabled || loading}
				className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
			/>
			{open && filtered.length > 0 && (
				<ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-64 overflow-auto text-sm">
					{filtered.map((m) => (
						<li key={m.id}>
							<button
								type="button"
								onClick={() => {
									onChange(m.id);
									setQuery(m.id);
									setOpen(false);
								}}
								className="w-full text-left px-3 py-1.5 hover:bg-indigo-50"
							>
								<div className="font-mono text-xs">{m.id}</div>
								<div className="text-xs text-gray-500">{m.name}</div>
							</button>
						</li>
					))}
				</ul>
			)}
			{open && filtered.length === 0 && !loading && (
				<div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg p-3 text-xs text-gray-500">
					No matching models. Free-text accepted.
				</div>
			)}
		</div>
	);
}
```

If existing input components already use Tailwind classes that diverge from the above (e.g. different colors, `Input` wrapper), align with the actual styling found in `frontend/src/components/ui/Input.tsx` for visual consistency.

- [ ] **Step 3: Frontend typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/hooks/useOpenRouterModels.ts \
        frontend/src/components/settings/OpenRouterModelPicker.tsx
git commit -m "feat(frontend): add OpenRouter model picker + hook

useOpenRouterModels caches the GET /api/v1/models response in module
scope so multiple pickers share one fetch. OpenRouterModelPicker is a
combobox with optional category filter (image/video) and free-text
fallback when the API is unreachable.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Frontend — mode-aware Integrations UI with OpenRouter card

**Files:**
- Modify: `frontend/src/components/workspace-settings/AiProvidersSection.tsx`

This is the largest frontend change. The component branches on `aiMode` from `useSystemContext()`. In legacy mode, the existing UI renders unchanged. In OpenRouter mode, a new card replaces the AI Providers section's contents.

- [ ] **Step 1: Read the current `AiProvidersSection.tsx` to understand its structure**

```bash
wc -l /Users/bellinnn/Documents/projects/fce/frontend/src/components/workspace-settings/AiProvidersSection.tsx
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/workspace-settings/AiProvidersSection.tsx
```

The file is 419 lines. It fetches `/api/workspaces/:id/ai-settings` and renders the provider dropdowns + Anthropic card + Gemini card + Save button. Save calls `PUT` with the changed fields.

- [ ] **Step 2: Extend the `AiSettings` type**

At the top of the file, extend the `AiSettings` interface to include the OpenRouter fields the GET endpoint now returns:

```ts
interface AiSettings {
	mode: "openrouter" | "legacy";
	providers: {
		default: Provider;
		content: Provider;
		campaign: Provider;
		topic: Provider;
		brandScraper: Provider;
		chat: Provider;
	};
	workspaceValues: {
		aiProvider: string | null;
		aiContentProvider: string | null;
		aiCampaignProvider: string | null;
		aiTopicProvider: string | null;
		aiBrandScraperProvider: string | null;
		aiChatProvider: string | null;
		anthropicModel: string | null;
		geminiModel: string | null;
		geminiImageModel: string | null;
		openrouterModel: string | null;
		openrouterContentModel: string | null;
		openrouterCampaignModel: string | null;
		openrouterTopicModel: string | null;
		openrouterBrandScraperModel: string | null;
		openrouterChatModel: string | null;
		openrouterImageModel: string | null;
		openrouterVideoModel: string | null;
	};
	credentials: {
		anthropic: { configured: boolean; masked: string | null };
		gemini: { configured: boolean; masked: string | null };
		openrouter: { configured: boolean; masked: string | null };
	};
	source: Record<string, "workspace" | "env">;
	effectiveModels: {
		anthropic: string;
		gemini: string;
		geminiImage: string;
		openrouter: string;
		openrouterContent: string;
		openrouterCampaign: string;
		openrouterTopic: string;
		openrouterBrandScraper: string;
		openrouterChat: string;
		openrouterImage: string;
		openrouterVideo: string;
	};
}
```

- [ ] **Step 3: Read mode from context and conditionally render**

At the top of the component body:

```tsx
import { useSystemContext } from "../../contexts/SystemContext";
import { OpenRouterModelPicker } from "../settings/OpenRouterModelPicker";
// ... existing imports

export function AiProvidersSection({ workspaceId, showToast }: Props) {
	const { aiMode, loading: modeLoading } = useSystemContext();
	// ... existing state
```

Replace the rendered output with mode-aware rendering. Find the existing `return (` block. Wrap or split:

```tsx
if (modeLoading || loading) {
	return (
		<div className="flex justify-center py-8">
			<Spinner />
		</div>
	);
}

if (aiMode === "openrouter") {
	return renderOpenRouterUI();
}
return renderLegacyUI();
```

Where `renderOpenRouterUI()` and `renderLegacyUI()` are extracted helpers. Keep the existing markup intact inside `renderLegacyUI()`.

- [ ] **Step 4: Implement `renderOpenRouterUI`**

Add the OpenRouter card render function inside the component. The state model: maintain a single `openrouterDraft` object alongside the existing `draft`:

```tsx
const [openrouterDraft, setOpenrouterDraft] = useState({
	openrouterApiKey: "",
	openrouterModel: settings?.workspaceValues.openrouterModel ?? "",
	openrouterContentModel: settings?.workspaceValues.openrouterContentModel ?? "",
	openrouterCampaignModel: settings?.workspaceValues.openrouterCampaignModel ?? "",
	openrouterTopicModel: settings?.workspaceValues.openrouterTopicModel ?? "",
	openrouterBrandScraperModel: settings?.workspaceValues.openrouterBrandScraperModel ?? "",
	openrouterChatModel: settings?.workspaceValues.openrouterChatModel ?? "",
	openrouterImageModel: settings?.workspaceValues.openrouterImageModel ?? "",
	openrouterVideoModel: settings?.workspaceValues.openrouterVideoModel ?? "",
});
const [openrouterTesting, setOpenrouterTesting] = useState(false);
const [openrouterTestResult, setOpenrouterTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

useEffect(() => {
	if (settings) {
		setOpenrouterDraft((prev) => ({
			...prev,
			openrouterModel: settings.workspaceValues.openrouterModel ?? "",
			openrouterContentModel: settings.workspaceValues.openrouterContentModel ?? "",
			openrouterCampaignModel: settings.workspaceValues.openrouterCampaignModel ?? "",
			openrouterTopicModel: settings.workspaceValues.openrouterTopicModel ?? "",
			openrouterBrandScraperModel: settings.workspaceValues.openrouterBrandScraperModel ?? "",
			openrouterChatModel: settings.workspaceValues.openrouterChatModel ?? "",
			openrouterImageModel: settings.workspaceValues.openrouterImageModel ?? "",
			openrouterVideoModel: settings.workspaceValues.openrouterVideoModel ?? "",
		}));
	}
}, [settings]);
```

Render function:

```tsx
function renderOpenRouterUI() {
	if (!settings) return null;
	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold text-black">AI Providers</h2>
				<p className="text-sm text-gray-500 mt-0.5">
					All generators are powered by OpenRouter. Pick the model for each generator below.
				</p>
			</div>

			<div className="border border-gray-200 rounded-lg p-5 bg-white space-y-4">
				<div className="flex items-center justify-between">
					<h3 className="text-base font-semibold text-black">OpenRouter</h3>
					{settings.credentials.openrouter.configured && (
						<span className="text-xs text-green-600">
							{settings.credentials.openrouter.masked}
						</span>
					)}
				</div>

				<div>
					<label className="text-sm font-medium text-gray-700 block mb-1">API Key</label>
					<input
						type="password"
						value={openrouterDraft.openrouterApiKey}
						onChange={(e) =>
							setOpenrouterDraft((p) => ({ ...p, openrouterApiKey: e.target.value }))
						}
						placeholder={settings.credentials.openrouter.masked ?? "sk-or-v1-..."}
						className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
					/>
				</div>

				<div>
					<label className="text-sm font-medium text-gray-700 block mb-1">Default model</label>
					<OpenRouterModelPicker
						value={openrouterDraft.openrouterModel}
						onChange={(v) => setOpenrouterDraft((p) => ({ ...p, openrouterModel: v }))}
						placeholder="anthropic/claude-sonnet-4.5"
					/>
					<p className="text-xs text-gray-500 mt-1">Used when a generator has no override.</p>
				</div>

				<div className="border-t pt-4 space-y-3">
					<h4 className="text-sm font-semibold text-gray-700">
						Per-generator overrides (optional)
					</h4>
					{[
						{ key: "openrouterContentModel" as const, label: "Content" },
						{ key: "openrouterCampaignModel" as const, label: "Campaign" },
						{ key: "openrouterTopicModel" as const, label: "Topic" },
						{ key: "openrouterBrandScraperModel" as const, label: "Brand Scraper" },
						{ key: "openrouterChatModel" as const, label: "Chat" },
					].map(({ key, label }) => (
						<div key={key} className="grid grid-cols-[140px_1fr] gap-3 items-center">
							<label className="text-sm text-gray-700">{label}</label>
							<OpenRouterModelPicker
								value={openrouterDraft[key]}
								onChange={(v) =>
									setOpenrouterDraft((p) => ({ ...p, [key]: v }))
								}
								placeholder={`(default: ${settings.effectiveModels.openrouter})`}
							/>
						</div>
					))}
				</div>

				<div className="border-t pt-4 space-y-3">
					<h4 className="text-sm font-semibold text-gray-700">Media</h4>
					<div className="grid grid-cols-[140px_1fr] gap-3 items-center">
						<label className="text-sm text-gray-700">Image model</label>
						<OpenRouterModelPicker
							value={openrouterDraft.openrouterImageModel}
							onChange={(v) =>
								setOpenrouterDraft((p) => ({ ...p, openrouterImageModel: v }))
							}
							placeholder="google/gemini-2.5-flash-image-preview"
							category="image"
						/>
					</div>
					<div className="grid grid-cols-[140px_1fr] gap-3 items-center">
						<label className="text-sm text-gray-700">Video model</label>
						<OpenRouterModelPicker
							value={openrouterDraft.openrouterVideoModel}
							onChange={(v) =>
								setOpenrouterDraft((p) => ({ ...p, openrouterVideoModel: v }))
							}
							placeholder="google/gemini-2.5-flash"
							category="video"
						/>
					</div>
					<p className="text-xs text-gray-500">
						Image model must be image-capable. Video model must accept video URL input.
					</p>
				</div>

				<div className="border-t pt-4 flex items-center justify-between">
					<div>
						{openrouterTestResult && (
							<span
								className={`text-xs px-2 py-0.5 rounded ${
									openrouterTestResult.ok
										? "bg-green-100 text-green-700"
										: "bg-red-100 text-red-700"
								}`}
							>
								{openrouterTestResult.ok ? "Connected" : `Failed: ${openrouterTestResult.msg}`}
							</span>
						)}
					</div>
					<Button
						size="sm"
						variant="secondary"
						disabled={openrouterTesting}
						onClick={async () => {
							setOpenrouterTesting(true);
							setOpenrouterTestResult(null);
							try {
								const apiKeyToTest =
									openrouterDraft.openrouterApiKey || "";
								const modelToTest =
									openrouterDraft.openrouterModel ||
									settings.effectiveModels.openrouter;
								if (!apiKeyToTest) {
									setOpenrouterTestResult({ ok: false, msg: "Enter an API key first" });
									return;
								}
								const res = await api<{ connected: boolean; error?: string }>(
									`/api/workspaces/${workspaceId}/ai-settings/test-openrouter`,
									{
										method: "POST",
										body: JSON.stringify({ apiKey: apiKeyToTest, model: modelToTest }),
									},
								);
								setOpenrouterTestResult({
									ok: res.connected,
									msg: res.error ?? "",
								});
							} catch (e) {
								setOpenrouterTestResult({
									ok: false,
									msg: e instanceof Error ? e.message : "Test failed",
								});
							} finally {
								setOpenrouterTesting(false);
							}
						}}
					>
						{openrouterTesting ? "Testing…" : "Test connection"}
					</Button>
				</div>
			</div>

			<div className="flex justify-end">
				<Button onClick={saveOpenRouter} disabled={saving}>
					{saving ? "Saving…" : "Save AI settings"}
				</Button>
			</div>
		</div>
	);
}
```

- [ ] **Step 5: Add `saveOpenRouter` function**

Inside the component:

```tsx
async function saveOpenRouter() {
	setSaving(true);
	try {
		const patch: Record<string, string | null> = {};
		// Only include the API key if user actually typed one (don't blast saved key to null).
		if (openrouterDraft.openrouterApiKey) {
			patch.openrouterApiKey = openrouterDraft.openrouterApiKey;
		}
		const modelKeys = [
			"openrouterModel",
			"openrouterContentModel",
			"openrouterCampaignModel",
			"openrouterTopicModel",
			"openrouterBrandScraperModel",
			"openrouterChatModel",
			"openrouterImageModel",
			"openrouterVideoModel",
		] as const;
		for (const k of modelKeys) {
			const v = openrouterDraft[k];
			patch[k] = v === "" ? null : v;
		}
		await api(`/api/workspaces/${workspaceId}/ai-settings`, {
			method: "PUT",
			body: JSON.stringify(patch),
		});
		showToast("AI settings saved", "success");
		await loadSettings(); // Re-fetch to refresh masked credentials.
	} catch (e) {
		showToast(e instanceof Error ? e.message : "Failed to save", "error");
	} finally {
		setSaving(false);
	}
}
```

(`loadSettings` and `setSaving` are existing functions in the component.)

- [ ] **Step 6: Frontend typecheck**

```bash
cd frontend && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Frontend lint**

```bash
cd frontend && npm run lint
```

Expected: pre-existing errors only; no new findings related to AiProvidersSection.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/workspace-settings/AiProvidersSection.tsx
git commit -m "feat(frontend): mode-aware Integrations UI with OpenRouter card

When useSystemContext() reports aiMode='openrouter', render a single
OpenRouter card with API key, default model, 5 per-generator overrides,
image+video model pickers, and Test connection button. Legacy mode is
unchanged. Uses OpenRouterModelPicker (live-autocomplete combobox).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: CLAUDE.md update

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Append paragraph to the "Per-Workspace AI Provider Resolution" section**

Find the section in `CLAUDE.md` titled `### Per-Workspace AI Provider Resolution`. After its existing paragraphs, append:

```markdown

### `AI_MODE` env flag — OpenRouter mode

When `AI_MODE=openrouter` (instead of the default `legacy`), all AI calls — text generation, chat, scene image generation, and video analysis — route through OpenRouter regardless of the workspace's `aiProvider` settings. Workspaces configure an OpenRouter API key + per-generator model selections under Workspace Settings → Integrations. Existing Anthropic+Gemini fields stay in the DB unused; flipping `AI_MODE` back to `legacy` restores them.

OpenRouter env fallbacks: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_CONTENT_MODEL`, `OPENROUTER_CAMPAIGN_MODEL`, `OPENROUTER_TOPIC_MODEL`, `OPENROUTER_BRAND_SCRAPER_MODEL`, `OPENROUTER_CHAT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `OPENROUTER_VIDEO_MODEL`. Per-generator models fall back to `OPENROUTER_MODEL` if blank, then to a runtime `MissingApiKeyError` if no key is configured at any level.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add CLAUDE.md
git commit -m "docs(claude.md): document AI_MODE flag for OpenRouter

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: End-to-end verification + manual smoke

This is mostly manual — most steps require user-driven UI interaction. The agentic worker should run the auto-checks (Steps 1–3) and then hand off to the user for Steps 4–10.

- [ ] **Step 1: Final backend gate**

```bash
cd backend && bunx tsc --noEmit && bun test
```

Expected: 8 pre-existing typecheck errors only; 1 pre-existing test failure only.

- [ ] **Step 2: Final frontend gate**

```bash
cd frontend && npm run typecheck && npm run lint
```

Expected: 0 typecheck errors; pre-existing lint errors only.

- [ ] **Step 3: Confirm no unintended files modified**

```bash
git status --short
```

Expected: only `.claude/settings.local.json`, `backend/Makefile`, `docs/notes.md` (pre-session dirty files) outside of staged commits.

- [ ] **Step 4: Smoke — Legacy mode unchanged (user)**

Unset `AI_MODE` (or leave blank), restart backend (`cd backend && bun run --hot src/index.ts`) and frontend (`cd frontend && npm run dev`). Open Workspace Settings → Integrations. Confirm the UI looks identical to today (Anthropic + Gemini cards, provider dropdowns, etc.). Save Anthropic key, run a content generation, confirm it succeeds.

- [ ] **Step 5: Smoke — Switch to OpenRouter mode (user)**

Edit `.env`: set `AI_MODE=openrouter` and `OPENROUTER_API_KEY=<your key>`. Restart backend. Open Workspace Settings → Integrations. Confirm:
- Header reads "All generators are powered by OpenRouter."
- Single OpenRouter card visible (no Anthropic/Gemini cards).
- API key field is empty (or shows masked saved key if previously saved).
- Apify section unchanged.

- [ ] **Step 6: Smoke — Model picker live load (user)**

Click the Default model dropdown. List populates from OpenRouter API. Type "claude" — list filters to Claude models. Pick `anthropic/claude-sonnet-4.5`. Click Save AI settings. Confirm "AI settings saved" toast.

- [ ] **Step 7: Smoke — Test connection (user)**

Click Test connection. Expected: green "Connected" pill. Then change Default model to `fake/model-x` (manual entry). Click Test connection. Expected: red "Failed: HTTP 4xx: ..." pill.

- [ ] **Step 8: Smoke — Per-generator override (user)**

Set Content override to a different model (e.g. `openai/gpt-4o`). Save. Run a content generation in the Generate page. Open Workspace Settings → Token Usage (or AI Activity Logs) and confirm the most recent log row records the override model, not the default.

- [ ] **Step 9: Smoke — Image and video (user)**

Trigger a content generation that includes scene images. Confirm scene images appear in the output. Check `ai_provider_logs` (via Profile/Token Usage page or `psql`) for the OpenRouter image model name.

Optional: kick off a competitor analysis on a TikTok URL. Confirm the analysis completes and the log records the OpenRouter video model + a MinIO-hosted video URL.

- [ ] **Step 10: Smoke — Flip back to legacy (user)**

Edit `.env`: set `AI_MODE=legacy` (or unset). Restart backend. Open Workspace Settings → Integrations. Confirm the original UI returns and previously saved Anthropic/Gemini values are still in the DB and rendered. Run a content generation to confirm legacy path still works.

If all smoke checks pass, the branch is ready to merge.

- [ ] **Step 11: Push and open PR (user decision)**

```bash
cd /Users/bellinnn/Documents/projects/fce
git push -u origin feat/openrouter-ai-mode
```

Or follow the project's existing pattern: `git checkout main && git merge --no-ff feat/openrouter-ai-mode -m "Merge feat/openrouter-ai-mode" && git push origin main && git branch -d feat/openrouter-ai-mode`.

---

## Self-Review

**Spec coverage:**

| Spec section | Implementing task |
|---|---|
| Schema (9 nullable cols) | Task 1 |
| Repository extension | Task 1 |
| `AI_MODE` env + .env.example | Task 1 + Task 7 |
| `OpenRouterProvider` (5 text-gen interfaces) | Task 2 |
| `OpenRouterChatProvider` | Task 3 |
| `OpenRouterImageProvider` | Task 4 |
| `OpenRouterVideoAnalyzerProvider` | Task 5 |
| `AiProviderFactory` mode branching | Task 6 |
| Renamed image/video methods + caller updates | Task 6 |
| `index.ts` reads `AI_MODE`, threads to factory | Task 7 |
| `GET /api/system/ai-mode` | Task 7 |
| `PUT /api/workspaces/:id/ai-settings` accepts new fields | Task 8 |
| `POST .../ai-settings/test-openrouter` | Task 8 |
| Frontend `SystemContext` | Task 9 |
| `useOpenRouterModels` + `OpenRouterModelPicker` | Task 10 |
| Mode-aware Integrations UI | Task 11 |
| `CLAUDE.md` update | Task 12 |
| Backend unit tests | Tasks 2/3/4/5/6/7 |
| Manual smoke | Task 13 |

**Type / property consistency check:**

- `ProviderName` type extended to `"anthropic" | "gemini" | "openrouter"` in Task 6, used consistently in `requireKey`. ✓
- `AiMode` type defined once in Task 6 (`ai-provider-factory.service.ts`), imported in Tasks 7 (`system.route.ts`) and 9 (`SystemContext.tsx`). ✓
- OpenRouter field names match exactly across schema (Task 1), repo type (Task 1), factory (Task 6), env (Task 7), route GET/PUT (Task 8), and frontend `AiSettings` type (Task 11). All use `openrouter*` prefix consistently. ✓
- `OpenRouterModelPicker` props (`value`, `onChange`, `placeholder`, `category`, `disabled`) defined in Task 10, consumed in Task 11. ✓
- `getImageProvider` / `getVideoAnalyzer` method names — defined once in Task 6, callers updated in Task 6 same step. ✓
- `lastUsage` shape on OpenRouter providers matches Anthropic/Gemini (`{inputTokens, outputTokens}`). ✓

**Placeholder scan:**

No "TBD", "TODO", "implement later", "fill in details", or "similar to Task N" in any task body. Where the plan defers to "match the existing pattern" (e.g. Step 4 of Task 4: "if `GeminiImageProvider` returns a different shape…"), it explicitly tells the implementer which file to read and what to match.

The `as any` casts in the test files (e.g. `mock(...) as any`, `provider.generate({...} as any)`) are deliberate — they exist because the test inputs are using minimal stub shapes that don't satisfy the full TypeScript interface (which would require constructing complete fixtures for every interface property). This pattern is acceptable in test code and matches existing test conventions in the codebase.

**Scope check:**

Single coherent feature: add OpenRouter as a deployment-mode-controlled provider. All 13 tasks ship together as one PR. No subsystem decomposition needed.
