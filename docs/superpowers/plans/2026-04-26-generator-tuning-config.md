# Generator Tuning Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize per-generator AI tuning (`maxOutputTokens`, `temperature`, `thinkingBudget`) into one config file at `backend/src/config/generator-tuning.ts`. Providers read by key; job handlers don't change.

**Architecture:** A single typed `Record<GeneratorKey, GeneratorTuning>` exports tuning entries for each generator. Each provider file gains a small private adapter that translates the agnostic shape into its SDK's parameter names — `anthropicParams()` for Anthropic (handles the extended-thinking constraint that forces `temperature: 1` and bumps `max_tokens`), `geminiConfig()` for Gemini. Hardcoded literals at 16 call sites (7 Anthropic text + 8 Gemini text + 1 chat surface across two files) are replaced with adapter calls.

**Tech Stack:** TypeScript, Bun runtime. `@anthropic-ai/sdk`, `@google/genai`. No new dependencies.

Spec: `docs/superpowers/specs/2026-04-26-generator-tuning-config-design.md`

---

## File Structure

**Create:**
- `backend/src/config/generator-tuning.ts` — `GeneratorKey` type, `GeneratorTuning` interface, `generatorTuning` record.

**Modify:**
- `backend/src/providers/anthropic.provider.ts` — add `anthropicParams()` private helper, replace 7 hardcoded sites.
- `backend/src/providers/gemini.provider.ts` — add `geminiConfig()` private helper, replace 8 hardcoded sites (the 8th has no Anthropic counterpart).
- `backend/src/providers/anthropic-chat.provider.ts` — replace `max_tokens: 4096` literal with `chat` tuning.
- `backend/src/providers/gemini-chat.provider.ts` — add `maxOutputTokens` to its existing config block from the `chat` tuning.

No test files to create — adapter functions are pure data transforms with no logic worth a snapshot test (per the spec's testing section).

---

## Task 1: Create the config file

**Files:**
- Create: `/Users/bellinnn/Documents/projects/fce/backend/src/config/generator-tuning.ts`

- [ ] **Step 1: Write the file**

Create `backend/src/config/generator-tuning.ts`:

```ts
/**
 * Per-generator AI tuning. Provider-agnostic — each provider translates
 * these into its own SDK parameter names (see `anthropicParams` /
 * `geminiConfig` helpers in the corresponding provider files).
 *
 * Tune these numbers freely; this is the single source of truth.
 */

export interface GeneratorTuning {
	/** Hard cap on response length. Maps to Anthropic max_tokens / Gemini maxOutputTokens. */
	maxOutputTokens: number;
	/** 0 = deterministic, 1 = creative. Both providers use the same scale. */
	temperature: number;
	/**
	 * Extended-thinking budget in tokens. 0 (or omit) disables it.
	 * - Anthropic: maps to thinking.budget_tokens; only Sonnet/Opus 4+ honor it.
	 *   When enabled, the SDK requires temperature: 1 and max_tokens > budget_tokens —
	 *   the adapter forces both, so the configured `temperature` is ignored.
	 * - Gemini: maps to thinkingConfig.thinkingBudget; only Gemini 2.5+ honors it.
	 *   Older models silently ignore.
	 */
	thinkingBudget?: number;
}

export type GeneratorKey =
	| "content" // generateContent — final post copy
	| "campaign" // generateCampaign — multi-post campaign brief
	| "topic" // generateTopics — bulk topic ideation (and topic regen, count=1)
	| "productBrain" // generateProductBrain — manual "Generate with AI" on product form
	| "productScraper" // scrapeProduct — product page → product brain auto-fill
	| "brandScraper" // scrape — site → brand DNA
	| "briefSummary" // summarizeBrief — campaign PDF synthesis text
	| "urlInspiration" // summarizeInspiration — URL inspiration summarizer (Gemini-only call site)
	| "chat"; // ChatService (campaign chat) via *-chat.provider.ts

export const generatorTuning: Record<GeneratorKey, GeneratorTuning> = {
	content: { maxOutputTokens: 4096, temperature: 0.7, thinkingBudget: 4000 },
	campaign: { maxOutputTokens: 4096, temperature: 0.5, thinkingBudget: 6000 },
	topic: { maxOutputTokens: 4096, temperature: 0.8, thinkingBudget: 3000 },
	productBrain: { maxOutputTokens: 2500, temperature: 0.4 },
	productScraper: { maxOutputTokens: 3000, temperature: 0.2 },
	brandScraper: { maxOutputTokens: 3000, temperature: 0.2 },
	briefSummary: { maxOutputTokens: 4096, temperature: 0.3 },
	urlInspiration: { maxOutputTokens: 2000, temperature: 0.3 },
	chat: { maxOutputTokens: 4096, temperature: 0.5 },
};
```

- [ ] **Step 2: Typecheck**

From `/Users/bellinnn/Documents/projects/fce/backend`:

```bash
bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 8 (the existing pre-existing-error baseline; this task adds nothing new since the file isn't imported yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/config/generator-tuning.ts
git commit -m "feat(backend): add generator-tuning config

Single source of truth for per-generator maxOutputTokens, temperature,
and thinkingBudget. Provider-agnostic — providers translate to their
SDK shapes in the next commits."
```

---

## Task 2: Anthropic provider adapter + replacements

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/anthropic.provider.ts`

This task touches a single file with seven existing literal sites. Read the file first to understand the imports and class shape.

- [ ] **Step 1: Add imports and the private adapter**

Near the top of the file, alongside the existing import of `Anthropic` from `@anthropic-ai/sdk`, add:

```ts
import { generatorTuning, type GeneratorTuning } from "../config/generator-tuning";
```

Inside the class body (anywhere; convention is below the constructor and before the public `generate` method), add the private helper:

```ts
	/**
	 * Translate provider-agnostic GeneratorTuning into Anthropic SDK params.
	 *
	 * Extended thinking has two API constraints we enforce here so the config
	 * file can stay simple:
	 *   1. temperature MUST be 1 when thinking is enabled.
	 *   2. max_tokens MUST be greater than thinking.budget_tokens.
	 * If thinkingBudget is set, we override temperature to 1 and bump
	 * max_tokens by the budget so there's room for the response on top.
	 */
	private anthropicParams(t: GeneratorTuning): {
		max_tokens: number;
		temperature: number;
		thinking?: { type: "enabled"; budget_tokens: number };
	} {
		const useThinking = !!t.thinkingBudget && t.thinkingBudget > 0;
		if (useThinking) {
			return {
				max_tokens: t.maxOutputTokens + (t.thinkingBudget ?? 0),
				temperature: 1,
				thinking: { type: "enabled", budget_tokens: t.thinkingBudget! },
			};
		}
		return { max_tokens: t.maxOutputTokens, temperature: t.temperature };
	}
```

- [ ] **Step 2: Replace site at line ~102 (`generateContent`)**

Find this block inside the `generateContent` method:

```ts
		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			temperature: 0,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});
