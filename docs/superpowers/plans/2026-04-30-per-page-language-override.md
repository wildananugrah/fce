# Per-Page Language Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three AI-using forms (Product Brain, Topic Generator, Content Generator) each get an ID/EN language toggle that defaults to the active brand's language but can be overridden per request.

**Architecture:** Backend uses `input.language ?? brand.language` at five call sites; the existing type fields already declare `language?: string` (just need their `@internal` comments updated and the call sites changed). Frontend adds a `ScrapeLanguageToggle` to each of the three forms with state initialized from the brand.

**Tech Stack:** React 19, TypeScript, Hono, Prisma 7, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-04-30-per-page-language-override-design.md](../specs/2026-04-30-per-page-language-override-design.md)

---

## Task 1: Backend tests — assert language flows from input through `topic.service.generate`

**Files:**
- Modify: `backend/tests/services/topic.service.test.ts`

TDD red phase: append two tests that fail today (because the current service hard-codes `language = brand.language`).

- [ ] **Step 1: Append the new tests inside the existing `describe("TopicService", ...)` block**

Open `backend/tests/services/topic.service.test.ts` and append the following inside `describe("generate", () => { ... })` after the existing tests:

```ts
it("uses input.language when provided", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const sent: any[] = [];
    const fakeBoss = {
        send: async (_q: string, data: any) => {
            sent.push(data);
            return "job-id";
        },
    } as any;
    const service = new TopicService(repo as any, fakeBoss, makeMockPrisma("indonesian"));
    await service.generate(workspaceId, userId, {
        brandId: "b1",
        count: 5,
        language: "english",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].language).toBe("english");
});

it("falls back to brand.language when input.language is missing", async () => {
    const workspaceId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const sent: any[] = [];
    const fakeBoss = {
        send: async (_q: string, data: any) => {
            sent.push(data);
            return "job-id";
        },
    } as any;
    const service = new TopicService(repo as any, fakeBoss, makeMockPrisma("indonesian"));
    await service.generate(workspaceId, userId, {
        brandId: "b1",
        count: 5,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].language).toBe("indonesian");
});
```

The two tests use the existing `repo` and `makeMockPrisma` helpers (already in the file).

- [ ] **Step 2: Run the tests, expect 1 fail and 1 pass**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun test tests/services/topic.service.test.ts 2>&1 | tail -10
```

Expected: the second test ("falls back to brand.language") passes (current behavior), the first ("uses input.language when provided") fails because the service ignores `input.language`.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/tests/services/topic.service.test.ts
git commit -m "test(topic): require input.language override on generate"
```

---

## Task 2: Backend implementation — thread `input.language` through services, routes, and type comments

**Files:**
- Modify: `backend/src/services/topic.service.ts`
- Modify: `backend/src/services/generation.service.ts`
- Modify: `backend/src/routes/product.route.ts`
- Modify: `backend/src/routes/topic.route.ts`
- Modify: `backend/src/routes/generation.route.ts`
- Modify: `backend/src/types/topic.types.ts`
- Modify: `backend/src/types/generation.types.ts`

- [ ] **Step 1: Update `topic.service.ts` — drop the "@internal" comment and use `input.language ?? brand.language`**

In `backend/src/services/topic.service.ts`, find the `generate` method (around line 54). Replace:

```ts
const language = brand.language;
```

with:

```ts
const language = input.language ?? brand.language;
```

`regenerate()` (around line 86) and `regeneratePreview()` (around line 114) are out of scope — leave them untouched.

- [ ] **Step 2: Update `generation.service.ts`**

In `backend/src/services/generation.service.ts:62`, change:

```ts
language: brand.language,
```

to:

```ts
language: input.language ?? brand.language,
```

- [ ] **Step 3: Update `topic.types.ts` comment**

In `backend/src/types/topic.types.ts`, the `GenerateTopicsInput` interface has:

```ts
/** @internal — sourced from brand.language inside the service, NOT from request body. */
language?: string;
```

