# Brand Language SSOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Brand.language` the single source of truth. Remove the language toggle from the Generate / Topic / Product forms entirely; downstream generators read the brand's language and use it without prompting the user.

**Architecture:** One new column on `Brand`. Brand Brain form's existing `<ScrapeLanguageToggle>` does double duty (scrape language + brand language). Generation, topic, and product brain flows fetch the brand at job/service entry and use `brand.language`. Request bodies stop carrying `language`; backend ignores the field defensively in case stale frontend code sends it.

**Tech Stack:** TypeScript, Bun, Hono, Prisma 7, PostgreSQL (backend); React 19, Vite 8, Tailwind 4 (frontend). No new dependencies.

Spec: `docs/superpowers/specs/2026-04-27-brand-language-ssot-design.md`

---

## File Structure

**Modify (backend):**
- `backend/prisma/schema.prisma` — `Brand.language` column.
- `backend/src/types/brand.types.ts` — `language` on `CreateBrandInput` and `UpdateBrandInput`.
- `backend/src/repositories/brand.repository.ts` — `create` accepts `language`; `update`'s `Pick<>` includes `"language"`.
- `backend/src/services/brand.service.ts` — `create` passes `language` to repo; `update` does too.
- `backend/src/routes/brand.route.ts` — `language` is read from body for create + update.
- `backend/src/services/generation.service.ts` — `create()` reads brand language inside the service (not from input) and writes it to the request row.
- `backend/src/routes/generation.route.ts` — drop `language` from body parse.
- `backend/src/services/topic.service.ts` — `generate()` reads brand language inside the service.
- `backend/src/routes/topic.route.ts` — drop `language` from body parse for both `/generate` and `/regenerate-preview`.
- `backend/src/routes/product.route.ts` — drop `language` from body parse for `/scrape-preview` and `/generate-brain`; load brand and pass `brand.language` into the AI provider call.
- `backend/src/services/product.service.ts` — if it touches `scrapeProduct` or `generateProductBrain`, route the language from the parent brand. (Verify path during impl.)

**Modify (frontend):**
- `frontend/src/components/brands/BrandBrainForm.tsx` — persist toggle into `language` on save; pre-select from `brand.language` on edit.
- `frontend/src/services/brand.service.ts` (or the file that defines the Brand type for the frontend) — add `language: "indonesian" | "english"` to the Brand type and create/update payloads.
- `frontend/src/components/products/ProductForm.tsx` — remove language toggle; drop `language` from the `/scrape-preview` and `/generate-brain` POST payloads.
- `frontend/src/pages/GeneratePage.tsx` — remove language picker (lines ~397, ~666, ~1022); drop `language` from POST body.
- `frontend/src/pages/TopicsPage.tsx` — remove language picker (lines ~132, ~296, ~345, ~665); drop `language` from POST body.

**Optional polish (deferred unless requested):**
- A read-only `Language: 🇮🇩 Indonesian` chip near the brand selector on Generate / Topics / Product forms — flagged in spec, omitted from this plan to keep scope tight.

---

## Task 1: Schema migration — `Brand.language`

**Files:**
- Modify: `backend/prisma/schema.prisma` (Brand model)

- [ ] **Step 1: Add the column**

In `backend/prisma/schema.prisma`, locate `model Brand`. Add a `language` field alongside the existing fields (anywhere is fine; convention is near `category`):

```prisma
  language             String    @default("indonesian")
```

Use long-form values (`"indonesian" | "english"`) to match the existing `User.defaultScrapeLanguage` and the frontend `<ScrapeLanguageToggle>` output. The mismatch with `GenerationRequest.language` (`"id"` short form) stays — that column records what the AI saw, not what the brand declares.

- [ ] **Step 2: Push the schema**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Verify the column**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'brands' AND column_name = 'language';"
```

Expected: one row, `text`, default `'indonesian'::text`.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(db): add language column to Brand

Default 'indonesian' (matches User.defaultScrapeLanguage long form).
This becomes the single source of truth for language across the
generation funnel — Generate Content / Topic / Product all read
it instead of prompting the user."
```

---

## Task 2: Brand wiring — types + repo + service + route

**Files:**
- Modify: `backend/src/types/brand.types.ts`
- Modify: `backend/src/repositories/brand.repository.ts`
- Modify: `backend/src/services/brand.service.ts`
- Modify: `backend/src/routes/brand.route.ts`

- [ ] **Step 1: Extend the input types**