```

Replace with:

```ts
		const response = await this.client.messages.create({
			model: this.model,
			...this.anthropicParams(generatorTuning.content),
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});
```

- [ ] **Step 3: Replace site at line ~129 (`generateCampaign`)**

Same pattern with `generatorTuning.campaign`.

- [ ] **Step 4: Replace site at line ~164 (`generateTopics`)**

Same pattern with `generatorTuning.topic`.

- [ ] **Step 5: Replace site at line ~210 (`generateProductBrain`)**

Same pattern with `generatorTuning.productBrain`.

- [ ] **Step 6: Replace site at line ~301 (`scrapeProduct`)**

Same pattern with `generatorTuning.productScraper`.

- [ ] **Step 7: Replace site at line ~366 (`scrape` — brand scraper)**

Same pattern with `generatorTuning.brandScraper`.

- [ ] **Step 8: Replace site at line ~391 (`summarizeBrief`)**

Same pattern with `generatorTuning.briefSummary`.

- [ ] **Step 9: Verify no `max_tokens:` or `temperature: 0` literals remain in the file**

```bash
grep -n "max_tokens:\|temperature: 0" /Users/bellinnn/Documents/projects/fce/backend/src/providers/anthropic.provider.ts
```

Expected: NO matches. Every former literal site is now using the spread.

- [ ] **Step 10: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: still 8.

- [ ] **Step 11: Run existing test suite**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: 171 pass / 1 fail (the pre-existing ChatService failure unrelated to this work).

- [ ] **Step 12: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/anthropic.provider.ts
git commit -m "feat(backend): wire anthropic.provider through generator-tuning config

Replaces seven hardcoded max_tokens/temperature blocks with a single
anthropicParams adapter that reads generator-tuning entries. Also
enables extended thinking (thinking.budget_tokens) when the matching
key has thinkingBudget set, with the SDK's required temperature=1 +
max_tokens bump enforced inside the adapter."
```

