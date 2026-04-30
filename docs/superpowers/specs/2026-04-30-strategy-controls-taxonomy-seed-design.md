# Strategy Controls Taxonomy Seed — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend

## Problem

In Content Generator → Advanced mode, the Strategy controls show incomplete dropdowns:

- **Framework** — DB has 3 rows (AIDA, PAS, BAB); user expects 11.
- **Hook Type** — DB has 5 rows (Curiosity, Pain Point, Bold Claim, Social Proof, Story); user expects 10 with different naming.
- **Tone Variation** — DB has 8 rows (Professional, Casual, Playful, …) that don't match user's intended taxonomy of 4 variations + a "Default Brand Tone" affordance.
- **Visual Style** — DB has 6 rows (Minimalist, Bold & Vibrant, …) that don't match user's intended 6.
- **Output Length** — frontend constant labels are too terse ("Short" / "Medium" / "Long"); user wants format hints in parentheses.

Inspection on the live DB showed all four taxonomy tables actually have 0 rows — the seed script never ran on this environment, or its data was wiped. So in practice every dropdown only displays its placeholder.

## Goals

- All four DB-backed dropdowns render the user's canonical lists after seeding.
- Output Length labels read with format hints.
- "Default Brand Tone" is exposed as the empty placeholder (no DB row), per the user's preference.
- Framework + Hook Type empty-state placeholders read as neutral defaults rather than singling out one option as "recommended".

## Non-Goals

- **Admin UI changes.** Admins can still add/edit/remove items via Workspace Settings → Strategy Controls; that flow already exists and is not affected.
- **Schema changes.** No new columns, no new models.
- **Migrating existing per-workspace selections.** Generation rows that point at an old framework/hook-type/tone/visual-style id continue to work because we're not deleting anything; we're additively upserting the canonical set. (See "Stale rows" under Open Questions.)

## Architecture

Two surfaces change:

1. `backend/prisma/seed.ts` — replace the in-file taxonomy arrays with the canonical lists. Existing upsert-by-name pattern is preserved (idempotent).
2. `frontend/src/pages/GeneratePage.tsx` — relabel `OUTPUT_LENGTH_OPTIONS` and adjust three placeholders.

Run `bun run prisma/seed.ts` after the backend change to populate the rows.

## Frontend Changes

### `frontend/src/pages/GeneratePage.tsx`

#### Output Length labels (lines 316–321)

```diff
 const OUTPUT_LENGTH_OPTIONS = [
   { value: "", label: "Select Output Length" },
-  { value: "short", label: "Short" },
-  { value: "medium", label: "Medium" },
-  { value: "long", label: "Long" },
+  { value: "short", label: "Short (caption)" },
+  { value: "medium", label: "Medium (Post)" },
+  { value: "long", label: "Long (Thread/Script)" },
 ];
```

#### Strategy dropdown placeholders (lines 719–722)

```diff
- const frameworkOptions = [{ value: "", label: "PAS (recommended)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
- const hookTypeOptions = [{ value: "", label: "Curiosity (recommended)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];
- const tonePresetOptions = [{ value: "", label: "Select Tone Variation" }, ...tonePresets.map((t) => ({ value: t.id, label: t.name }))];
- const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map((v) => ({ value: v.id, label: v.name }))];
+ const frameworkOptions = [{ value: "", label: "Default (AIDA)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
+ const hookTypeOptions = [{ value: "", label: "Default (Curiosity)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];
+ const tonePresetOptions = [{ value: "", label: "Default Brand Tone" }, ...tonePresets.map((t) => ({ value: t.id, label: t.name }))];
+ const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map((v) => ({ value: v.id, label: v.name }))];
```

The empty value `""` continues to mean "no override; backend uses brand defaults". Visual Style placeholder is unchanged because there is no implicit brand-level visual-style concept to call out.

## Backend Changes

### `backend/prisma/seed.ts`

Replace the four arrays with the canonical lists. Keep the upsert-by-name loop pattern (already idempotent, safe to re-run).

