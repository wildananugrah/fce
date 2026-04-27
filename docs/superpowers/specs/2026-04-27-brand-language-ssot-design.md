# Brand Language as Single Source of Truth — Design

**Date:** 2026-04-27
**Status:** Proposed

## Problem

Today's UI exposes a language toggle in four places: the Brand Brain form (Indonesian/English for auto-fill scraping), the Product form (for product brain auto-fill), the Generate Content page (output language for the post), and the Topic Generator page (output language for topics). Users have to set the same answer four times. They sometimes pick mismatched languages — Indonesian brand scrape, English topic, Indonesian content — producing inconsistent voice across the funnel.

## Goal

The brand owns its language. The toggle on the Brand Brain form sets `Brand.language` once, at brand creation. From then on, every downstream generator (Product brain auto-fill, Topic Generator, Content Generator) reads the brand's language and uses it without prompting the user. The toggles on the Product / Topic / Generate forms are removed entirely.

## Non-goals

- **Per-generation override.** The user explicitly chose strict inheritance — no escape hatch. If a brand needs different language, the toggle on Brand Brain is the only place to change it.
- **Auto-detecting brand language from website content during scrape.** The toggle is the source of truth; if the user picks the wrong one and the auto-fill returns awkward content, they correct manually.
- **Migrating historical `GenerationRequest.language` values.** Those rows are audit records of what was used at the time. They stay as-is.
- **Adding more languages beyond `indonesian`/`english`.** The existing toggle is binary; widening the supported set is a separate feature.
- **Per-product language override.**
- **Renaming the existing `defaultScrapeLanguage` field on `User`.** It stays as a per-user UI default — pre-selects the toggle when creating a NEW brand. Once a brand exists, the brand owns its language.
- **Renaming the existing `GenerationRequest.language` column.** It keeps recording what language was used per request, just sourced from the brand instead of the user input. (Topic generation passes `language` only as an input type, not a database column — the field on `TopicGenerationInput` stays internal.)

## Architecture

### Data model

Add one column to `Brand` in `backend/prisma/schema.prisma`:

```prisma
model Brand {
  // ...existing fields...
  language String @default("indonesian")
  // ...existing relations + indexes...
}
```

**Value format:** matches the existing `User.defaultScrapeLanguage` long-form (`"indonesian" | "english"`), which is what the frontend `<ScrapeLanguageToggle>` already emits. The mismatch with `GenerationRequest.language` (`"id"` short form) stays — the wire format used by the AI prompt builder is preserved by the existing conversion layer (wherever the long form gets translated to short before being stored on the request row).

**Default:** `"indonesian"` for newly-created brands at the DB level. Existing brands get `"indonesian"` automatically on Prisma `db push` — same as if they had been created today. Users who want English on an existing brand flip the toggle once.

### UI changes

**Brand Brain form (`frontend/src/components/brands/BrandBrainForm.tsx`):**

The `<ScrapeLanguageToggle>` next to "Auto-fill from Website" already exists. It currently controls only the auto-fill scrape language. After this change, its value also becomes the brand's persistent `language` and is written to the Brand row when saved. Same toggle, no UI restructuring — only its meaning expands.

On edit of an existing brand, the toggle pre-selects from `brand.language`.

**Product form (`frontend/src/components/products/ProductForm.tsx`):**

Remove the language toggle. Remove `language` from the auto-fill request payload — the backend reads it from the parent brand at `scrapeProduct` time.

**Generate Content page (`frontend/src/pages/GeneratePage.tsx`):**

Remove the language picker (lines ~397, ~666, ~1022). Remove `language` from the POST payload to `/generations`. Optional polish: render a read-only chip near the brand selector — `Language: 🇮🇩 Indonesian` or `Language: 🇬🇧 English` — so users see what they'll get.

**Topic Generator page (`frontend/src/pages/TopicsPage.tsx`):**

Remove the language picker (lines ~132, ~296, ~345, ~665). Remove `language` from the POST payload. Same optional read-only chip.

**User profile (`SettingsPage`):**

Untouched. `User.defaultScrapeLanguage` stays — it pre-selects the brand brain toggle when the user creates their NEXT brand. Existing brands aren't affected.

### Backend wiring

**Brand service:**

```ts
// CreateBrandInput in backend/src/types/brand.types.ts
interface CreateBrandInput {
  // ...existing fields...
  language: "indonesian" | "english";
}

// UpdateBrandInput
interface UpdateBrandInput {
  // ...existing fields...
  language?: "indonesian" | "english";
}
```

`BrandService.create` writes `language` to the Brand row. `BrandService.update` accepts an optional `language` so the Brand Brain form's toggle can update it on edit.

**Generation service / job (`backend/src/jobs/content-generation.job.ts`):**

The route handler stops accepting `language` from the request body. Inside the job, after the existing brand/product fetch, read `brand.language` and pass it into the existing prompt-builder `input.language` slot. `generationRepository.create(...)` still writes `language` to the request row (audit) — sourced from the brand.

**Topic generation jobs (`backend/src/jobs/topic-generation.job.ts`, `backend/src/jobs/topic-regeneration.job.ts`):**

Same pattern. Job loads brand by `input.brandId`, reads `brand.language`, passes it into `buildTopicGenerationPrompt(...)`. Route handler stops accepting `language`.