---

## Task 3: Gemini provider adapter + replacements

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini.provider.ts`

Read the file first. Eight literal sites — note that some of them already use a `config: { ... }` shape and others spread temperature inline at the top level. The adapter function returns a config block.

- [ ] **Step 1: Add imports and the private adapter**

Add the import alongside existing ones at the top:

```ts
import { generatorTuning, type GeneratorTuning } from "../config/generator-tuning";
```

Inside the class body, add:

```ts
	/**
	 * Translate provider-agnostic GeneratorTuning into a Gemini SDK config block.
	 * Caller spreads the result into `config: { ...this.geminiConfig(t, sys) }`
	 * (or merges into an existing config object).
	 */
	private geminiConfig(
		t: GeneratorTuning,
		systemInstruction?: string,
	): {
		temperature: number;
		maxOutputTokens: number;
		systemInstruction?: string;
		thinkingConfig?: { thinkingBudget: number };
	} {
		const cfg: ReturnType<typeof this.geminiConfig> = {
			temperature: t.temperature,
			maxOutputTokens: t.maxOutputTokens,
		};
		if (systemInstruction !== undefined) cfg.systemInstruction = systemInstruction;
		if (t.thinkingBudget && t.thinkingBudget > 0) {
			cfg.thinkingConfig = { thinkingBudget: t.thinkingBudget };
		}
		return cfg;
	}
```

- [ ] **Step 2: Replace site at line ~110 (`generateContent`)**

The current shape spreads `temperature: 0` inside an existing `config: { ... }` block. Find the call and replace its config block. Example before:

```ts
		const response = await this.ai.models.generateContent({
			model: this.model,
			contents,
			config: {
				temperature: 0,
				systemInstruction: systemPrompt,
			},
		});
```

After:

```ts
		const response = await this.ai.models.generateContent({
			model: this.model,
			contents,
			config: this.geminiConfig(generatorTuning.content, systemPrompt),
		});
```

If the existing `config: { ... }` has additional properties (e.g., `responseSchema`, `responseMimeType`), preserve them by spreading the adapter result alongside:

```ts
			config: {
				...this.geminiConfig(generatorTuning.content, systemPrompt),
				responseSchema,
				responseMimeType: "application/json",
			},
```

Read the actual existing config block before editing — preserve every key other than `temperature` / `maxOutputTokens` / `systemInstruction` / `thinkingConfig`.

- [ ] **Step 3: Replace site at line ~145 (`generateCampaign`)**

Same pattern with `generatorTuning.campaign`. Preserve any extra config keys.

- [ ] **Step 4: Replace site at line ~171 (`generateTopics`)**

Same pattern with `generatorTuning.topic`. Preserve any extra config keys.

- [ ] **Step 5: Replace site at line ~238 (`generateProductBrain`)**

Same pattern with `generatorTuning.productBrain`.

- [ ] **Step 6: Replace site at line ~318 (`scrapeProduct`)**

Same pattern with `generatorTuning.productScraper`.

- [ ] **Step 7: Replace site at line ~384 (`scrape` — brand scraper)**

Same pattern with `generatorTuning.brandScraper`.

- [ ] **Step 8: Replace site at line ~409 (`summarizeBrief`)**

Same pattern with `generatorTuning.briefSummary`.

- [ ] **Step 9: Replace site at line ~462 (`summarizeInspiration`)**

Same pattern with `generatorTuning.urlInspiration`. This is the only site with no Anthropic counterpart.

- [ ] **Step 10: Verify no `temperature: 0` literals remain in the file**

```bash
grep -n "temperature: 0" /Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini.provider.ts
```

Expected: NO matches.

- [ ] **Step 11: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: still 8.

- [ ] **Step 12: Run existing test suite**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: 171 pass / 1 fail.

- [ ] **Step 13: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/gemini.provider.ts
git commit -m "feat(backend): wire gemini.provider through generator-tuning config

Replaces eight hardcoded temperature/maxOutputTokens blocks with a
single geminiConfig adapter that reads generator-tuning entries.
Preserves any additional config keys (responseSchema etc.) at each
site. summarizeInspiration is the only Gemini-only generator and now
has its own urlInspiration tuning entry."
```

---

