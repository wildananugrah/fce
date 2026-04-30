# Per-Page Language Override — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Frontend / Backend

## Problem

Three AI-using flows — Product Brain, Topic Generator, Content Generator — currently always use `brand.language` for their AI prompts. Users want to occasionally override that on a per-request basis (e.g. an Indonesian brand creating English content for an upcoming campaign) without changing the brand's stored default. The Brand Brain form already has a language picker; the other three pages don't.

## Goals

- Each of the three forms shows a language picker (ID / EN) defaulted to the active brand's `language`.
- Picking a different language on a form sends that language with the request and the AI uses it.
- Backend accepts the request's language when present and falls back to `brand.language` when absent — so any client that doesn't send the field continues to work.
- No change to `Brand.language` itself; the picker is a per-request override, not a setting.

## Non-Goals

- **Topic regenerate (single-topic)** continues to use `brand.language` automatically. Out of scope per brainstorming.
- **Adding more languages.** Picker stays ID / EN, matching the existing `ScrapeLanguageToggle` component.
- **Persisting the user's last-chosen override across sessions.** Defaults to brand language on every form mount.
- **A workspace-level default.** Brand-level remains the source of the per-form default.

## Architecture

Symmetric change across three forms + three backend services. Reuses the existing `ScrapeLanguageToggle` component. Backend follows the same pattern at every call site: `language: input.language ?? brand.language`.

## Frontend Changes

### Shared pattern (applies to all three forms)

- Add a `language` state with the active brand's language as initial value.
- `useEffect` watches the selected brand id; when it changes, reset `language` to the new brand's language. Explicit overrides are lost on brand-switch — acceptable because the user just changed context.
- The `ScrapeLanguageToggle` is bound to that state.
- Outgoing requests include `language` in their JSON body.

### `frontend/src/components/products/ProductForm.tsx`

- Toggle placed in the URL input row, on the right side, near the existing Cancel button. Visible always (not just while AI is running).
- Initial value: `brands.find(b => b.id === brandId)?.language ?? "indonesian"`.
- Sent in the body of both AI calls: `/products/scrape-preview` and `/products/generate-brain`.

### `frontend/src/pages/TopicsPage.tsx`

- Toggle placed in the topic-generation form, near the brand/product selectors.
- Initial value: active brand's `language`.
- Sent in the body of `/topics/generate`.

### `frontend/src/pages/GeneratePage.tsx`

- Toggle placed in the content-generation form, near the brand/product selectors.
- Initial value: active brand's `language`.
- Sent in the body of `/generations`.

## Backend Changes

Five call sites — all use the same `input.language ?? brand.language` pattern.

### `backend/src/routes/product.route.ts:85-103` (scrape-preview)

```diff
  const body = await c.req.json();
- const { url, urls, brandId } = body as {
+ const { url, urls, brandId, language: bodyLanguage } = body as {
    url?: string;
    urls?: string[];
    brandId?: string;
+   language?: string;
  };
  ...
  const result = await aiGenerator.scrapeProduct({
      urls: urlList,
-     language: brand.language,
+     language: bodyLanguage ?? brand.language,
      skillContext: skillResult.context,
  });
```

### `backend/src/routes/product.route.ts:174-195` (generate-brain)

Same pattern: read `body.language`; pass `body.language ?? brand.language` to the AI generator.

### `backend/src/services/topic.service.ts` (`generate()`)

The `GenerateTopicsInput` type gains an optional `language: string`:

```ts
export interface GenerateTopicsInput {
    brandId: string;
    productIds?: string[];
    platform?: string;
    objective?: string;
    formats?: string[];
    pillars?: string[];
    dateFrom?: string;
    dateTo?: string;
    count?: number;
    prompt?: string;
    referenceImages?: string[];
    language?: string;            // NEW
}
```

Inside `generate()`:

```diff
- const language = brand.language;
+ const language = input.language ?? brand.language;
```

`regenerate()` is **not touched** (out of scope).

The topic route at `/topics/generate` already passes `body` fields into `topicService.generate()`. Add `language: body.language` to the call.

### `backend/src/services/generation.service.ts:62` (content gen)

The create input gains an optional `language`:

```ts
// CreateGenerationInput type:
language?: string;
```

Inside `create()`:

```diff
- language: brand.language,
+ language: input.language ?? brand.language,
```

The generation route at `/generations` POST handler passes through the body — add `language: body.language` to the `generationService.create(...)` call.

## Testing

### Backend unit tests

Extend `backend/tests/services/topic.service.test.ts`:

- "uses input.language when provided" — pass `language: "english"` to `generate`; assert the boss-send payload's `language` is `"english"`.
- "falls back to brand.language when input.language is missing" — assert the payload's `language` matches the mock brand's language (`"en"`).

If `backend/tests/services/generation.service.test.ts` exists, add the same two cases there. If it doesn't exist, skip — backend test conventions are pragmatic.

No backend tests for the route layer (consistent with existing convention — routes don't have unit tests).

### Manual smoke

For each of the three pages:

1. Open a form for an Indonesian brand. Verify the toggle defaults to **ID**.
2. Switch to **EN** and submit. Verify the AI output is in English.
3. Reload the form. Verify it defaults back to **ID** (no persistence).
4. Switch the selected brand to one with `language: "english"`. Verify the toggle resets to **EN**.

## Files

### Modified

- `frontend/src/components/products/ProductForm.tsx`
- `frontend/src/pages/TopicsPage.tsx`
- `frontend/src/pages/GeneratePage.tsx`
- `backend/src/routes/product.route.ts`
- `backend/src/services/topic.service.ts`
- `backend/src/interfaces/services/topic.service.interface.ts` (if `GenerateTopicsInput` is defined there)
- `backend/src/services/generation.service.ts`
- `backend/src/interfaces/services/generation.service.interface.ts` (if the input type is defined there)
- `backend/src/routes/topic.route.ts` (pass `language: body.language` into `topicService.generate(...)`)
- `backend/src/routes/generation.route.ts` (pass `language: body.language` into `generationService.create(...)`)
- `backend/tests/services/topic.service.test.ts` (extend with the 2 new tests)

### Not modified

- `Brand` schema (no DB change).
- `ScrapeLanguageToggle` component (reused as-is).
- `BrandBrainForm` (already has its own language picker — different concern).
- `topic.service.ts:regenerate()` and `regeneratePreview()` (regen flows out of scope).

## Rollout

Single PR. Backwards-compatible at every layer:

- Backend accepts optional `language`; when omitted (older frontend), falls back to `brand.language`.
- Frontend always sends `language`; new behavior takes effect immediately on deploy.

No schema migration, no feature flag.

## Open Questions

None. Scope (bulk-only for topics) confirmed during brainstorming.
