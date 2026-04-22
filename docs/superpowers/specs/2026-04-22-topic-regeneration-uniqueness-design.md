# Topic regeneration uniqueness + context fix

**Date:** 2026-04-22
**Status:** Approved for planning

## Problem

When the user regenerates a single topic from the Topic Generator, the new topic sometimes comes back nearly identical to another topic in the same batch. Example from the screenshot:

- "Rahasia Soft Compound FDR Bikin Manuver Tajam Makin Percaya Diri"
- "Rahasia Soft Compound FDR Bikin Sobat Makin Pede Saat Cornering Tajam"

Two independently-generated topics, same pillar/platform/format, essentially the same content.

While investigating, a **separate pre-existing bug** surfaced in `backend/src/jobs/topic-regeneration.job.ts`:

```ts
const userPrompt = `${baseUserPrompt}\n${existingLine}\n${hintLine}`.trim();
// ...later:
const output = await topicGenerator.generate(generationInput); // ← userPrompt discarded
```

The `existingLine` ("Current topic: X — Y. Generate a fresh, different idea") and `hintLine` (the user's Additional Guidance input) are computed and logged, but the provider's `generate()` call gets the plain `generationInput` — it rebuilds the prompt internally without those additions. So today:

- The AI doesn't know it's regenerating.
- It doesn't know what the original topic was.
- The user's typed hint never reaches the model.

Both pain points get fixed by the same plumbing change.

## Goals

1. The regeneration prompt tells the AI explicitly which **other topic titles** (from the current batch) it must not duplicate or paraphrase.
2. The original topic and the user's hint actually reach the model.

## Non-goals

- No schema change; no `batchId` column on `ContentTopic`.
- No library-wide uniqueness (topics across the whole workspace / historical weeks). Scope is the current on-screen batch only.
- No change to initial bulk topic generation. When N topics are generated in one AI call, the model already self-avoids intra-batch duplicates; the regenerate path is the only broken one.
- No change to content or campaign generation prompts.

## Current state

- `TopicGenerationInput` (in [topic-generator.interface.ts](backend/src/interfaces/providers/topic-generator.interface.ts)) has no field for "avoid list" or "regeneration guidance".
- `buildTopicGenerationPrompt` renders brand/product context + platform/format/objective/pillars/date instructions. No section for existing topic references or uniqueness constraints.
- `topic-regeneration.job.ts`:
  - Fetches the existing topic's title/description when `topicId` is set.
  - Concatenates `existingLine` + `hintLine` into a local `userPrompt` variable.
  - Passes only `generationInput` (no extra context) to `topicGenerator.generate()`.
  - Logs the rich `userPrompt` but it never drives generation.
- `topic.route.ts` POST `/regenerate-preview` and POST `/:id/regenerate` accept `hint` but nothing else.
- `TopicsPage.tsx` `handleRegenerateSingle` posts `{ brandId, productIds, platform, format, objective, pillar, language, hint }`.

## Design

### 1. Interface changes

Extend `TopicGenerationInput` with two optional fields:

```ts
avoidTitles?: string[];
regenerationGuidance?: string;
```

- `avoidTitles` — list of existing topic titles the regenerated topic must not duplicate/paraphrase. Used only on the regeneration path. Undefined or empty on the initial bulk generate.
- `regenerationGuidance` — single prepared string combining "original topic reference" + "user hint". The regeneration job packs both signals into this one field so the prompt builder only has to handle one optional block.

No change to `TopicGenerationOutput` or the provider interface shape — this is input-only.

### 2. Prompt-builder changes

`buildTopicGenerationPrompt` gets two new optional sections. Both appear at the **end** of the user prompt, after the existing "Make topics diverse, engaging, and aligned with the brand voice." line.

**Avoid block** — rendered only when `avoidTitles` is non-empty:

```
CRITICAL UNIQUENESS REQUIREMENT: The generated topic MUST be substantially different from ALL of the following existing topics. Do NOT duplicate their titles, angles, or key messaging — even with rewording:
- "Topic A title"
- "Topic B title"
- ...

The new topic should explore a genuinely fresh angle — a different sub-topic, audience moment, or narrative frame.
```

**Guidance block** — rendered only when `regenerationGuidance` is a non-empty string, plain-text appended on its own line.

Both blocks absent when neither field is supplied — initial bulk generation prompt is unchanged.

### 3. Job changes ([topic-regeneration.job.ts](backend/src/jobs/topic-regeneration.job.ts))

Rewrite the prompt-assembly section:

- Receive `avoidTitles?: string[]` in the job payload.
- Build `regenerationGuidance` from the existing title/description + user hint via a small local helper:

  ```ts
  function buildRegenerationGuidance(
    existingTitle: string,
    existingDescription: string,
    hint?: string,
  ): string | undefined {
    const parts: string[] = [];
    if (existingTitle) {
      parts.push(
        `Original topic being regenerated — generate a DIFFERENT idea: "${existingTitle}" — "${existingDescription}".`,
      );
    }
    if (hint) parts.push(`Additional guidance from the user: ${hint}`);
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  ```

- Pack both into `generationInput`:

  ```ts
  const generationInput = {
    brandContext,
    productContexts: productContexts.length > 0 ? productContexts : undefined,
    platform,
    objective,
    formats: format ? [format] : undefined,
    pillars: pillar ? [pillar] : undefined,
    language,
    count: 1,
    avoidTitles: avoidTitles && avoidTitles.length > 0 ? avoidTitles : undefined,
    regenerationGuidance: buildRegenerationGuidance(existingTitle, existingDescription, hint),
  };
  ```

- Remove the dead-end `userPrompt` concat. The `userPrompt` used for AI-activity logging now comes from a single `buildTopicGenerationPrompt(generationInput)` call — the prompt builder is authoritative.

Provider code (`gemini.provider.ts`, `anthropic.provider.ts`) needs no change — they already call `buildTopicGenerationPrompt(input)` and pass the result through.

### 4. Route + service

`topic.route.ts`:
- POST `/regenerate-preview` — destructure `avoidTitles` from body, forward to `topicService.regeneratePreview`.
- POST `/:id/regenerate` — destructure `avoidTitles` from body, forward to `topicService.regenerate`.

`topic.service.ts`:
- `regeneratePreview` gains an `avoidTitles?: string[]` param inside its `params` object.
- `regenerate` gains an `avoidTitles?: string[]` trailing param.
- Both forward `avoidTitles` into the pg-boss job payload.

`TopicRegenJobData` interface in the job file gains `avoidTitles?: string[]`.

### 5. Frontend ([TopicsPage.tsx](frontend/src/pages/TopicsPage.tsx))

`handleRegenerateSingle` computes the avoid list from local state and sends it in the body:

```ts
const avoidTitles = generatedTopics
  .filter((t) => t.id !== topicId && t.title?.trim())
  .map((t) => t.title);

await api(`/api/workspaces/${activeWorkspace.id}/topics/regenerate-preview`, {
  method: "POST",
  body: JSON.stringify({
    brandId,
    productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
    platform: topic?.platform || platform || undefined,
    format: topic?.format || undefined,
    objective: topic?.objective || objective || undefined,
    pillar: topic?.pillar || selectedPillars[0] || undefined,
    language,
    hint: regenHints[topicId] || undefined,
    avoidTitles: avoidTitles.length > 0 ? avoidTitles : undefined,
  }),
});
```

No UI change visible to the user. The batch is whatever is currently in the `generatedTopics` state.

### 6. Tests

Add to `backend/tests/utils/prompt-builder.test.ts`:

- `buildTopicGenerationPrompt` with **no** `avoidTitles` and **no** `regenerationGuidance` → neither block appears (assert `userPrompt` does NOT contain "CRITICAL UNIQUENESS" or "Original topic being regenerated").
- `avoidTitles: ["Topic A", "Topic B"]` → "CRITICAL UNIQUENESS REQUIREMENT" present, both titles appear in double-quoted bullet form.
- `avoidTitles: []` → behaves as undefined (no block).
- `regenerationGuidance: undefined` → guidance block absent.
- `regenerationGuidance: "extra text here"` → guidance text appears in `userPrompt`.

No new service or job tests — the regeneration job handler has no existing tests to extend, and the new fields are plumbing. Prompt-builder tests are the authoritative gate.

## Data flow

```
Frontend (TopicsPage.handleRegenerateSingle)
  → computes avoidTitles from generatedTopics (batch-local state)
  → POST /api/workspaces/:w/topics/regenerate-preview
       { ...existing fields, avoidTitles?: string[] }

Route (topic.route.ts)
  → topicService.regeneratePreview({ ..., avoidTitles }, hint)

Service (topic.service.ts)
  → boss.send("topic-regeneration", { ..., avoidTitles, hint })

Job (topic-regeneration.job.ts)
  → fetches existing topic (title/description) if topicId set
  → builds regenerationGuidance from (existing + hint)
  → packs avoidTitles + regenerationGuidance into TopicGenerationInput
  → topicGenerator.generate(input)

Provider
  → buildTopicGenerationPrompt(input) renders avoid block + guidance
  → AI call with the new, richer prompt
```

## Risks

- **Prompt bloat** — if a batch grows to 30+ long titles, the avoid section grows accordingly. Practical batches are 5–15 topics; no risk today. If we hit an issue, truncate to first N characters per title or summarize.
- **AI ignoring the avoid instruction** — LLMs don't always respect negative constraints. Mitigation: the "CRITICAL UNIQUENESS REQUIREMENT" phrasing + imperative bullet list + "even with rewording" explicit anti-paraphrase clause. If this proves insufficient, a post-generation similarity check (Levenshtein or embedding cosine) against `avoidTitles` is a reasonable follow-up, but not in scope here.
- **Hint fix is a behavior change** — the Additional Guidance field has been silently ignored since the feature shipped. Turning it on might surprise users who typed experimental hints that never mattered. Acceptable: the feature was always meant to work; nobody has a workflow built around it not working.

## Out of scope

- Library-wide uniqueness (option B from brainstorming).
- Cross-workspace or historical uniqueness.
- Any similarity-scoring / embedding / post-hoc validation step.
- Batch-aware schema changes (`batchId`).
- UI indication of "avoid list" to the user.
- Initial bulk-generation prompt changes.