In `backend/src/types/brand.types.ts`:

```ts
export interface CreateBrandInput {
	name: string;
	slug: string;
	category?: string;
	websiteUrl?: string;
	projectId?: string;
	language?: "indonesian" | "english";
}

export interface UpdateBrandInput {
	name?: string;
	category?: string;
	websiteUrl?: string;
	status?: string;
	language?: "indonesian" | "english";
}
```

`language` is optional so existing call sites keep working — the DB default (`"indonesian"`) covers the create case when a caller doesn't supply it.

- [ ] **Step 2: Update the repository's create signature**

In `backend/src/repositories/brand.repository.ts`, find the `async create(data: { ... })` block (around line 70). Add `language?: string` to the data object:

```ts
	async create(data: {
		workspaceId: string;
		projectId?: string | null;
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
		language?: string;
	}): Promise<Brand> {
		return this.prisma.brand.create({ data });
	}
```

The repo passes `data` straight to Prisma — the new field flows through transparently because Prisma's generated client already knows about `Brand.language` after the Task 1 migration + `prisma generate`.

- [ ] **Step 3: Update the repository's update Pick**

In the same file, find `async update(id, data)`. The current Pick is:

```ts
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId">
		>,
```

Add `"language"`:

```ts
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId" | "language">
		>,
```

- [ ] **Step 4: Pass `language` through the service create**

In `backend/src/services/brand.service.ts`, locate `BrandService.create(workspaceId, input)`. The current `brandRepository.create({ ... })` call passes `name`, `slug`, etc. Add `language: input.language` so it flows through:

```ts
			return await this.brandRepository.create({
				workspaceId,
				projectId,
				name: input.name,
				slug: input.slug,
				category: input.category,
				websiteUrl: input.websiteUrl,
				language: input.language,
			});
```

For `BrandService.update`, the current implementation is:

```ts
	async update(id: string, input: UpdateBrandInput): Promise<Brand> {
		return this.brandRepository.update(id, input);
	}
```

This already passes the whole input through; with the new `language` on `UpdateBrandInput`, it'll just work. No change needed in this method.

- [ ] **Step 5: Read `language` from request body in the brand route**

In `backend/src/routes/brand.route.ts`, find the POST handler that creates a brand. The body is destructured (or accessed) for fields like `name`, `slug`, `category`, `websiteUrl`. Add `language` to the destructure and to the `BrandService.create` call. Same for the PATCH/PUT handler that updates a brand.

The exact code shape depends on how the route is written today — read it first, then add `language` symmetrically with how `category` or `websiteUrl` are handled.

- [ ] **Step 6: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline as before this work began (typically 8). Run the full test suite once at the end to confirm no breakage:

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: same baseline (181 pass / 1 fail or whatever the current main shows).

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/types/brand.types.ts \
        backend/src/repositories/brand.repository.ts \
        backend/src/services/brand.service.ts \
        backend/src/routes/brand.route.ts
git commit -m "feat(backend): wire language through Brand create + update

CreateBrandInput and UpdateBrandInput accept optional language.
Repo passes it to Prisma; service plumbs it through; route reads
it from the request body. Database default 'indonesian' covers
existing brands and absent-input cases."
```

---

## Task 3: Generation flow — language sourced from brand

**Files:**
- Modify: `backend/src/services/generation.service.ts`
- Modify: `backend/src/routes/generation.route.ts`
- Modify: `backend/src/types/generation.types.ts`

- [ ] **Step 1: Drop `language` from the route body parse**

In `backend/src/routes/generation.route.ts`, find the POST handler around line 29:

```ts
			language: body.language,
```

Remove that line (or leave it as `undefined` — see Step 2). The simplest is to delete it; the service will ignore any leftover input.language anyway.

- [ ] **Step 2: Service fetches brand language**

In `backend/src/services/generation.service.ts`, locate `create(workspaceId, input)` (around line 50ish). The current line reads:

```ts
			language: input.language || "id",
```

Replace it. The service must fetch the brand by `input.brandId` and use `brand.language`. Existing services in this codebase already inject `prisma` (or a brand repository); read the constructor to see what's available. Common shape:

```ts
		const brand = await this.prisma.brand.findUnique({
			where: { id: input.brandId },
			select: { language: true },
		});
		if (!brand) throw new Error("Brand not found");
		const language = brand.language;
```

…and then use `language` in the existing `generationRepository.create` call:

```ts
		const request = await this.generationRepository.create({
			// ...other fields...
			language,
			// ...
		});