## Task 4: Anthropic chat provider

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/anthropic-chat.provider.ts`

The chat provider streams. It uses `max_tokens: 4096` at line ~38. Chat doesn't currently support extended thinking on the streaming surface — keeping `thinkingBudget` out of `generatorTuning.chat` reflects that. We just consume the `chat` entry's `maxOutputTokens` here.

- [ ] **Step 1: Add the import**

At the top of the file, alongside existing imports:

```ts
import { generatorTuning } from "../config/generator-tuning";
```

- [ ] **Step 2: Replace the literal**

Find:

```ts
			const stream = this.client.messages.stream({
				model: this.model,
				system: input.systemPrompt,
				max_tokens: 4096,
				messages: messages as Anthropic.MessageParam[],
				tools: tools.length > 0 ? tools : undefined,
			});
```

Replace `max_tokens: 4096` with the config-driven value. Note that streaming doesn't take `temperature` here in the existing code — keep it that way (don't add temperature; the SDK default applies). If extended thinking is later added to chat, that's a separate change.

```ts
			const stream = this.client.messages.stream({
				model: this.model,
				system: input.systemPrompt,
				max_tokens: generatorTuning.chat.maxOutputTokens,
				messages: messages as Anthropic.MessageParam[],
				tools: tools.length > 0 ? tools : undefined,
			});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 8.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/anthropic-chat.provider.ts
git commit -m "feat(backend): wire anthropic-chat.provider through generator-tuning"
```

---

## Task 5: Gemini chat provider

**Files:**
- Modify: `/Users/bellinnn/Documents/projects/fce/backend/src/providers/gemini-chat.provider.ts`

The Gemini chat provider currently doesn't set `temperature` or `maxOutputTokens` in its streaming `config` — only `systemInstruction` and `tools`. Add the missing tuning keys from `generatorTuning.chat` so it's consistent with the Anthropic chat provider.

- [ ] **Step 1: Add the import**

At the top:

```ts
import { generatorTuning } from "../config/generator-tuning";
```

- [ ] **Step 2: Add maxOutputTokens and temperature to the existing config block**

Find:

```ts
			const response = await this.client.models.generateContentStream({
				model: this.model,
				contents,
				config: {
					systemInstruction: input.systemPrompt,
					tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
				},
			});
```

Replace with:

```ts
			const response = await this.client.models.generateContentStream({
				model: this.model,
				contents,
				config: {
					systemInstruction: input.systemPrompt,
					temperature: generatorTuning.chat.temperature,
					maxOutputTokens: generatorTuning.chat.maxOutputTokens,
					tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
				},
			});
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 8.

- [ ] **Step 4: Run existing test suite**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: 171 pass / 1 fail.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/providers/gemini-chat.provider.ts
git commit -m "feat(backend): wire gemini-chat.provider through generator-tuning

Adds temperature and maxOutputTokens to the streaming config so chat
behaves consistently across both providers. Previously Gemini chat
relied on SDK defaults."
```

---

## Task 6: Manual smoke verification

No automated tests cover the provider code paths (per the spec — adapter is a pure data transform). Verify behavior in a running stack.

- [ ] **Step 1: Start the backend with hot reload**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun run --hot src/index.ts
```

Backend boots on port 3001. Confirm no errors in the boot log.

- [ ] **Step 2: Smoke a content generation in the browser**

Open `http://localhost:5173` (frontend dev server should be running separately if not already). Pick a brand → Generate page → submit a one-liner topic. Watch the backend log for the AI provider request.

Expected: response arrives, no 4xx from the AI provider, content visible in the UI within ~30s.

- [ ] **Step 3: Smoke a topic generation**

Topics page → Generate. Same expected behavior as above.

- [ ] **Step 4: Smoke a brand scrape**

Brands page → New brand → paste any reasonable URL → Auto-fill from Website. Backend log should show the brand scraper hitting the AI provider with the new tuning. Expected: brand auto-fills successfully.

- [ ] **Step 5: Verify no regressions in `bun test`**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -5
```

Expected: 171 pass / 1 fail (unchanged from baseline).

- [ ] **Step 6: Verify no regressions in tsc baseline**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: 8 (unchanged).

- [ ] **Step 7: Commit nothing if everything green**

If smoke tests pass, no further commit needed. If they don't, fix the specific provider site that broke and commit `fix(backend): correct <site> tuning wiring`.

---

## Summary

- 6 tasks, ~30 steps total.
- 1 new file (~50 lines), 4 modified files (~30–60 line touches each).
- 5 functional commits + 1 optional fix commit if smoke catches a regression.
- No new dependencies, no DB migration, no frontend changes.
- Manual smoke verification — no new automated tests, per spec rationale.