Replace the comment:

```ts
/** Per-request language override. When omitted, the service falls back to brand.language. */
language?: string;
```

- [ ] **Step 4: Update `generation.types.ts` comment**

Same change in `backend/src/types/generation.types.ts` for `CreateGenerationInput.language`. Replace:

```ts
/** @internal — sourced from brand.language inside the service, NOT from request body. */
language?: string;
```

with:

```ts
/** Per-request language override. When omitted, the service falls back to brand.language. */
language?: string;
```

- [ ] **Step 5: Update `product.route.ts` (scrape-preview, around lines 85-103)**

In `backend/src/routes/product.route.ts`, find the `/scrape-preview` POST handler. The current shape:

```ts
const body = await c.req.json();
const { url, urls, brandId } = body as {
    url?: string;
    urls?: string[];
    brandId?: string;
};
```

Change to:

```ts
const body = await c.req.json();
const { url, urls, brandId, language: bodyLanguage } = body as {
    url?: string;
    urls?: string[];
    brandId?: string;
    language?: string;
};
```

Then find the `aiGenerator.scrapeProduct({ ... })` call (around line 98–102) and change:

```ts
language: brand.language,
```

to:

```ts
language: bodyLanguage ?? brand.language,
```

- [ ] **Step 6: Update `product.route.ts` (generate-brain, around lines 174-195)**

Same file. Find the `/generate-brain` POST handler. Same destructure update at the top of the handler:

```ts
const { productName, brandName, brandId, productType, priceTier, summary, language: bodyLanguage } = body;
```

(plus add `language?: string` if the body has an explicit type assertion).

Then change the `language: brand.language` line in the AI generator call to:

```ts
language: bodyLanguage ?? brand.language,
```

- [ ] **Step 7: Update `topic.route.ts` (`/generate`)**

In `backend/src/routes/topic.route.ts:53-85`, the existing destructure pulls `brandId, productIds, platform, ...`. Add `language` to the destructure and to the `topicService.generate(...)` call:

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
    language,
} = body;
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
    language,
});
```

- [ ] **Step 8: Update `generation.route.ts` (`POST /`)**

In `backend/src/routes/generation.route.ts:15-40`, the existing call passes body fields into `generationService.create(...)`. Add `language: body.language` to the call:

```ts
const request = await generationService.create(workspaceId, userId, {
    brandId: body.brandId,
    productId: body.productId,
    productIds: body.productIds,
    contentTopicId: body.contentTopicId,
    platform: body.platform,
    contentType: body.contentType,
    framework: body.framework,
    hookType: body.hookType,
    prompt: body.prompt,
    objective: body.objective,
    tonePreset: body.tonePreset,
    visualStyle: body.visualStyle,
    outputLength: body.outputLength,
    referenceImages: body.referenceImages,
    researchContext: body.researchContext,
    pillars: body.pillars,
    language: body.language,
});
```

- [ ] **Step 9: Run tests, expect all pass**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun test tests/services/topic.service.test.ts 2>&1 | tail -10
```

Expected: both new tests pass.

```bash
bun test 2>&1 | tail -5
```

Expected: same baseline as before (~219 pass / 1 pre-existing fail; the 1 fail is the `chat.service.test.ts apply_plan_edit` test, unrelated).

- [ ] **Step 10: Type-check**

```bash
bunx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "(topic\.service|topic\.route|generation\.service|generation\.route|product\.route|topic\.types|generation\.types)" || echo "NO_RELEVANT_ERRORS"
```

Expected: `NO_RELEVANT_ERRORS`. Pre-existing errors in `brand-scraping.job.ts`, `dashboard.route.ts`, `pdf-extractor.ts`, `content-generation.job.ts` are out of scope.

- [ ] **Step 11: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/topic.service.ts \
        backend/src/services/generation.service.ts \
        backend/src/routes/product.route.ts \
        backend/src/routes/topic.route.ts \
        backend/src/routes/generation.route.ts \
        backend/src/types/topic.types.ts \
        backend/src/types/generation.types.ts