```

If `GenerationService` doesn't yet have a `prisma` dependency injected, see how other services nearby (e.g., `dashboard.service.ts`) take `prisma` and follow that pattern. Pick the smaller path of least resistance — if there's an existing brand fetch nearby (e.g., for permission checks), reuse it.

- [ ] **Step 3: Mark `language` internal-only on the input type**

In `backend/src/types/generation.types.ts`, the existing line is:

```ts
	language?: string;
```

Add a comment so future readers know not to expose this on the request body:

```ts
	/** @internal — sourced from brand.language inside the service, NOT from request body. */
	language?: string;
```

The field stays on the type because the service uses it internally to pass through to the repo. Just the source changes.

- [ ] **Step 4: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: same baseline.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/generation.route.ts \
        backend/src/services/generation.service.ts \
        backend/src/types/generation.types.ts
git commit -m "feat(backend): generation reads language from brand, not request body

Route stops parsing language; service fetches brand.language and
uses it for the GenerationRequest row + downstream prompt building.
The internal language field on CreateGenerationInput stays — just
sourced internally now."
```

---

## Task 4: Topic generation flow — language sourced from brand

**Files:**
- Modify: `backend/src/services/topic.service.ts`
- Modify: `backend/src/routes/topic.route.ts`
- Modify: `backend/src/types/topic.types.ts`

- [ ] **Step 1: Drop `language` from topic.route.ts body parses**

In `backend/src/routes/topic.route.ts`, find both handlers:

- POST `/generate` (around line 55-86) — destructures `language` from body and passes it into `topicService.generate`. Remove the destructure line and the field from the call.
- POST `/regenerate-preview` (around line 90-101) — destructures `language` and passes it to `topicService.regeneratePreview`. Same removal.

Concretely, change the destructure block to omit `language`:

```ts
		const {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			pillars,
			dateFrom,
			dateTo,
			count,
			prompt,
			referenceImages,
		} = body;
```

…and the service call to omit `language`:

```ts
		const result = await topicService.generate(workspaceId, userId, {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			pillars,
			dateFrom,
			dateTo,
			count,
			prompt,
			referenceImages,
		});
```

Same for `/regenerate-preview` — drop `language` from the destructure and the call to `topicService.regeneratePreview`.

- [ ] **Step 2: Topic service fetches brand language**

In `backend/src/services/topic.service.ts`, the existing `generate` and `regeneratePreview` methods accept `language` in their input. Inside each method, after `input.brandId` is known, fetch the brand:

```ts
		const brand = await this.prisma.brand.findUnique({
			where: { id: input.brandId },
			select: { language: true },
		});
		if (!brand) throw new Error("Brand not found");
		const language = brand.language;
```

…and use `language` everywhere `input.language` was previously used (e.g., when building the topic generation prompt, when writing to the topic repo, when pushing to pg-boss).

If `TopicService` doesn't have `prisma` injected, follow the same pattern as the generation service. Reuse any existing brand fetch in the method if one exists.

- [ ] **Step 3: Mark `language` internal-only on topic input type**

In `backend/src/types/topic.types.ts`, the existing line is:

```ts
	language?: string;
```

Add the comment:

```ts
	/** @internal — sourced from brand.language inside the service, NOT from request body. */
	language?: string;
```

- [ ] **Step 4: Typecheck and run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
```

Expected: same baseline.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/topic.route.ts \
        backend/src/services/topic.service.ts \
        backend/src/types/topic.types.ts
git commit -m "feat(backend): topic generation reads language from brand, not request body

Both /generate and /regenerate-preview routes stop parsing language;
service fetches brand.language and uses it for the prompt builder
and topic repo writes."
```

---

## Task 5: Product brain flow — language sourced from brand

**Files:**
- Modify: `backend/src/routes/product.route.ts`

The product flow has two AI surfaces:
- `/scrape-preview` — `aiGenerator.scrapeProduct({ urls, language })` (around line 79)
- `/generate-brain` — `aiGenerator.generateProductBrain({ ..., language })` (around line 143)

Today the route reads `language` from the body and passes it through. After this task, the route reads it from the parent brand instead.

- [ ] **Step 1: Add brand fetch to `/scrape-preview`**

Read `backend/src/routes/product.route.ts` from the top to find:
- How `prisma` (or a brand repo) is in scope.
- How `brandId` is currently sourced (request body? URL param? query string?).