```ts
const frameworks = [
    { name: "AIDA", description: "Attention, Interest, Desire, Action" },
    { name: "PAS", description: "Problem, Agitate, Solution" },
    { name: "BAB", description: "Before, After, Bridge" },
    { name: "4C", description: "Clear, Concise, Compelling, Credible" },
    { name: "FAB", description: "Features, Advantages, Benefits" },
    { name: "Problem-Solution", description: "Identify a problem, then present the solution" },
    { name: "Storytelling", description: "Lead with a narrative arc" },
    { name: "Listicle", description: "Numbered or bulleted breakdown" },
    { name: "Educational breakdown", description: "Teach a concept step-by-step" },
    { name: "Soft selling", description: "Indirect, value-led pitch" },
    { name: "Hard selling", description: "Direct, conversion-focused pitch" },
];

const hookTypes = [
    { name: "Curiosity hook", description: "Spark curiosity with unexpected questions or facts" },
    { name: "Pain point hook", description: "Address a specific pain point the audience experiences" },
    { name: "Data/stat hook", description: "Open with a striking statistic or data point" },
    { name: "Bold statement hook", description: "Make a bold, attention-grabbing statement" },
    { name: "Contrarian hook", description: "Take a counter-intuitive or against-the-grain stance" },
    { name: "Trend/culture hook", description: "Anchor the post to a current trend or cultural moment" },
    { name: "Relatable insight hook", description: "Voice a thought the audience already has" },
    { name: "Question hook", description: "Open with a direct question to the reader" },
    { name: "Urgency hook", description: "Create time pressure or fear of missing out" },
    { name: "How-to hook", description: "Promise a tactical, actionable outcome" },
];

const tonePresets = [
    { name: "Playful-Bold", description: "Fun and witty with a confident edge" },
    { name: "Warm-Expert", description: "Approachable but authoritative" },
    { name: "Direct-Urgent", description: "Punchy, action-oriented, time-pressured" },
    { name: "Soft-Emphatic", description: "Gentle, reassuring, emotionally resonant" },
];

const visualStyles = [
    { name: "Editorial", description: "Magazine-quality, considered composition and typography" },
    { name: "Lifestyle", description: "Aspirational, real-life scenarios, relatable" },
    { name: "Minimal", description: "Clean, simple, lots of white space" },
    { name: "Energetic", description: "Strong colors, high contrast, motion-forward" },
    { name: "Luxury", description: "Sophisticated, refined, premium feel" },
    { name: "Raw/Authentic", description: "Documentary, unpolished, candid" },
];
```

The `upsert({ where: { name }, update: {}, create })` shape stays. `update: {}` means re-running the seed won't overwrite admin edits to descriptions — only insert missing rows.

### Note on `Default Brand Tone`

Per Q1 from brainstorming, this is **not** a DB row. It's the empty-value placeholder on the Tone Variation dropdown. Selecting it sends `tonePresetId: null` (or omits the field), and the backend's existing default-tone logic kicks in. No service or route change.

## Migration

After the seed file change is committed:

```bash
cd backend
bun run prisma/seed.ts
```

The script is idempotent and safe to re-run.

## Testing

### Manual smoke

1. Run the seed script. Open Content Generator → Advanced. Verify all 11 frameworks, 10 hook types, 4 tone presets (with "Default Brand Tone" as the placeholder/empty option), and 6 visual styles render in their dropdowns.
2. Verify Output Length dropdown shows "Short (caption)", "Medium (Post)", "Long (Thread/Script)".
3. Verify Framework empty option reads "Default (AIDA)" and Hook Type empty option reads "Default (Curiosity)".
4. Submit a generation with the empty (default) selection on each dropdown — confirm a generation completes successfully (i.e. the backend handles `null`/missing values for these fields, which it already does).
5. Submit a generation with explicit selections — confirm the chosen items reach the prompt (no regression in existing behavior).

### Automated

No new automated tests. The seed script has no testable logic beyond the canonical-list contents themselves.

## Files

### Modified

- `backend/prisma/seed.ts` — replace four taxonomy arrays.
- `frontend/src/pages/GeneratePage.tsx` — update `OUTPUT_LENGTH_OPTIONS` labels and three dropdown placeholders.

### Not modified

- Prisma schema — no DB structure change.
- Admin Strategy Controls UI — already supports add/edit/remove on these tables.
- Generation service / topic service / AI prompt assembly — they already accept null/missing tone/visual-style/framework/hook-type ids.

## Rollout

Single PR. Backwards compatible:

- The seed file's `update: {}` keeps existing rows intact, so admin-edited descriptions on `AIDA`/`PAS`/`BAB`/`Curiosity` etc. are preserved.
- Frontend label changes are pure presentation; no callers depend on the placeholder strings.

## Open Questions

### Stale rows on environments that previously seeded the old lists

Some environments may have rows like "Professional" / "Bold Claim" / "Minimalist" left over from the prior seed. Because the upsert is keyed by `name`, those rows won't be deleted — they'll just sit alongside the new canonical entries and clutter the dropdowns.

**Decision:** Out of scope for this PR. The user's current environment has 0 rows in all four tables, so the issue doesn't apply here. If another environment surfaces stale rows, an admin can delete them via the existing Workspace Settings → Strategy Controls UI, or a one-shot SQL script can be added later.
