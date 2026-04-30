# Strategy Controls — Move Taxonomy from DB to Config

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend

## Problem

Content Generator → Advanced surfaces five Strategy controls: Framework, Hook Type, Tone Variation, Visual Style, Output Length. Today:

- Framework / Hook Type / Tone Preset / Visual Style live in DB tables with admin CRUD UI under Admin Panel → Frameworks/Hook Types/Tone Presets/Visual Styles.
- The DB tables are currently empty in this environment, so all four dropdowns render with only the placeholder option visible.
- The seed file in [prisma/seed.ts](backend/prisma/seed.ts) carries an outdated, partial set of values that doesn't match the canonical taxonomy the user wants (e.g. seed has 3 frameworks; user wants 11).
- These taxonomies are not tenant-customizable in any meaningful sense — they're product-level taxonomy that should be controlled by engineering. The admin CRUD surface adds maintenance overhead (UI, routes, audit emit points, migrations) for no real benefit.

Additionally, two latent issues touched by this work:

- The current frontend default-fallbacks for the empty option send `framework: "PAS"` and `hookType: "curiosity"`, but the user's intent (per brainstorming) is "Default (AIDA)" / "Default (Curiosity)" labels — i.e. the default selection should be AIDA, not PAS.
- [generation.route.ts:35-36](backend/src/routes/generation.route.ts#L35-L36) reads `body.tonePreset` and `body.visualStyle`, but [GeneratePage.tsx:685-686](frontend/src/pages/GeneratePage.tsx#L685-L686) sends `tonePresetId` and `visualStyleId`. So the tone preset and visual style currently never reach the backend at all — they're silently dropped before the AI call. (Storage column is `tone_preset` text, no FK.)

## Goals

- Remove DB-backed admin management of the four taxonomies. Source the canonical lists from a single config file in `backend/src/config/`.
- Drop the four Prisma models (`Framework`, `HookType`, `TonePreset`, `VisualStyle`) and their tables.
- Remove the four admin tabs from the Admin Panel and the corresponding admin routes/services.
- `/api/taxonomy/*` endpoints continue to work (frontend untouched in shape) but read from config.
- Output Length labels and the dropdown placeholders ship in the same PR (small, related polish).
- Fix the `tonePresetId`/`visualStyleId` body-key bug so tone + visual style actually reach the backend.

## Non-Goals

- **Per-workspace overrides for these taxonomies.** Out of scope. If we ever need that, it's a separate design.
- **Migrating historical `GenerationRequest.framework` / `.hookType` / `.tonePreset` / `.visualStyle` string columns.** They remain as opaque strings (whatever was stored at gen time). Past values may be UUIDs or names; new values will be slugs. The columns are only used downstream as prompt strings, so this divergence is harmless.
- **Schema cleanup of the underlying `framework`/`hookType`/`tonePreset`/`visualStyle` columns on `GenerationRequest`.** They stay — services still need somewhere to record what was selected.

## Architecture

```
                 ┌────────────────────────────┐
                 │ src/config/                │
                 │   strategy-controls.ts     │  ← one source of truth
                 │   (FRAMEWORKS,             │
                 │    HOOK_TYPES,             │
                 │    TONE_PRESETS,           │
                 │    VISUAL_STYLES)          │
                 └──────────┬─────────────────┘
                            │
            ┌───────────────┴───────────────┐
            │                               │
   GET /api/taxonomy/*                Generation/Topic
   (route reads config                services consume
    directly, no service              the slug strings
    indirection)                      passed in body
```

The shape returned by `/api/taxonomy/*` stays `{ data: { id, name, description }[] }`. The `id` is a stable slug (e.g. `"aida"`, `"curiosity-hook"`). The frontend stores the slug in its `frameworkId`/`hookTypeId`/`tonePresetId`/`visualStyleId` state and submits the slug as `framework`/`hookType`/`tonePreset`/`visualStyle` in the request body.

Service-layer changes are all deletions: there is no need for a service or repository when the data lives in a const-export module. The route handler can `import` the arrays and respond directly.

## Backend Changes

### New: `backend/src/config/strategy-controls.ts`

```ts
// Centralised taxonomy for Content Generator → Advanced strategy controls.
// Edit this file to add/rename items; engineers control this set rather than
// admins via UI.

export interface StrategyControlItem {
    id: string;        // stable slug; persisted to GenerationRequest
    name: string;      // display label
    description: string;
}

export const FRAMEWORKS: readonly StrategyControlItem[] = [
    { id: "aida", name: "AIDA", description: "Attention, Interest, Desire, Action" },
    { id: "pas", name: "PAS", description: "Problem, Agitate, Solution" },
    { id: "bab", name: "BAB", description: "Before, After, Bridge" },
    { id: "4c", name: "4C", description: "Clear, Concise, Compelling, Credible" },
    { id: "fab", name: "FAB", description: "Features, Advantages, Benefits" },
    { id: "problem-solution", name: "Problem-Solution", description: "Identify a problem, then present the solution" },
    { id: "storytelling", name: "Storytelling", description: "Lead with a narrative arc" },
    { id: "listicle", name: "Listicle", description: "Numbered or bulleted breakdown" },
    { id: "educational-breakdown", name: "Educational breakdown", description: "Teach a concept step-by-step" },
    { id: "soft-selling", name: "Soft selling", description: "Indirect, value-led pitch" },
    { id: "hard-selling", name: "Hard selling", description: "Direct, conversion-focused pitch" },
];

export const HOOK_TYPES: readonly StrategyControlItem[] = [
    { id: "curiosity-hook", name: "Curiosity hook", description: "Spark curiosity with unexpected questions or facts" },
    { id: "pain-point-hook", name: "Pain point hook", description: "Address a specific pain point the audience experiences" },
    { id: "data-stat-hook", name: "Data/stat hook", description: "Open with a striking statistic or data point" },
    { id: "bold-statement-hook", name: "Bold statement hook", description: "Make a bold, attention-grabbing statement" },
    { id: "contrarian-hook", name: "Contrarian hook", description: "Take a counter-intuitive or against-the-grain stance" },
    { id: "trend-culture-hook", name: "Trend/culture hook", description: "Anchor the post to a current trend or cultural moment" },
    { id: "relatable-insight-hook", name: "Relatable insight hook", description: "Voice a thought the audience already has" },
    { id: "question-hook", name: "Question hook", description: "Open with a direct question to the reader" },
    { id: "urgency-hook", name: "Urgency hook", description: "Create time pressure or fear of missing out" },
    { id: "how-to-hook", name: "How-to hook", description: "Promise a tactical, actionable outcome" },
];

export const TONE_PRESETS: readonly StrategyControlItem[] = [
    { id: "playful-bold", name: "Playful-Bold", description: "Fun and witty with a confident edge" },
    { id: "warm-expert", name: "Warm-Expert", description: "Approachable but authoritative" },
    { id: "direct-urgent", name: "Direct-Urgent", description: "Punchy, action-oriented, time-pressured" },
    { id: "soft-emphatic", name: "Soft-Emphatic", description: "Gentle, reassuring, emotionally resonant" },
];

export const VISUAL_STYLES: readonly StrategyControlItem[] = [
    { id: "editorial", name: "Editorial", description: "Magazine-quality, considered composition and typography" },
    { id: "lifestyle", name: "Lifestyle", description: "Aspirational, real-life scenarios, relatable" },
    { id: "minimal", name: "Minimal", description: "Clean, simple, lots of white space" },
    { id: "energetic", name: "Energetic", description: "Strong colors, high contrast, motion-forward" },
    { id: "luxury", name: "Luxury", description: "Sophisticated, refined, premium feel" },
    { id: "raw-authentic", name: "Raw/Authentic", description: "Documentary, unpolished, candid" },
];
```

### Rewrite: `backend/src/routes/taxonomy.route.ts`

```ts
import { Hono } from "hono";
import {
    FRAMEWORKS,
    HOOK_TYPES,
    TONE_PRESETS,
    VISUAL_STYLES,
} from "../config/strategy-controls";

export function createTaxonomyRoutes() {
    const app = new Hono();

    app.get("/frameworks", (c) => c.json({ data: FRAMEWORKS }));
    app.get("/hook-types", (c) => c.json({ data: HOOK_TYPES }));
    app.get("/tone-presets", (c) => c.json({ data: TONE_PRESETS }));
    app.get("/visual-styles", (c) => c.json({ data: VISUAL_STYLES }));

    return app;
}
```

The function signature changes — no longer takes `taxonomyService`. The composition root in [src/index.ts](backend/src/index.ts) calls `createTaxonomyRoutes()` with no args.

### Delete

- `backend/src/services/taxonomy.service.ts`
- `backend/src/repositories/taxonomy.repository.ts`
- `backend/src/interfaces/services/taxonomy.service.interface.ts`
- `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`

Remove their wiring from `src/index.ts` (factory creation, dependency injection into the route).

### Modify: `backend/src/services/admin.service.ts`

Delete `createTaxonomyItem`, `updateTaxonomyItem`, `deleteTaxonomyItem`, `getModel`, `TAXONOMY_ENTITY_TYPE` (lines 265–357). Removes 6 audit emit points (`taxonomy.create`, `taxonomy.update`, `taxonomy.delete` × 4 types, deduped). Update `AdminService`'s constructor signature only if needed (no other callers of these methods exist outside `admin.route.ts`).

### Modify: `backend/src/routes/admin.route.ts`

Delete the taxonomy CRUD block at lines 105–134 (the `for (const route of taxonomyTypes)` loop and its `typeMap`).

### Modify: `backend/prisma/schema.prisma`

Delete the four model declarations (lines 340–374). Run `bunx prisma db push` to drop the underlying tables.

### Modify: `backend/prisma/seed.ts`

Delete the four taxonomy arrays + their upsert loops. Seed file becomes a no-op for taxonomy. (If the seed file ends up empty after this, leave it as a stub with the disconnect logic — it may be used for future seeding work.)

### Modify: `backend/src/routes/generation.route.ts`

No content change to the route — it already reads `body.tonePreset` and `body.visualStyle`. The bug is on the frontend; backend stays.

## Frontend Changes

### `frontend/src/pages/AdminPage.tsx`

- Remove the four tab entries at lines 47–50 (`{ key: "frameworks", … }` etc).
- Remove the `taxonomyItems` state, the `/api/taxonomy/${tab}` fetch, and the `/api/admin/taxonomy/...` POST/PATCH/DELETE handlers (lines around 60, 99, 116, 131).
- Remove the taxonomy table render block at line 265.
- After removal, the Admin Panel should show only the **Users** and **Audit Logs** tabs.
- Update the page subtitle if it currently reads "Manage users, taxonomy data, and view audit logs" to "Manage users and view audit logs".

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

#### Submission body — fix the dropped fields (lines 679–686)

```diff
- framework: frameworkId || "PAS",
- hookType: hookTypeId || "curiosity",
+ framework: frameworkId || "aida",
+ hookType: hookTypeId || "curiosity-hook",
  customPrompt: customPrompt.trim() || undefined,
  referenceImages: …,
- tonePresetId: tonePresetId || undefined,
- visualStyleId: visualStyleId || undefined,
+ tonePreset: tonePresetId || undefined,
+ visualStyle: visualStyleId || undefined,
```

The two `Id` state variable names stay (they hold slugs, but renaming them is cosmetic and would touch unrelated lines). What matters is the submission key matches what [generation.route.ts:35-36](backend/src/routes/generation.route.ts#L35-L36) reads.

The default fallback strings change:
- `"PAS"` → `"aida"` (matches "Default (AIDA)" placeholder).
- `"curiosity"` → `"curiosity-hook"` (slug-consistent with `HOOK_TYPES`).

#### Strategy dropdown placeholders (lines 719–722)

```diff
- const frameworkOptions = [{ value: "", label: "PAS (recommended)" }, ...frameworks.map(...)];
- const hookTypeOptions = [{ value: "", label: "Curiosity (recommended)" }, ...hookTypes.map(...)];
- const tonePresetOptions = [{ value: "", label: "Select Tone Variation" }, ...tonePresets.map(...)];
- const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map(...)];
+ const frameworkOptions = [{ value: "", label: "Default (AIDA)" }, ...frameworks.map(...)];
+ const hookTypeOptions = [{ value: "", label: "Default (Curiosity)" }, ...hookTypes.map(...)];
+ const tonePresetOptions = [{ value: "", label: "Default Brand Tone" }, ...tonePresets.map(...)];
+ const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map(...)];
```

The empty-value `""` continues to mean "no override; backend uses defaults".

## Migration

After the schema + seed changes are committed:

```bash
cd backend
bunx prisma db push                  # drops framework/hook_types/tone_presets/visual_styles tables
bunx prisma generate                 # regenerate Prisma client (no more prisma.framework etc.)
```

No data migration script. The four DB tables had 0 rows in this environment, and any non-empty environment is acceptable to drop because nothing FKs into them.

The existing `audit_logs` rows whose `entityType` is `framework` / `hook_type` / `tone_preset` / `visual_style` remain in place — they're historical records and harmless. Future audit reads will simply not see new rows of those types.

## Testing

### Backend unit tests

- Delete `backend/tests/services/taxonomy.service.test.ts` (the service it tests no longer exists).
- In `backend/tests/services/admin.service.audit.test.ts`, delete the three tests "emits taxonomy.create…", "emits taxonomy.update…", "emits taxonomy.delete…" (lines ~230/251/278) — those code paths no longer exist.
- Optional: add `backend/tests/routes/taxonomy.route.test.ts` with one assertion per endpoint: GET returns 200 with `data` array of length matching the config (11/10/4/6). Cheap regression guard against accidental config edits. (`tests/routes/skill-list.route.test.ts` is the existing precedent for route-layer tests.)

### Manual smoke

1. Open Content Generator → Advanced. Verify all 11 frameworks, 10 hook types, 4 tone presets, 6 visual styles render in their dropdowns.
2. Verify Output Length dropdown shows "Short (caption)", "Medium (Post)", "Long (Thread/Script)".
3. Verify Framework empty placeholder reads "Default (AIDA)" and Hook Type empty placeholder reads "Default (Curiosity)".
4. Submit a generation with explicit Tone and Visual Style picked. Inspect the resulting `GenerationRequest` row (or AI call payload) and confirm the chosen slug strings appear in `tonePreset` and `visualStyle` (the bug-fix verification).
5. Submit a generation with all four left at default. Confirm a generation completes and `framework` is `"aida"`, `hookType` is `"curiosity-hook"`, `tonePreset` and `visualStyle` are null.
6. Open Admin Panel. Confirm only **Users** and **Audit Logs** tabs are visible — no Frameworks / Hook Types / Tone Presets / Visual Styles tabs.
7. `curl http://localhost:3001/api/taxonomy/frameworks` (with auth) returns `{ data: [...11 items...] }`.

## Files

### Created

- `backend/src/config/strategy-controls.ts`

### Modified

- `backend/src/routes/taxonomy.route.ts` — read from config, drop service param.
- `backend/src/index.ts` — drop taxonomy service/repo wiring; call `createTaxonomyRoutes()` with no args.
- `backend/src/services/admin.service.ts` — drop taxonomy CRUD methods + `getModel` + `TAXONOMY_ENTITY_TYPE`.
- `backend/src/routes/admin.route.ts` — drop the `/admin/taxonomy/*` route block.
- `backend/prisma/schema.prisma` — drop four models.
- `backend/prisma/seed.ts` — drop four taxonomy arrays + loops.
- `frontend/src/pages/AdminPage.tsx` — drop four tabs + their state, fetch, mutation, and render block; update subtitle.
- `frontend/src/pages/GeneratePage.tsx` — Output Length labels; placeholders; submission body keys + default fallbacks.

### Deleted

- `backend/src/services/taxonomy.service.ts`
- `backend/src/repositories/taxonomy.repository.ts`
- `backend/src/interfaces/services/taxonomy.service.interface.ts`
- `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`
- `backend/tests/services/taxonomy.service.test.ts`
- (Trimmed) the three taxonomy.create/update/delete tests in `backend/tests/services/admin.service.audit.test.ts`

### Not modified

- `backend/src/services/generation.service.ts` — still reads/writes string columns, no change.
- `backend/src/routes/generation.route.ts` — already reads correct body keys.
- `GenerationRequest` schema — keeps `framework`/`hookType`/`tonePreset`/`visualStyle` text columns.

## Rollout

Single PR, no feature flag. The path is:

1. Land the backend config + route rewrite + admin/service deletions + schema model deletions.
2. `prisma db push` drops the tables.
3. Frontend updates ship together so the Admin Panel doesn't try to fetch `/api/admin/taxonomy/*` after the routes are gone.

Backwards compat: `/api/taxonomy/*` shape is preserved, so older frontend bundles served briefly during deploy continue to render dropdowns. Older bundles still POST `tonePresetId`/`visualStyleId` and lose those fields — this is unchanged from today's broken behavior, so no regression.

## Open Questions

None.