The `scrapeProduct` call doesn't take a brand directly — it's a "preview before save" flow, so the brand is wherever the form is being filled out. Most likely `brandId` is in the body. Confirm by reading the route handler.

Then in the `/scrape-preview` handler, replace:

```ts
		const { url, urls, language } = body as {
			url?: string;
			urls?: string[];
			language?: string;
		};
		// ...
		const result = await aiGenerator.scrapeProduct({ urls: urlList, language });
```

…with:

```ts
		const { url, urls, brandId } = body as {
			url?: string;
			urls?: string[];
			brandId?: string;
		};
		if (!brandId) {
			return c.json({ error: "brandId is required" }, 400);
		}
		const brand = await prisma.brand.findUnique({
			where: { id: brandId },
			select: { language: true },
		});
		if (!brand) {
			return c.json({ error: "Brand not found" }, 404);
		}
		// ...
		const result = await aiGenerator.scrapeProduct({ urls: urlList, language: brand.language });
```

If the existing route doesn't currently require `brandId` from the body (e.g., the frontend doesn't send it), STOP and report — that's a frontend-coupling decision worth flagging. Most likely the frontend already sends `brandId` because product brain is brand-scoped.

- [ ] **Step 2: Same change in `/generate-brain`**

The `/generate-brain` route around line 143 also takes `language` from the body. Apply the same brand-fetch pattern: read `brandId`, fetch brand, use `brand.language`.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: same baseline.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/product.route.ts
git commit -m "feat(backend): product brain reads language from parent brand

/scrape-preview and /generate-brain stop accepting language from
the request body. Both routes now fetch the parent brand by
brandId and use brand.language when calling scrapeProduct /
generateProductBrain on the AI provider."
```

---

## Task 6: Frontend — Brand Brain form persists language

**Files:**
- Modify: `frontend/src/components/brands/BrandBrainForm.tsx`
- Modify: `frontend/src/services/brand.service.ts` (or wherever the frontend Brand type lives — verify)

- [ ] **Step 1: Find the frontend Brand type**

```bash
grep -rn "interface Brand\b\|type Brand\b" /Users/bellinnn/Documents/projects/fce/frontend/src --include="*.ts" --include="*.tsx" | head -5
```

The Brand type might be in `frontend/src/services/brand.service.ts`, `frontend/src/types/brand.ts`, or inline in a page component. Find the canonical declaration.

- [ ] **Step 2: Add `language` to the frontend Brand type**

In the type file, add `language: "indonesian" | "english"` to the Brand interface and to the create/update payload types.

If the existing type doesn't list its fields explicitly (e.g., it's just inferred from an API response), still add an explicit `language` field on whatever interface is closest to "what the form sends to /brands".

- [ ] **Step 3: Persist toggle into create/update payloads**

In `frontend/src/components/brands/BrandBrainForm.tsx`, the form already manages a `<ScrapeLanguageToggle>` value (likely via `useScrapeLanguage` hook). Find that state.

When the form submits (POST to `/brands` for create, PATCH/PUT to `/brands/:id` for update), include `language: <toggle value>` in the body. Match the existing key style (other body fields like `name`, `category`, etc.).

- [ ] **Step 4: Pre-select toggle from `brand.language` on edit**

The form currently initializes the toggle from the user's `defaultScrapeLanguage` (or similar default). For the EDIT mode (when the form is loaded with an existing brand), instead initialize the toggle from `brand.language` if present, falling back to the user default for new brands.

The exact code depends on whether `useScrapeLanguage` exposes a setter. If it does, call the setter from a `useEffect` keyed on `brand?.id`. If the form has its own local state for the toggle, set the initial state based on `brand?.language ?? userDefault`.

- [ ] **Step 5: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src
git commit -m "feat(frontend): Brand Brain form persists language to brand

The existing ScrapeLanguageToggle now does double duty: it sets
the brand's persistent language on save, and on edit it pre-selects
from brand.language. New brands still default to the user's
defaultScrapeLanguage as a UX convenience."
```

---