git commit -m "feat(language): accept per-request language override in product/topic/content AI flows"
```

---

## Task 3: Frontend — `ProductForm` adds the language toggle

**Files:**
- Modify: `frontend/src/components/products/ProductForm.tsx`

- [ ] **Step 1: Add the import**

At the top of `frontend/src/components/products/ProductForm.tsx`, alongside the other imports:

```tsx
import { ScrapeLanguageToggle } from "../ui/ScrapeLanguageToggle";
import type { ScrapeLanguage } from "../../types";
```

- [ ] **Step 2: Add `language` state, initialized from the active brand**

Inside the component body, near the existing `useState` hooks (alongside `productUrl`, `name`, etc.), add:

```tsx
const initialLanguage: ScrapeLanguage =
    (brands.find((b) => b.id === brandId)?.language as ScrapeLanguage | undefined) ??
    "indonesian";
const [language, setLanguage] = useState<ScrapeLanguage>(initialLanguage);

// Reset to the new brand's language whenever the user picks a different brand.
useEffect(() => {
    const next = brands.find((b) => b.id === brandId)?.language as
        | ScrapeLanguage
        | undefined;
    if (next) setLanguage(next);
}, [brandId, brands]);
```

NOTE: Verify the `Brand` type passed into `ProductForm` includes `language: string`. If it doesn't (it's currently typed as `{ id: string; name: string }` per `ProductForm.tsx:10-13`), extend the inline type:

```ts
interface Brand {
  id: string;
  name: string;
  language?: string;       // NEW
}
```

…and ensure the parent (`ProductsPage` or wherever `<ProductForm brands={...}>` is rendered) is already passing `language` for each brand. If it isn't, fall back to `"indonesian"` and flag this — the parent needs updating to include the language field.

- [ ] **Step 3: Render the toggle in the URL row, next to the existing buttons**

Find the URL input block (around line 326–365 — the `<div className="flex gap-2 items-stretch">` that holds the input + Auto-fill button + Cancel button). Add the toggle inside that row, before the Auto-fill button:

```tsx
<div className="flex gap-2 items-stretch">
  <input
    value={productUrl}
    onChange={(e) => setProductUrl(e.target.value)}
    placeholder="https://example.com/product"
    className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
  />
  <ScrapeLanguageToggle
    value={language}
    onChange={setLanguage}
    disabled={scraping || generating}
  />
  <button
    type="button"
    onClick={handleAutoFill}
    /* existing props unchanged */
  >
    {/* existing children */}
  </button>
  {(scraping || generating) && (
    /* existing Cancel button */
  )}
</div>
```

- [ ] **Step 4: Pass `language` in both AI request bodies**

Inside `runScrapePreview()`, add `language` to the JSON body:

```tsx
body: JSON.stringify({ url: productUrl.trim(), brandId, language }),
```

Inside `runGenerateBrain()`, same:

```tsx
body: JSON.stringify({
    productName: name.trim(),
    brandName: brand.name,
    brandId,
    productType: type.trim() || undefined,
    priceTier: priceTier.trim() || undefined,
    summary: summary.trim() || undefined,
    language,
}),
```

- [ ] **Step 5: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/products/ProductForm.tsx
git commit -m "feat(ui): add language override toggle to Product Brain form"
```

---

## Task 4: Frontend — `TopicsPage` adds the language toggle

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

- [ ] **Step 1: Read the relevant code to locate exact insertion points**

```bash
grep -n "brandId\|setBrandId\|setGenerating\|topics/generate\|setTopicPrompt" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx | head -20
```

Note the variable holding the selected brand id (likely `brandId`), where the brand list is fetched (likely `brands` state), and where the topic-generation submit POST happens (around line 280–311).

- [ ] **Step 2: Add the import**

At the top of `frontend/src/pages/TopicsPage.tsx`:

