# Generator Tuning Config — Design

**Date:** 2026-04-26
**Status:** Proposed

## Problem

Each AI text generator in FCE (content, campaign, topic, brand-scraper, etc.) has hardcoded `max_tokens` and `temperature: 0` literals scattered across `backend/src/providers/anthropic.provider.ts` and `backend/src/providers/gemini.provider.ts`. There's no central place to see or tune them, and `thinkingBudget` (Anthropic extended thinking / Gemini `thinkingConfig`) isn't wired up at all. Tuning a single generator today means hunting through provider files and editing literals.

## Goal

A single config file at `backend/src/config/generator-tuning.ts` defines `maxOutputTokens`, `temperature`, and an optional `thinkingBudget` per generator. Providers read from it via a small adapter helper that translates the agnostic shape into each SDK's parameter naming. Job handlers and services don't change.

## Non-goals

- **Per-workspace tuning overrides.** Defaults are code-controlled; if a workspace needs different settings, that's a future feature with a UI and a `WorkspaceSetting` column.
- **Env-var overrides** (e.g., `CONTENT_THINKING_BUDGET=8000`). Pure code config — change requires a deploy. Add later if production tuning needs it.
- **Centralizing system prompts.** Prompts continue to live next to the code that uses them. Tuning numbers and prose templates have different change cadences and audiences.
- **Centralizing pg-boss queue config** (concurrency, polling intervals). Stays in `backend/src/index.ts`.
- **Centralizing retry policy or timeouts.**
- **Image generation tuning** (Gemini Imagen for scene images). Not a text generator.
- Generators that don't directly hit text-generation models — `documentExtraction`, `linkScraping`, `creatorEnrichment`, `competitorPipeline`, `researchRun`. Out of scope.

## Architecture

### Config file

`backend/src/config/generator-tuning.ts`:

```ts
export interface GeneratorTuning {
  /** Hard cap on response length. Maps to Anthropic max_tokens / Gemini maxOutputTokens. */
  maxOutputTokens: number;
  /** 0 = deterministic, 1 = creative. Both providers use the same scale. */
  temperature: number;
  /**
   * Extended-thinking budget in tokens. 0 (or omit) disables it.
   * - Anthropic: maps to thinking.budget_tokens; only Sonnet/Opus 4+ honor it.
   * - Gemini: maps to thinkingConfig.thinkingBudget; only Gemini 2.5+ honors it.
   *   Gemini also accepts -1 = auto, but we use explicit positive ints for clarity.
   * Older models silently ignore — safe to leave on.
   */
  thinkingBudget?: number;
}

export type GeneratorKey =
  | "content"           // ContentGenerationJob — final post copy
  | "campaign"          // CampaignGenerationJob — multi-post campaign brief
  | "campaignPdf"       // CampaignPdfGenerationJob — PDF synthesis text
  | "topic"             // TopicGenerationJob — bulk topic ideation
  | "topicRegeneration" // TopicRegenerationJob — single-topic refresh
  | "brandScraper"      // BrandScrapingJob — site → brand DNA
  | "productScraper"    // product page → product brain auto-fill
  | "productBrain"      // manual "Generate with AI" on product form
  | "recommendation"    // RecommendationRecomputeJob
  | "chat";             // ChatService (campaign chat)

export const generatorTuning: Record<GeneratorKey, GeneratorTuning> = {
  content:           { maxOutputTokens: 4096, temperature: 0.7, thinkingBudget: 4000 },
  campaign:          { maxOutputTokens: 4096, temperature: 0.5, thinkingBudget: 6000 },
  campaignPdf:       { maxOutputTokens: 8192, temperature: 0.3 },
  topic:             { maxOutputTokens: 4096, temperature: 0.8, thinkingBudget: 3000 },
  topicRegeneration: { maxOutputTokens: 2048, temperature: 0.8 },
  brandScraper:      { maxOutputTokens: 3000, temperature: 0.2 },
  productScraper:    { maxOutputTokens: 3000, temperature: 0.2 },
  productBrain:      { maxOutputTokens: 2500, temperature: 0.4 },
  recommendation:    { maxOutputTokens: 2000, temperature: 0.3 },
  chat:              { maxOutputTokens: 4096, temperature: 0.5 },
};
```

The defaults above are first-pass values inferred from the existing hardcoded literals (mostly 1024–4096) plus reasonable temperatures (extraction tasks low, creative tasks high, defaults around 0.5). Tuning happens by editing this file alone.

### Provider adapters

Each provider file gains a private helper that translates `GeneratorTuning` into the SDK's parameter shape.

**`backend/src/providers/anthropic.provider.ts`:**