**Product brain auto-fill (`scrapeProduct`, `generateProductBrain` on the AI providers):**

These are called from the Product form's "Auto-fill from URL" / "Generate with AI" actions. The product service fetches the parent brand and passes `brand.language` to the provider call. Frontend doesn't send `language` anymore.

**Brand brain auto-fill (`scrape`):**

Special case — there's no Brand row yet at scrape time (the "Auto-fill from Website" button on the New Brand page fires before any save). The toggle's value comes directly from the form state. After the user clicks Save, that same value persists on the new `Brand.language` row. The scrape provider doesn't change; only the brand creation route plumbs the toggle value into both the scrape call AND the Brand insert.

### Type changes summary

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | + `Brand.language` column |
| `backend/src/types/brand.types.ts` | + `language` on `CreateBrandInput` and `UpdateBrandInput` |
| `backend/src/types/generation.types.ts` | `language?: string` becomes internal-only (no longer from request body) |
| `backend/src/types/topic.types.ts` | same |
| `backend/src/services/brand.service.ts` | wire `language` through create + update |
| `backend/src/services/generation.service.ts` | read `language` from brand inside job, not from input |
| `backend/src/services/topic.service.ts` | same |
| `backend/src/services/product.service.ts` | read `language` from parent brand for auto-fill / brain generation |
| `backend/src/routes/generation.route.ts` | drop `language` from request body validation |
| `backend/src/routes/topic.route.ts` | same |
| `backend/src/routes/product.route.ts` | drop `language` from product auto-fill body |
| `frontend/src/services/brand.service.ts` | + `language` field on Brand type and create/update payloads |
| `frontend/src/components/brands/BrandBrainForm.tsx` | persist toggle to brand on save; pre-select from brand on edit |
| `frontend/src/components/products/ProductForm.tsx` | remove toggle; drop `language` from payloads |
| `frontend/src/pages/GeneratePage.tsx` | remove picker; drop from payload; add read-only chip |
| `frontend/src/pages/TopicsPage.tsx` | same |

## Edge cases

| Scenario | Behavior |
|---|---|
| Brand created before this feature ships | Gets `language: "indonesian"` via Prisma default. If the brand is actually English, user opens Brand Brain → flips toggle → saves. One-time correction per brand. |
| User's `User.defaultScrapeLanguage = "english"` | Pre-selects the toggle to English when creating their NEXT brand. Existing brands aren't touched. |
| Generate request without a selected product/brand | Form already requires a product/brand before submission; nothing changes. |
| Brand language changed mid-workflow | Job reads brand language at job-start time, not at job-execution time. If user flips the toggle while a job is queued, the queued job uses the OLD value (snapshotted at enqueue). Acceptable; alternative is locking the brand which is overkill. |
| Topic generator with products from multiple brands | Job groups topics by brand and uses each brand's language per group. Already implicit because the prompt is built per-brand. |
| Stale frontend sends `language` in the body | Backend ignores it (defensive). The brand value wins. Documented in the route handler so future-self knows it's intentional. |
| Brand Brain edit form opens before this feature ships in the frontend, but backend is updated | Toggle still functions for scrape-language purposes (existing behavior). Backend stores whatever the toggle value is on save. No regression. |

## Testing

- **Backend unit tests** in existing service test files:
  - `BrandService.create` writes the `language` field with the expected default.
  - `BrandService.update` updates `language` when supplied.
  - `GenerationService` (or job test) ignores leftover `language` in input and uses the brand's value (defensive).
  - `TopicService` / topic-generation job same.
  - `ProductService` auto-fill uses the parent brand's language.
- **Manual smoke**:
  - Create a new brand with toggle set to `english`. Auto-fill from a public English website. Save. Verify `brand.language` row in DB.
  - Generate a content for that brand → output is English.
  - Open the brand, flip toggle to `indonesian`, save. Generate another content → output is Indonesian.
  - Generate a topic for that brand. Output is Indonesian.
  - Confirm the language picker has been removed from `/generate`, `/topics`, and the Product form.
  - Existing brand (with default `indonesian`) → unchanged behavior.
- No new test infrastructure.

## Rollout

1. Prisma migration (one nullable-default-supplied column — additive, safe).
2. Backend code: wire brand language into all generators, drop `language` from request body validation. Backend deployed BEFORE frontend.
3. Frontend code: remove pickers, persist toggle on Brand form. Frontend deployed AFTER backend.

If frontend ships before backend (out of order), the form would stop sending `language` and the backend would still expect it — generation would fail validation. Avoiding this means staging backend first OR shipping both in the same deploy. Same-deploy is the FCE pattern; flagging it for completeness.

No data backfill required. Every existing brand gets `"indonesian"` from Prisma's default. Users who want English on an existing brand flip the toggle once.

## YAGNI / deferred

- Per-generation override.
- Auto-detect language from scraped content.
- More than two languages.
- Per-product language.
- Migrating historical `GenerationRequest.language` to match the new `Brand.language`. They're audit records.
- A "language was changed" event log on the brand. If users want to know when language changed, the brain version log already records edits to the brand brain.
- Cross-language warnings (e.g., "your brand is Indonesian but the URL inspiration is English — proceed?"). Possible follow-up if it becomes a real problem.
