# Content Generator — multi-select brand pillars when no topic is picked

**Date:** 2026-04-21
**Status:** Approved for planning
**Follows:** `docs/superpowers/specs/2026-04-21-multi-pillar-generation-design.md`

## Problem

The Content Generator currently auto-uses the full brand pillar list when no topic is selected, showing a single "PILLAR: Mixed (all brand pillars)" hint. Users want explicit control: when there's no topic, they should be able to pick which subset of brand pillars should steer the content — just like they already can in the Topic Generator.

## Goal

Replace the "Mixed (all brand pillars)" read-only line in `GeneratePage` with a multi-select chip UI (matching the one in `TopicsPage`) that appears **only** when no topic is selected. Selected pillars are sent in the generation request's `pillars` field. Empty selection keeps today's default ("mix across all brand pillars").

## Non-goals

- No change to Topic Generator.
- No change to the Content Generator's "topic-selected" branch — the existing topic-pillar badge and "Mixed (no pillar set)" fallback stay exactly as they are.
- No backend changes. Backend already accepts `pillars: string[]` and the job/prompt already handle 0/1/N values.
- No shared `<PillarSelector>` component extraction. Two consumers is the threshold where duplication starts to smell; for now the block stays inline. Revisit if a third consumer appears.

## Current state

- `GeneratePage.tsx` holds `brandContentPillars: string[]` (fetched from the active brand brain) and always sends that whole list when no topic is selected.
- The pillar display block at [GeneratePage.tsx:788-837](frontend/src/pages/GeneratePage.tsx#L788-L837) is a read-only line.
- `TopicsPage.tsx` already has a working multi-select chip pattern driven by `selectedPillars: string[]`.

## Design

### 1. UI

Replace the current conditional pillar display with a three-case structure:

- **Topic selected + `topic.pillar` non-empty** → existing indigo badge showing the pillar string. Unchanged.
- **Topic selected + `topic.pillar` blank** → existing "Mixed (no pillar set)" italic grey line. Unchanged.
- **No topic + brand has pillars** → render the chip selector:
  - Label: "Brand Content Pillars" (uppercase, same style as TopicsPage).
  - Status line on the right: `Mixed (all pillars)` when `selectedPillars.length === 0`, else `Selected: ${selectedPillars.join(", ")}`.
  - Chip grid: same toggle pattern as TopicsPage — click adds/removes from `selectedPillars`. Selected chip = indigo; unselected = pastel color cycling through a `PILLAR_COLORS` array.
  - Helper text: "Pick one or more pillars, or leave blank to mix across all."
- **No topic + brand has no pillars** → render nothing. Unchanged.

The chip UI lives in the same visual slot as today's grey italic line — directly under the Topic dropdown, before the Brain Context card.

`PILLAR_COLORS` constant is already defined inline in TopicsPage. Re-declare it locally at the top of GeneratePage (not exported) rather than pulling in a shared module — the two arrays may drift visually later. Premature sharing costs more than it saves.

### 2. State

Add to `GeneratePage.tsx`:

```typescript
const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
```

Placed next to `brandContentPillars`. Reset it in every branch of the brain-fetch effect (early-exit / start of async IIFE / catch) — same pattern we just landed for `TopicsPage` to avoid stale cross-brand selection.

### 3. Resolution on submit

Replace the current `resolvedPillars` expression in `handleSubmit`:

```typescript
const selectedTopic = topics.find((t) => t.id === contentTopicId);
const resolvedPillars = contentTopicId
  ? selectedTopic?.pillar ? [selectedTopic.pillar] : []
  : selectedPillars.length > 0 ? selectedPillars : brandContentPillars;
```

| Topic? | User-selected pillars | `pillars` sent |
|--------|----------------------|----------------|
| Yes, with pillar | (chip UI hidden) | `[topic.pillar]` |
| Yes, blank pillar | (chip UI hidden) | `[]` (backend skips pillar section) |
| No | 0 | full `brandContentPillars` list (preserves today's default) |
| No | ≥1 | just that subset |

The `pillars: resolvedPillars.length > 0 ? resolvedPillars : undefined` guard in the POST body already converts empty-array to `undefined`.

### 4. Files touched

- `frontend/src/pages/GeneratePage.tsx` only. Add state, update the brain-fetch effect, replace the pillar display block, tweak `resolvedPillars`.

### 5. Testing

Frontend-only change; no automated tests are warranted for this UI tweak (no frontend test harness for GeneratePage currently, and the backend logic is already covered by prompt-builder tests). Manual QA matrix:

1. No topic, no pillars picked → prompt contains "Align this content with one of the brand's content pillars: \"A\", \"B\", …" for every brand pillar.
2. No topic, 2 pillars picked → prompt contains only those 2 in the Align line.
3. No topic, 1 pillar picked → prompt says `This content should reinforce the brand pillar: "<that pillar>"`.
4. Topic selected (with pillar) → chip UI is hidden; prompt reinforces the topic's pillar.
5. Topic selected (blank pillar) → chip UI hidden; prompt has no pillar section.
6. Switch brand A → brand B while some pillars selected → `selectedPillars` clears immediately; no stale Brand-A names get submitted.
7. Brand has no pillars configured → no chip UI renders; generation still works with no pillar guidance.

## Risks

- **UX confusion around "empty = mix all"** — a user who clears all selections might expect "don't send any pillar guidance" rather than "mix all." The helper text "Pick one or more pillars, or leave blank to mix across all" is load-bearing. If this becomes a support issue, we can flip to the other semantics (option B from brainstorming) or surface an explicit "No pillar guidance" toggle later.
- **Chip UI duplication** — `TopicsPage` and `GeneratePage` now have near-identical chip blocks. Accepted; documented as a deliberate non-goal. The extraction threshold is a third consumer.

## Out of scope

- Any shared `<PillarSelector>` component.
- Persisting the user's pillar selection across sessions.
- Topic Generator changes.
- Backend changes.
