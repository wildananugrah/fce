# Auto-fill Language Selector (Brand & Product)

**Status:** Approved — ready for planning
**Date:** 2026-04-15

## Problem

Brand and Product pages have an "Auto-fill" button that scrapes a URL and runs the result through an AI provider to populate form fields. The output language is currently hardcoded to Indonesian (via the `languageDirective()` default in `backend/src/providers/anthropic.provider.ts` and `gemini.provider.ts`). Users who work in English cannot get English auto-fill output without editing code.

## Goal

Let each user pick their preferred auto-fill language (Bahasa Indonesia or English) as a profile default, and let them override it per-click with a toggle next to the Auto-fill button on the brand and product forms.

## Non-goals

- Languages other than Indonesian and English (YAGNI — easy to extend later since the provider already accepts an arbitrary string).
- Workspace-level default (explicitly rejected in favor of per-user preference, so an Indonesian user in an English-speaking team still gets Bahasa).
- Applying the language setting to other AI features (content generation, topic generation, campaign generation). Scope is strictly brand/product auto-fill.

## Current state

The backend is already partially wired:

- `backend/src/routes/brand.route.ts:66` `POST /scrape-preview` reads `language` from the request body and forwards it to `brandScraper.scrape({ url, language })`.
- `backend/src/routes/product.route.ts:57` `POST /scrape-preview` reads `language` and forwards it to `aiGenerator.scrapeProduct({ urls, language })`.
- `backend/src/providers/anthropic.provider.ts:29` and `backend/src/providers/gemini.provider.ts:35` define `languageDirective(language?: string)` which defaults to `"indonesian"` and injects a sentence into the prompt.
- `backend/src/interfaces/providers/brand-scraper.interface.ts` documents the `language` field.

The frontend does **not** send `language`:

- `frontend/src/components/brands/NewBrandBrainDrawer.tsx:405` posts `{ url: form.websiteUrl.trim() }`.
- `frontend/src/components/products/ProductForm.tsx:87` posts without language.

So the change is primarily a frontend change plus one new user-profile field.

## Design

### Data model

Add one column to the `User` table via a Prisma migration:

```prisma
model User {
  // ...existing fields
  defaultScrapeLanguage String @default("indonesian") // "indonesian" | "english"
}
```

Default `"indonesian"` preserves current behavior for every existing user until they opt in.

### Backend changes

1. **Prisma migration** — add `defaultScrapeLanguage` to `User` with default `"indonesian"`.
2. **`/me` response** — include `defaultScrapeLanguage` wherever the current user object is returned (auth login response, `/me` endpoint, token refresh if it echoes the user).
3. **Profile update endpoint** — accept `defaultScrapeLanguage` in the profile PATCH body. Validate it against the allowed set `["indonesian", "english"]`; reject anything else with a 400.
4. **`scrape-preview` routes** — no code change. They already forward `language` when present, and the provider's `"indonesian"` fallback handles the case where the frontend happens not to send one.

### Frontend changes

1. **`AuthContext`** — extend the user type with `defaultScrapeLanguage: "indonesian" | "english"` so any component can read it without an extra fetch.
2. **Profile page** — add a "Default auto-fill language" select with two options (Bahasa Indonesia, English). On save, PATCH the profile endpoint and update `AuthContext`.
3. **`NewBrandBrainDrawer.tsx`** — add a small segmented toggle (ID / EN) immediately next to the Auto-fill button. Initial value reads from `user.defaultScrapeLanguage`. On Auto-fill click, include the current toggle value as `language` in the POST body to `/brands/scrape-preview`.
4. **`ProductForm.tsx`** — same segmented toggle next to its Auto-fill button, same behavior, posts to `/products/scrape-preview`.

The inline toggle is component-local state; it does **not** write back to the profile. The profile setting is the sticky default; the toggle is a per-click override.

### Error handling

- Invalid `defaultScrapeLanguage` values from the profile update endpoint → 400 with a clear message.
- Scrape-preview itself is unchanged — any scrape/AI errors still surface the same way as today.

### Testing

- **Backend unit test** — profile update endpoint: (a) accepts `"indonesian"`, (b) accepts `"english"`, (c) rejects `"french"` with 400, (d) persists the value.
- **Manual frontend verification** —
  1. Profile change persists across reload.
  2. Opening `NewBrandBrainDrawer` initializes the toggle to the profile value.
  3. Flipping the toggle to EN and clicking Auto-fill produces English output in the form fields.
  4. Same three checks for `ProductForm`.

No new frontend test infrastructure is needed.

## Out of scope

- Adding more languages (Spanish, etc.).
- Workspace-level default or organization default.
- Language selection for content/topic/campaign generation.
- Localizing the FCE UI itself (this is about AI output language, not UI strings).