## Task 7: Frontend — drop language pickers from Generate / Topics / Product

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`
- Modify: `frontend/src/pages/TopicsPage.tsx`
- Modify: `frontend/src/components/products/ProductForm.tsx`

These are three independent removals; do them as one task with three commits OR one combined commit — the implementer's choice. Recommended: one combined commit since the change is the same conceptually across three files.

### `GeneratePage.tsx`

- [ ] **Step 1: Remove the language picker UI**

In `frontend/src/pages/GeneratePage.tsx`:
- Around line 397: `const [language, setLanguage] = useState("indonesian");` — delete.
- Around line 666: `language,` in the POST body — delete.
- Around line 1022: the JSX block that renders the language picker buttons (search for `language === l.value` and surrounding `<button>` / mapping over a language list). Delete the whole JSX block.

If there are other `language` references in this file (e.g., a list constant `LANGUAGES = [{ value: "indonesian", ... }]`), delete those too if they're now unused.

### `TopicsPage.tsx`

- [ ] **Step 2: Remove the language picker UI**

Same removal pattern in `frontend/src/pages/TopicsPage.tsx`:
- Around line 132: `const [language, setLanguage] = useState<string>("indonesian");` — delete.
- Around line 296 and 345: `language,` in POST bodies — delete both.
- Around line 665: JSX block rendering the language buttons — delete.

### `ProductForm.tsx`

- [ ] **Step 3: Remove language from Product form payloads**

In `frontend/src/components/products/ProductForm.tsx`:
- Around line 92: `language: scrapeLanguage` in the auto-fill body — delete (and any related `scrapeLanguage` variable if unused now).
- If the form has its own language toggle JSX (search for `<ScrapeLanguageToggle>` or similar within the file), remove it.

### Verify and commit

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b 2>&1 | tail -5
```

Expected: clean. Watch for "unused variable" warnings on `setLanguage` etc. — those mean removal was incomplete.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/GeneratePage.tsx \
        frontend/src/pages/TopicsPage.tsx \
        frontend/src/components/products/ProductForm.tsx
git commit -m "feat(frontend): drop language pickers from Generate, Topics, Product forms

Brand owns the language now (set on Brand Brain form). Each generator
inherits from the selected brand at job time, so the per-form picker
is dead UI. Removes the picker JSX, the language state, and the
language field from all POST payloads."
```

---

## Task 8: Manual smoke verification (user-side)

No automated tests cover the live AI flow.

- [ ] **Step 1: Restart backend with hot reload**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun run --hot src/index.ts
```

- [ ] **Step 2: Create a new brand with language = English**

Open the UI, go to `/brands/new`. Set the language toggle to English. Auto-fill from a public English website OR manually fill the form. Save.

Verify in DB:

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT name, language FROM brands ORDER BY created_at DESC LIMIT 1;"
```

Expected: most recent brand has `language = english`.

- [ ] **Step 3: Generate content for that brand → output is English**

Navigate to `/generate`. Select the new English brand and a product under it. Submit. Wait for the job. Verify the generated content is in English.

Backend log should NOT show any `language` field on the request body (the route stopped parsing it). The job log should show `language: "english"` from the brand fetch.

- [ ] **Step 4: Flip the brand to Indonesian, regenerate**

Open the brand's Brand Brain form. Flip toggle to Indonesian. Save.

Verify:

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "SELECT name, language FROM brands WHERE name = '<your test brand>';"
```

Expected: `language = indonesian`.

Generate a new content for the same brand. Output should be Indonesian.

- [ ] **Step 5: Generate a topic — also Indonesian**

Go to `/topics`. Select the brand. Generate. Output is Indonesian.

- [ ] **Step 6: Confirm the language pickers are gone**

Visually verify:
- `/generate` — no language picker visible.
- `/topics` — no language picker visible.
- Product create/edit form — no language toggle visible.
- `/brands/:id` (Brand Brain edit) — toggle still present, pre-selected from `brand.language`.

- [ ] **Step 7: Sanity sweep**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend && bun test 2>&1 | tail -3
cd /Users/bellinnn/Documents/projects/fce/backend && bunx tsc --noEmit 2>&1 | grep -c "error TS"
cd /Users/bellinnn/Documents/projects/fce/frontend && npx tsc -b
```

Expected: tests at baseline, tsc unchanged, frontend clean.

If the smoke catches a regression, fix the specific bug and commit `fix(...)`.

---

## Summary

- 8 tasks, ~40 steps total.
- 1 schema migration (additive nullable-default column).
- ~12 backend files modified, ~3 frontend files modified.
- 7 functional commits + 0–1 fix commits if smoke surfaces issues.
- No new tests required — the change is conceptual (where data comes from), not behavioral.
- Existing brands automatically get `language: "indonesian"` from the Prisma default. Users adjust via Brand Brain → toggle → save.
