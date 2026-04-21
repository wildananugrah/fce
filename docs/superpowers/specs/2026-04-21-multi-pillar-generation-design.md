# Multi-pillar selection for Topic & Content generation

**Date:** 2026-04-21
**Status:** Approved for planning

## Problem

The Topic Generator currently lets the user pick **one** brand pillar or leave it blank. "One pillar" forces every topic in the batch onto the same theme; "blank" spreads topics across *all* brand pillars. There's no middle ground — a user who wants topics across, say, two of five pillars has to run two separate batches.

The Content Generator, separately, doesn't pass pillar information into its prompt at all. When a topic is selected its pillar shows in the UI, but the pillar never reaches the AI, so the generated content isn't explicitly steered by the pillar the topic was planned under. When no topic is selected, pillar guidance is absent entirely.

## Goals

1. Let users pick **zero, one, or many** pillars in the Topic Generator; the AI distributes generated topics across the chosen pillars (or all brand pillars when none are selected).
2. Make the Content Generator actually use pillar guidance in its prompt, driven by the selected topic's pillar when a topic is picked, or by the brand's full pillar list otherwise.

## Non-goals

- No schema change to topic rows. A topic still has one pillar; we're only widening the *input* to generation.
- No new UI selector on the Content Generator page. Pillar input there is implicit (topic → topic's pillar; no topic → all brand pillars).
- No change to campaign generation, chat, or any other generator.

## Current state

### Topic Generator

- Frontend: [TopicsPage.tsx:123](frontend/src/pages/TopicsPage.tsx#L123) — `selectedPillar: string` (one or blank). Chip UI at [TopicsPage.tsx:493-526](frontend/src/pages/TopicsPage.tsx#L493-L526).
- API input: `pillar?: string`. Types in [topic.types.ts:6,19,31](backend/src/types/topic.types.ts#L6).
- Prompt: [prompt-builder.ts:142-144](backend/src/utils/prompt-builder.ts#L142-L144) — two branches:
  - pillar set → "Use EXACTLY this pillar for every topic"
  - blank → "Pick from the brand's pillar list, distribute for variety"

### Content Generator

- Frontend: [GeneratePage.tsx:788-807](frontend/src/pages/GeneratePage.tsx#L788-L807) — when a topic is picked, shows the topic's pillar as a read-only badge. Otherwise nothing.
- Backend: [content-generation.job.ts](backend/src/jobs/content-generation.job.ts) — the content prompt contains **no** pillar instruction today.

## Design

### 1. Topic Generator — multi-select pillars

#### Frontend ([TopicsPage.tsx](frontend/src/pages/TopicsPage.tsx))

- State: `selectedPillar: string` → `selectedPillars: string[]`.
- Chip click toggles membership in the array (add if absent, remove if present).
- Status line:
  - `[]` → "Mixed (all pillars)"
  - `[A]` → "Selected: A"
  - `[A, B, …]` → "Selected: A, B, …"
- Helper text: "Pick one or more pillars, or leave blank to mix across all."
- Selected chips keep the current selected-state styling; unselected chips keep the color-coded unselected styling.

#### API + types ([topic.types.ts](backend/src/types/topic.types.ts), [topic-generator.interface.ts](backend/src/interfaces/providers/topic-generator.interface.ts), [topic.service.ts](backend/src/services/topic.service.ts), [topic.route.ts](backend/src/routes/topic.route.ts), [topic-generation.job.ts](backend/src/jobs/topic-generation.job.ts), [topic-regeneration.job.ts](backend/src/jobs/topic-regeneration.job.ts))

- Rename `pillar?: string` → `pillars?: string[]` throughout the generation input chain. **Breaking change** — frontend and backend deploy together.
- Zod validation on the route: `z.array(z.string()).optional()`. Empty array and `undefined` both mean "mix across all".
- Regeneration of an individual topic keeps passing a single pillar (topics themselves are still one-pillar rows); no change to the regeneration input shape other than following whatever rename is consistent.

#### Prompt ([prompt-builder.ts](backend/src/utils/prompt-builder.ts))

Three branches on `input.pillars`:

| Count | Instruction |
|-------|-------------|
| 0 or undefined | "Pick one appropriate pillar from the brand's pillar list in the brand context. Distribute topics across multiple pillars for variety. Never leave empty." *(unchanged — current blank behavior)* |
| 1 | "Use EXACTLY this pillar for every topic: \"X\". Every topic's pillar field must be the exact string \"X\". Do not invent other pillars." *(unchanged — current single-pillar behavior)* |
| 2+ | "For every topic, set the pillar field to exactly one of: \"A\", \"B\", \"C\". Distribute topics across these pillars for variety. Do not invent or use any other pillars." |

Each generated topic still stores a single `pillar: string`.

### 2. Content Generator — pillar enters the prompt

#### Frontend ([GeneratePage.tsx](frontend/src/pages/GeneratePage.tsx))

- No new selector.
- The existing pillar badge when a topic is selected stays as-is.
- When **no topic** is selected, show a read-only line: "PILLAR: Mixed (all brand pillars)" so the user understands the AI will use all pillars as context. Uses the same brand-brain `contentPillars` fetch the Topic Generator already does.

#### Backend (content generation prompt)

The content generation job resolves the pillar input before calling the provider:

- Topic selected **and** topic has a non-empty `pillar` → use that single pillar string.
- Topic selected but `pillar` is blank (generated from the mix path) → treat as "no pillar" (skip the pillar instruction entirely so the AI isn't forced).
- No topic selected → load the brand's active-brain `contentPillars` list.

The prompt gets a new section:

- Single pillar: "This content should reinforce the brand pillar: \"X\"."
- Multiple pillars (no topic): "Align this content with one of the brand's content pillars: \"A\", \"B\", \"C\". Pick the one that best fits the requested platform, format, and objective."
- No pillars at all (neither a topic-pillar nor a brand pillar list): skip the section.

### 3. Data flow

```
Topic Generator UI (selectedPillars: string[])
  → POST /api/workspaces/:w/topics/generate  { pillars: string[] }
  → topic.service → pg-boss topic-generation job
  → prompt-builder.buildTopicPrompt({ pillars })  ← three-branch instruction
  → AI provider → topics (each with single pillar)
```

```
Content Generator UI (topic selected OR not)
  → resolve pillar input on the frontend:
      topic selected + topic.pillar present → [topic.pillar]
      topic selected + topic.pillar blank   → []
      no topic                              → brand.activeBrain.contentPillars ?? []
  → POST /api/workspaces/:w/generations  { ...existing, pillars: string[] }
  → pg-boss content-generation job
  → content prompt builder  ← new pillar section
  → AI provider
```

The content-generation request body gets one new field: `pillars: string[]`. An empty array = no pillar guidance (the prompt's pillar section is skipped).

### 4. Testing

- **Prompt builder tests** covering all three pillar-count branches in topic generation.
- **Topic service tests**: `pillars: []`, `pillars: ["A"]`, `pillars: ["A", "B"]` each produce the right provider input.
- **Content generation tests**: verify pillar line appears in the prompt when (a) topic has a pillar, (b) no topic + brand has pillars; verify the line is absent when (c) topic has blank pillar, (d) no topic + brand has no pillars.
- **Frontend**: manual QA — chip toggles, status line, the new "Mixed (all brand pillars)" line on Content Generator.

### 5. Migration / backwards compatibility

Because we're renaming `pillar` → `pillars` as a breaking change, any in-flight pg-boss jobs created before deploy will still carry `pillar`. Two mitigations:

- The pg-boss topic-generation job handler reads from the input payload; add a one-shot shim at the top of the handler: `input.pillars ??= input.pillar ? [input.pillar] : []`. Delete the shim after a release cycle.
- No DB-stored pillar inputs — only in-flight job payloads can be affected, so no data migration script is needed.

## Risks

- **Prompt drift** — a two-of-five-pillars request with a small topic count (say, 3 topics across 3 pillars) is more sensitive to the AI actually distributing. The wording "Distribute topics across these pillars for variety" has to be firm or we get skew. The tests around this are the main safeguard; if we see drift in practice, tighten the instruction to require each pillar be used at least once when `count >= pillars.length`.
- **Topic with blank pillar + Content Generator** — skipping the pillar section for these topics is intentional (the user originally chose to mix), but a user may be surprised that content guidance disappears for mixed-origin topics. Documented in the UI badge ("Mixed (no pillar set)" — already present).

## Out of scope

- Campaign generator pillar changes.
- Chat-based topic/content generation pillar handling.
- Changing the schema of stored topics.
- Any per-content-piece pillar override UI on the Content Generator.