```ts
import { generatorTuning, type GeneratorTuning } from "../config/generator-tuning";

private anthropicParams(t: GeneratorTuning): {
  max_tokens: number;
  temperature: number;
  thinking?: { type: "enabled"; budget_tokens: number };
} {
  // Anthropic's extended-thinking API requires temperature: 1 and
  // max_tokens > budget_tokens. Force-correct here so a misconfigured
  // tuning entry doesn't blow up at request time.
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

Each generator method calls this helper:

```ts
async generateContent(systemPrompt: string, userPrompt: string) {
  const response = await this.client.messages.create({
    model: this.model,
    ...this.anthropicParams(generatorTuning.content),
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });
  // ...
}
```

**`backend/src/providers/gemini.provider.ts`:** mirror pattern, mapping to Gemini's `config` shape:

```ts
private geminiConfig(t: GeneratorTuning, systemInstruction: string) {
  return {
    temperature: t.temperature,
    maxOutputTokens: t.maxOutputTokens,
    systemInstruction,
    ...(t.thinkingBudget && t.thinkingBudget > 0
      ? { thinkingConfig: { thinkingBudget: t.thinkingBudget } }
      : {}),
  };
}
```

**`backend/src/providers/anthropic-chat.provider.ts` and `backend/src/providers/gemini-chat.provider.ts`** also pull from `generatorTuning.chat` — same chat experience regardless of which provider the workspace selected.

### Mapping the existing literals to keys

The implementer must read each provider method and bind it to the matching `GeneratorKey`. The mapping rule is:

- The provider method's name and docstring identify its purpose. `generateContent` → `content`, `generateCampaign` → `campaign`, `generateCampaignPdf` → `campaignPdf`, `generateTopics` → `topic`, `regenerateTopic` → `topicRegeneration`, `scrapeBrand` → `brandScraper`, `scrapeProduct` (or equivalent) → `productScraper`, `generateProductBrain` → `productBrain`, `recomputeRecommendations` (or equivalent) → `recommendation`. Chat-provider files map to `chat`.
- Anthropic and Gemini have parallel method-per-generator structures, so the same set of keys covers both files.
- A `grep -n "max_tokens\|maxOutputTokens\|temperature: 0" backend/src/providers/anthropic.provider.ts backend/src/providers/gemini.provider.ts backend/src/providers/anthropic-chat.provider.ts backend/src/providers/gemini-chat.provider.ts` enumerates every call site that needs replacement.
- Anthropic has ~7 hardcoded sites; Gemini has ~6–8 (some helper methods may share the same shape). If the implementer finds a site that doesn't correspond to any `GeneratorKey` (e.g., an internal utility that happens to call the SDK), STOP and surface it — adding a new key is fine, but silent reuse of an existing key for a different purpose is not.

If a generator method exists on one provider but not the other (e.g., a Gemini-only video method), it's out of scope — those don't appear in the `GeneratorKey` enum and continue to use whatever literals they have today.

### Validation hooks

Console warnings (logged once at process boot) for misconfigured entries:

- `temperature` outside `[0, 1]` — both providers reject this.
- `thinkingBudget < 1024` for Anthropic (Anthropic's minimum is `1024` for extended thinking).
- `maxOutputTokens < thinkingBudget` (would cause Anthropic to forcibly raise max_tokens; we already do that automatically, so the warning just flags the config drift).

These warnings are aggregated and logged once at provider construction — not on every call.

## Edge cases

- **Anthropic extended thinking constraints.** Setting `thinking` requires `temperature: 1` and `max_tokens > budget_tokens`. The adapter forces both automatically when `thinkingBudget > 0`. The original `temperature` value in the config is ignored in that case; document this in the field comment so it's not surprising.
- **Gemini thinking on older models.** Models pre-2.5 silently drop `thinkingConfig`. No error, just no thinking. Acceptable — the field is hint, not contract.
- **Provider switch mid-flight.** Workspace can change `AI_CONTENT_PROVIDER` from anthropic → gemini live. Tuning lookup is independent of provider choice, so this still works.
- **Per-call overrides.** Out of scope. If a single call needs to deviate (e.g., short retry without thinking), that becomes a separate generator key with its own entry rather than a per-call argument. Keeps the config the single source of truth.

## Testing

- **Unit tests:** none new. The adapter functions are pure data transforms with trivial logic; the manual mapping table above is the actual review surface, and a unit test would just re-state the table. Adding a snapshot test of "config → SDK params" would lock in the behavior at the cost of a maintenance-heavy fixture.
- **Manual smoke verification** (post-merge):
  - Run one content generation. Watch the request logs for the AI provider.
  - Run one topic generation. Same.
  - Run one brand scrape. Same.
  - Run one campaign generation. Same.
  - Confirm responses arrive with no 4xx errors.
  - Confirm the existing `tests/services/auth.service.test.ts` and `tests/services/onboarding.service.test.ts` suites still pass — they don't depend on this code path but are the project's only test suite.
- **Type check:** `bunx tsc --noEmit` should produce the same baseline error count (8 pre-existing errors in unrelated files); zero new errors in touched files.

## Rollout

1. Land the new `generator-tuning.ts` file.
2. Update Anthropic + Gemini providers (text + chat) to consume it.
3. Replace literal sites one provider file at a time so the diff is reviewable.
4. Manual smoke per the testing list.
5. No DB migration, no env change, no frontend change.
6. Tuning numbers are guesses today — expect a follow-up PR or two adjusting them based on real usage.

## YAGNI / deferred

- Per-workspace tuning UI.
- Env-var overrides.
- Centralized system prompts.
- Centralized pg-boss queue config.
- Per-call tuning overrides.
- Snapshot tests of config → SDK mapping.
- Image-generator tuning.