```tsx
import { ScrapeLanguageToggle } from "../components/ui/ScrapeLanguageToggle";
import type { ScrapeLanguage } from "../types";
```

- [ ] **Step 3: Add `language` state, initialized from the active brand**

Near the existing `useState` hooks (alongside `generating`, `pendingRunId`, etc.), add:

```tsx
const [language, setLanguage] = useState<ScrapeLanguage>("indonesian");

// Reset to the active brand's language when the user picks a different brand.
useEffect(() => {
    const brand = brands.find((b) => b.id === brandId);
    const lang = brand?.language as ScrapeLanguage | undefined;
    if (lang) setLanguage(lang);
}, [brandId, brands]);
```

The `useEffect` import may need to be added to the existing React import line if not already present.

- [ ] **Step 4: Render the toggle in the topic-generation form**

Find where the form's brand/product selectors live. Add the `ScrapeLanguageToggle` next to or below them:

```tsx
<div className="flex items-center gap-2">
  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
    Language
  </span>
  <ScrapeLanguageToggle
    value={language}
    onChange={setLanguage}
    disabled={generating}
  />
</div>
```

The exact placement depends on the existing form layout — look for a row with the brand selector and slot the toggle in. Match the surrounding styling (gap, label uppercase tracking, etc.).

- [ ] **Step 5: Pass `language` in the topic-gen submit body**

Find the `await api(...)` call to `/api/workspaces/${workspaceId}/topics/generate` (around line 280–311). Add `language` to the JSON body:

```tsx
body: JSON.stringify({
    brandId,
    productIds: /* existing */,
    platform: /* existing */,
    formats: /* existing */,
    objective: /* existing */,
    pillars: /* existing */,
    count: /* existing */,
    prompt: topicPrompt.trim() || undefined,
    referenceImages: /* existing */,
    language,
}),
```

Adapt to whatever fields the existing body has — only add `language` to it.

- [ ] **Step 6: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent. If a `Brand` type referenced in the page doesn't include `language`, add it (similar to Task 3 Step 2 fallback).

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat(ui): add language override toggle to Topic Generator"
```

---

## Task 5: Frontend — `GeneratePage` adds the language toggle

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

Same pattern as Task 4, applied to the content-generation page.

- [ ] **Step 1: Locate the relevant code**

```bash
grep -n "brandId\|setGenerating\|api.*generations\|brandsList" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx | head -15
```

Note the brand-id state variable name and where the submit POST happens.

- [ ] **Step 2: Add the import**

```tsx
import { ScrapeLanguageToggle } from "../components/ui/ScrapeLanguageToggle";
import type { ScrapeLanguage } from "../types";
```

- [ ] **Step 3: Add `language` state**

Near the existing `useState` hooks:

```tsx
const [language, setLanguage] = useState<ScrapeLanguage>("indonesian");

useEffect(() => {
    const brand = brands.find((b) => b.id === brandId);
    const lang = brand?.language as ScrapeLanguage | undefined;
    if (lang) setLanguage(lang);
}, [brandId, brands]);
```

- [ ] **Step 4: Render the toggle in the generate form**

Place near the brand/product selectors:

```tsx
<div className="flex items-center gap-2">
  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
    Language
  </span>
  <ScrapeLanguageToggle
    value={language}
    onChange={setLanguage}
    disabled={generating}
  />
</div>
```

Replace `disabled={generating}` with whatever in-flight state variable the page uses (per the cancel-and-leave-warning work, `pendingRequestId` may also be a good signal).

- [ ] **Step 5: Pass `language` in the submit body**

Find the `POST /api/workspaces/${workspaceId}/generations` call. Add `language` to the body:

```tsx
body: JSON.stringify({
    brandId,
    productId: /* existing */,
    productIds: /* existing */,
    contentTopicId: /* existing */,
    platform: /* existing */,
    contentType: /* existing */,
    framework: /* existing */,
    hookType: /* existing */,
    prompt: customPrompt.trim() || undefined,
    objective: /* existing */,
    tonePreset: /* existing */,
    visualStyle: /* existing */,
    outputLength: /* existing */,
    referenceImages: /* existing */,
    researchContext: /* existing */,
    pillars: /* existing */,
    language,
}),
```

- [ ] **Step 6: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat(ui): add language override toggle to Content Generator"
```

---

## Task 6: Manual smoke test

**Files:**
- No file changes.

For each of the three pages, verify:

- [ ] **Step 1: Restart the backend so the new code loads**

```bash
kill $(pgrep -f "bun.*src/index" 2>/dev/null) 2>/dev/null
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run --hot src/index.ts &
```

Frontend `--hot` reload picks up the changes; if not, hard-refresh the browser tab.

- [ ] **Step 2: Smoke — Product Brain**

1. Open New Product modal in a workspace whose brand has `language: "indonesian"`.
2. Verify the toggle defaults to **ID** in the URL row.
3. Switch to **EN**. Click Auto-fill with AI.
4. Verify the AI output (USP, RTB, summary, etc.) is in English, not Indonesian.
5. Open the modal again — verify the toggle is back to **ID** (no persistence).
6. Switch the brand selector to one with `language: "english"`. Verify the toggle resets to **EN**.

- [ ] **Step 3: Smoke — Topic Generator**

1. On the Topic Generator page, with an Indonesian brand active, verify the language toggle defaults to **ID**.
2. Switch to **EN**, generate topics. Verify the generated topics are in English.
3. Reload the page; verify it defaults to **ID** again.

- [ ] **Step 4: Smoke — Content Generator**

1. Same flow on the Generate (content) page.
2. Submit a content request with EN selected on an Indonesian brand. Verify the resulting content is in English.

- [ ] **Step 5: Smoke — fallback when language is omitted**

Optional: in DevTools → Network, intercept one of the requests and remove the `language` field from the request body. Submit. Verify the generated content uses the brand's stored language (the backend's fallback is working).

- [ ] **Step 6: No commit (verification only)**

If anything misbehaves, return to the relevant task.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Backend service: `input.language ?? brand.language` (topic) | Task 2 (steps 1) |
| Backend service: same (content gen) | Task 2 (step 2) |
| Backend route: scrape-preview reads body.language | Task 2 (step 5) |
| Backend route: generate-brain reads body.language | Task 2 (step 6) |
| Backend route: topic.route passes language to service | Task 2 (step 7) |
| Backend route: generation.route passes language to service | Task 2 (step 8) |
| Type comments updated (no longer @internal) | Task 2 (steps 3, 4) |
| Topic regenerate stays untouched | Task 2 (step 1 explicit note) |
| Frontend: ProductForm toggle + state + brand-reset effect | Task 3 |
| Frontend: TopicsPage toggle + state + reset | Task 4 |
| Frontend: GeneratePage toggle + state + reset | Task 5 |
| Frontend sends `language` in 4 request bodies (scrape-preview, generate-brain, topics/generate, generations) | Tasks 3, 4, 5 |
| Backend tests for language behavior | Task 1 |
| Manual smoke for all 3 pages | Task 6 |

All spec sections covered.

**Type / name consistency:**
- `language` is the field name in body, route handler, service input, and AI generator call across all five backend touch points.
- `ScrapeLanguage` is the TypeScript type for the toggle in all three frontend tasks.
- The reset-on-brand-change effect uses identical shape across Tasks 3, 4, 5.

**Placeholder scan:** A few "/* existing */" placeholders appear in Task 5's body example — they refer to fields the existing code already passes through (`productId`, `platform`, `framework`, etc.). The implementer reads the actual existing JSON body and adds `language` alongside; no work is being deferred. Acceptable per the convention used elsewhere in this repo's plans.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-per-page-language-override.md](2026-04-30-per-page-language-override.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — run tasks directly in this session.

Which approach?
