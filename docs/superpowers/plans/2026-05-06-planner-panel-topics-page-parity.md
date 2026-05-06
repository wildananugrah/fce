# Planner Panel Parity with Topics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `PlannerTopicGeneratorPanel` to functional parity with `TopicsPage` by adding Products multi-select, Brand Content Pillars chips, Reference Images uploader, and Additional Direction textarea, in matching section order.

**Architecture:** Single-file change. Inline-duplicate JSX from `TopicsPage.tsx` rather than extract shared components — YAGNI for two consumers. Add 6 state hooks, 2 fetch effects (products, brand active brain), reorder Language to live inside Context, insert four new sections, and extend the existing submit body with four new optional fields. The backend route already accepts these fields; no API change.

**Tech Stack:** React 19, TypeScript, Vite. Frontend-only.

**Spec:** [docs/superpowers/specs/2026-05-06-planner-panel-topics-page-parity-design.md](docs/superpowers/specs/2026-05-06-planner-panel-topics-page-parity-design.md)

---

## Pre-flight

This work continues on the existing `feat/planner-click-to-schedule` branch (5 commits ahead of `main` from the prior click-to-schedule task + 1 spec commit). No new branch needed.

- [ ] **Step 0: Confirm branch state**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status
git log --oneline main..HEAD
```

Expected: branch is `feat/planner-click-to-schedule`. Working tree only shows the 2 pre-existing dirty files (`.claude/settings.local.json`, `docs/notes.md`).

---

## File Plan

### Modified files

- **`frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`** — All implementation lives here. ~6 new state hooks, 2 new useEffects, 4 new JSX sections, 1 section reorder (Language moves into Context), 4 new submit-body fields.

### Not modified

- Backend, schema, route — unchanged. Backend route at `/api/workspaces/:id/topics/generate` already accepts `productIds`, `pillars`, `customPrompt`, `referenceImages`. Topics page exercises them today.
- `frontend/src/pages/TopicsPage.tsx` — source of truth for the duplicated JSX. Stays as-is.
- Other Planner subcomponents.

---

## Task 1: Implement panel parity in `PlannerTopicGeneratorPanel.tsx`

**Files:**
- Modify: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`

After this task, the Planner panel form has the same fields as the Topics page: Brand → Language → Products → Brand Content Pillars → Platform → Objective → Content Formats → Schedule → Reference Images → Additional Direction → Count → Generate. The submit body sends the four new fields when non-empty; Generate hits the existing backend route unchanged.

- [ ] **Step 1: Read the current file in full to confirm line positions**

```bash
wc -l /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
```

The current file is ~543 lines. Note these landmark lines that subsequent steps reference:
- Line 1-8: imports
- Line 10-43: existing interfaces (`Brand`, `Topic`, `PlannerTopicGeneratorPanelProps`)
- Lines 45-83: existing const arrays (`PLATFORMS`, `OBJECTIVES`, `FORMATS`)
- Lines 85-95: component signature destructure
- Lines 96-108: existing state declarations
- Lines 112-122: existing useEffects (the brand-reset effect from Task 2 of the prior feature)
- Lines 177-192: existing `handleGenerate` submit body (`brandId, formats, platform, objective, dateFrom, dateTo, count, language`)
- Lines 254-268: `<FormSection title="Context">` with just Brand select today
- Lines 270-303: `<FormSection title="Platform & Objective">` containing Platform + Objective + Language (Language will move out)

If line numbers have shifted, adapt — the structure is what matters.

- [ ] **Step 2: Add new imports**

At the top of the file, after the existing import block, add:

```tsx
import { ReferenceImageUpload, type ImageRef } from "../ui/ReferenceImageUpload";
```

Note: `getPillarColor` is already imported on line 7 — do NOT add a duplicate import.

If the path `../ui/ReferenceImageUpload` does not exist, run `find /Users/bellinnn/Documents/projects/fce/frontend/src -name "ReferenceImageUpload*"` to find the correct relative path. The Topics page already imports it; mirror that import path with the correct relative depth from the panel's location.

- [ ] **Step 3: Add new type definitions**

After the existing `interface PlannerTopicGeneratorPanelProps { … }` block (around line 43), insert:

```tsx
interface Product {
  id: string;
  name: string;
  brandId: string;
}

interface BrainVersion {
  id: string;
  vocabulary?: {
    contentPillars?: string[];
  };
}

interface BrandWithBrain {
  id: string;
  activeBrain?: BrainVersion | null;
}
```

Verify the field names match what the API actually returns: `cat backend/src/routes/brand.route.ts | grep -nE "include.*activeBrain|select" | head -10`. If `activeBrain` is named differently in the response (e.g., `activeBrainVersion`), adjust the interface accordingly.

- [ ] **Step 4: Add new state hooks**

Inside the component body, immediately after the existing `const [count, setCount] = useState(6);` line (around line 103), insert:

```tsx
const [products, setProducts] = useState<Product[]>([]);
const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
const [contentPillars, setContentPillars] = useState<string[]>([]);
const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
const [customPrompt, setCustomPrompt] = useState("");
const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
```

- [ ] **Step 5: Add fetch-products effect**

After the existing brand-reset effect (around line 112-122), insert:

```tsx
// Fetch the workspace's products once when the panel opens. Filter
// client-side by selected brand at render time.
useEffect(() => {
  if (!isOpen || !workspaceId) return;
  api<Product[]>(`/api/workspaces/${workspaceId}/products`)
    .then((p) => setProducts(p))
    .catch(() => setProducts([]));
}, [isOpen, workspaceId]);
```

- [ ] **Step 6: Add brand-changed effect for content pillars**

Directly after the products effect, insert:

```tsx
// When brand changes, reset brand-scoped selections (products + pillars)
// and re-fetch the new brand's active-brain content pillars.
useEffect(() => {
  if (!brandId || !workspaceId) {
    setContentPillars([]);
    setSelectedPillars([]);
    setSelectedProductIds([]);
    return;
  }
  setSelectedProductIds([]);
  setSelectedPillars([]);

  api<BrandWithBrain>(`/api/workspaces/${workspaceId}/brands/${brandId}`)
    .then((data) => {
      setContentPillars(data.activeBrain?.vocabulary?.contentPillars ?? []);
    })
    .catch(() => setContentPillars([]));
}, [brandId, workspaceId]);
```

- [ ] **Step 7: Add filtered-products derived value**

Inside the render body, near the top of `return (...)` (around line 226 just before `if (!isOpen) return null;`), add:

```tsx
const filteredProducts = products.filter((p) => p.brandId === brandId);
```

- [ ] **Step 8: Move Language out of Platform & Objective into Context**

Currently `<FormSection title="Context">` (around lines 254-268) only has the Brand select. Currently `<FormSection title="Platform & Objective">` (around lines 270-303) has Platform + Objective + Language.

Cut the entire Language `<Field>` block (around lines 285-302):

```tsx
<Field label="Language">
  <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
    {(["indonesian", "english"] as const).map((lang) => (
      <button
        key={lang}
        type="button"
        onClick={() => setLanguage(lang)}
        className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition ${
          language === lang
            ? "bg-violet-600 text-white shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {lang === "indonesian" ? "Bahasa Indonesia" : "English"}
      </button>
    ))}
  </div>
</Field>
```

Paste it inside `<FormSection title="Context">`, immediately after the Brand `<Field>` (so right before the closing `</FormSection>` tag on line 268).

After the move, the Context section contains Brand and Language; the Platform & Objective section contains only Platform and Objective.

- [ ] **Step 9: Add Products section inside Context**

In `<FormSection title="Context">`, after the moved Language `<Field>` and before the closing `</FormSection>`, insert:

```tsx
{brandId && filteredProducts.length > 0 && (
  <Field label="Products">
    <p className="mb-2 text-xs text-gray-500">
      Select one or more products for cross-product topics.
    </p>
    <div className="flex flex-wrap gap-2">
      {filteredProducts.map((p) => {
        const selected = selectedProductIds.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              setSelectedProductIds((curr) =>
                selected ? curr.filter((id) => id !== p.id) : [...curr, p.id],
              )
            }
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              selected
                ? "border-violet-600 bg-violet-600 text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-violet-400"
            }`}
          >
            {selected ? "✓ " : ""}{p.name}
          </button>
        );
      })}
    </div>
    <p className="mt-1.5 text-xs text-gray-400">
      {selectedProductIds.length === 0
        ? "No product selected — topics span the brand"
        : `${selectedProductIds.length} product${selectedProductIds.length === 1 ? "" : "s"} selected`}
    </p>
  </Field>
)}
```

The `violet-600` accent matches the existing panel's accent color (Generate button, Language toggle).

- [ ] **Step 10: Add Brand Content Pillars section inside Context**

Immediately after the Products section (inside the same `<FormSection title="Context">`), insert:

```tsx
{brandId && contentPillars.length > 0 && (
  <Field label="Brand Content Pillars">
    <p className="mb-2 text-xs text-gray-500">
      Pick one or more pillars, or leave blank to mix across all.
    </p>
    <div className="flex flex-wrap gap-2">
      {contentPillars.map((p) => {
        const selected = selectedPillars.includes(p);
        const colorClass = selected
          ? getPillarColor(p)
          : "border-gray-200 bg-gray-50 text-gray-600";
        return (
          <button
            key={p}
            type="button"
            onClick={() =>
              setSelectedPillars((curr) =>
                selected ? curr.filter((x) => x !== p) : [...curr, p],
              )
            }
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${colorClass}`}
          >
            {p}
          </button>
        );
      })}
    </div>
    {selectedPillars.length === 0 && (
      <p className="mt-1.5 text-xs text-gray-400">Mixed (all pillars)</p>
    )}
  </Field>
)}
```

`getPillarColor` returns Tailwind classes that include both border and background (e.g., `bg-violet-100 text-violet-800 border-violet-200` or similar). The `selected` branch uses it; the unselected branch uses a neutral gray.

- [ ] **Step 11: Add Reference Images section after Schedule**

The current `<FormSection title="Schedule">` (around line 331-360) contains From, To, Count. Move Count into its own new section to keep Schedule purely date-related, OR keep Count inside Schedule and put Reference Images / Additional Direction in their own sections.

Per the spec, the target order is: Schedule (From, To) → Reference Images → Additional Direction → Count. So:

a. Remove the Count `<Field>` from inside `<FormSection title="Schedule">` (around lines 350-359).

b. After the closing `</FormSection>` of Schedule, add a new `<FormSection title="Reference Images">`:

```tsx
<FormSection
  title="Reference Images"
  hint="Optional. The AI uses these to anchor visual style or tone."
>
  <ReferenceImageUpload
    workspaceId={workspaceId}
    images={referenceImages}
    onChange={setReferenceImages}
  />
</FormSection>
```

If `<ReferenceImageUpload>`'s actual prop names differ from `workspaceId` / `images` / `onChange`, mirror what `TopicsPage.tsx` line 833-837 passes. Read that file's usage to confirm.

- [ ] **Step 12: Add Additional Direction section**

Directly after the Reference Images section, add:

```tsx
<FormSection
  title="Additional Direction"
  hint="Optional free-text guidance the AI follows alongside the brand brain."
>
  <textarea
    value={customPrompt}
    onChange={(e) => setCustomPrompt(e.target.value)}
    placeholder="e.g. focus on Q4 promo angles, or steer towards founder-led storytelling"
    rows={3}
    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
  />
</FormSection>
```

- [ ] **Step 13: Add new Count section after Additional Direction**

Re-add the Count input as its own small section so it stays the last form section before Generate:

```tsx
<FormSection title="Count">
  <Field label="How many topics">
    <input
      type="number"
      min={1}
      max={30}
      value={count}
      onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
      className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
    />
  </Field>
</FormSection>
```

This is the same Count input that lived inside Schedule before — cut from there, paste here.

- [ ] **Step 14: Extend the submit body in `handleGenerate`**

Find the existing `JSON.stringify({ … })` body in `handleGenerate` (around lines 181-191):

```tsx
body: JSON.stringify({
  brandId,
  formats: selectedFormats,
  platform,
  objective,
  dateFrom,
  dateTo,
  count,
  language,
}),
```

Replace with:

```tsx
body: JSON.stringify({
  brandId,
  formats: selectedFormats,
  platform,
  objective,
  dateFrom,
  dateTo,
  count,
  language,
  productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
  pillars: selectedPillars.length > 0 ? selectedPillars : undefined,
  customPrompt: customPrompt.trim() || undefined,
  referenceImages:
    referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
      ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
      : undefined,
}),
```

The pattern: send `undefined` (i.e., omit the key from JSON) when the user hasn't supplied anything, so the backend's existing default behavior holds.

- [ ] **Step 15: Update `useCallback` dependency list of `handleGenerate`**

The `handleGenerate` `useCallback` dependency list at line 199-210 currently reads:

```tsx
}, [
  brandId,
  selectedFormats,
  platform,
  objective,
  dateFrom,
  dateTo,
  count,
  language,
  workspaceId,
  onToast,
]);
```

Add the four new state pieces. Replace the dep list with:

```tsx
}, [
  brandId,
  selectedFormats,
  platform,
  objective,
  dateFrom,
  dateTo,
  count,
  language,
  selectedProductIds,
  selectedPillars,
  customPrompt,
  referenceImages,
  workspaceId,
  onToast,
]);
```

- [ ] **Step 16: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors.

If there are errors related to `BrandWithBrain`, `Product`, or `ReferenceImageUpload` shapes, re-read `TopicsPage.tsx` for the canonical types/props. Adapt the duplicated code to match.

- [ ] **Step 17: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -5
```

Expected: pre-existing baseline only (~73 problems). No new findings on `PlannerTopicGeneratorPanel.tsx`.

- [ ] **Step 18: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
git commit -m "feat(frontend): planner panel parity with Topics page form

Add Products multi-select, Brand Content Pillars chips, Reference
Images uploader, and Additional Direction textarea to
PlannerTopicGeneratorPanel. Reorder Language into the Context section
so the section flow matches the standalone /topics page:
Brand -> Language -> Products -> Pillars -> Platform -> Objective ->
Content Formats -> Schedule -> Reference Images -> Additional
Direction -> Count -> Generate.

JSX is inline-duplicated from TopicsPage.tsx (no new shared
components). Submit body sends the four new fields only when
non-empty; the backend route already accepts them. Brand change
clears product+pillar selections and refetches the brand's active
brain content pillars.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Manual smoke (user)

**No new files.** All steps are user-driven UI verification.

- [ ] **Step 1: Final auto gates**

Agentic worker runs:

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -5
cd /Users/bellinnn/Documents/projects/fce && git status --short
git diff main..HEAD --name-only
```

Expected: 0 typecheck errors. Lint at baseline (~73 pre-existing, no new). Git status shows only the 2 pre-existing dirty files. Branch diff against main shows the 5 prior commits + the spec doc + the new panel commit.

- [ ] **Step 2: User smoke — open the panel from `/planner`**

User starts the dev server (`cd frontend && npm run dev`). Open `/planner`. Click an eligible empty future cell to open the panel. The panel renders with sections in this order:

1. Context: Brand select, Language toggle, Products chips (if brand has products), Pillars chips (if brand brain has pillars).
2. Platform & Objective: Platform tabs, Objective tabs.
3. Content Formats: format toggles.
4. Schedule: From, To.
5. Reference Images: uploader.
6. Additional Direction: textarea.
7. Count: number input.
8. Generate button.

- [ ] **Step 3: User smoke — Products selection**

Pick a brand that has products. Confirm Products chips render. Click a chip → it visually toggles to selected (filled violet). Click again → toggles off. The hint text below updates ("N products selected" or "No product selected — topics span the brand").

- [ ] **Step 4: User smoke — Pillars selection**

Pick a brand whose active brain has content pillars (e.g., BCA Life). Confirm Pillars chips render with their assigned colors. Toggle pillars on/off. When all are off, hint reads "Mixed (all pillars)".

- [ ] **Step 5: User smoke — Brand switch resets selections**

Pick brand A → toggle a product and a pillar. Switch to brand B. Confirm: products/pillars chips re-fetch for brand B, prior selections cleared. Custom prompt and reference images persist (cross-brand).

- [ ] **Step 6: User smoke — Reference Images + Additional Direction**

Drop one or two images into Reference Images. Type a sentence into Additional Direction. Both stick around as you scroll the panel.

- [ ] **Step 7: User smoke — Generate**

Click Generate Topics. Confirm the request to `POST /api/workspaces/:id/topics/generate` includes `productIds`, `pillars`, `customPrompt`, `referenceImages` in the body (use browser devtools → Network tab to verify the JSON payload). Generated topics reflect the inputs (product context in titles, pillar in tags, image-aware composition, prompt steering visible in output).

- [ ] **Step 8: User smoke — Empty submissions**

Start fresh, leave Products/Pillars/Reference Images/Additional Direction all empty. Click Generate. Confirm the request body OMITS those keys (verify in Network tab) — the request should look like the panel's behavior before this task.

- [ ] **Step 9: Push + merge (user decision)**

After all smoke steps pass:

```bash
cd /Users/bellinnn/Documents/projects/fce
git checkout main
git merge --no-ff feat/planner-click-to-schedule -m "Merge feat/planner-click-to-schedule"
git push origin main
git branch -d feat/planner-click-to-schedule
```

Same merge pattern as prior branches.

If any smoke step fails, stop and report.

---

## Self-Review

**Spec coverage:**

| Spec section / requirement | Implementing step |
|---|---|
| Add `selectedProductIds` state | Task 1 Step 4 |
| Add `selectedPillars` state | Task 1 Step 4 |
| Add `customPrompt` state | Task 1 Step 4 |
| Add `referenceImages` state | Task 1 Step 4 |
| Add `contentPillars` state (load-derived) | Task 1 Step 4 |
| Add `products` state (workspace fetch) | Task 1 Step 4 |
| Effect: fetch products on open | Task 1 Step 5 |
| Effect: fetch active brain on brand change + reset selections | Task 1 Step 6 |
| Section order: Brand → Language inside Context | Task 1 Step 8 |
| Section order: Products inside Context | Task 1 Step 9 |
| Section order: Pillars inside Context | Task 1 Step 10 |
| Section order: Reference Images after Schedule | Task 1 Step 11 |
| Section order: Additional Direction after Reference Images | Task 1 Step 12 |
| Section order: Count after Additional Direction | Task 1 Step 13 |
| Submit body adds 4 new fields when non-empty | Task 1 Step 14 |
| `useCallback` dep list updated | Task 1 Step 15 |
| Inline-duplicate from TopicsPage (no new shared components) | All Step 8-13 use direct duplication |
| `<ReferenceImageUpload>` reused (only existing component import) | Task 1 Step 2 |
| Imports include `ReferenceImageUpload` + `ImageRef` type | Task 1 Step 2 |
| Brand-change clears product/pillar selections | Task 1 Step 6 |
| customPrompt + referenceImages persist across brand switches | Task 1 Step 6 (only product/pillar reset, customPrompt/refImages NOT touched) |
| Manual smoke covering all spec edge cases | Task 2 Steps 2-8 |

No spec gaps.

**Type / property consistency:**

- `Product { id, name, brandId }` — defined Step 3, used Step 7 (`p.brandId === brandId`) and Step 9 (`p.id`, `p.name`). Consistent.
- `BrandWithBrain { id, activeBrain?: BrainVersion | null }` — defined Step 3, consumed Step 6 as `data.activeBrain?.vocabulary?.contentPillars`. The chained optional access matches the type.
- `ImageRef` — imported from existing `ReferenceImageUpload` module. The Topics page already uses it; we just import the same type alias. Consistent.
- `selectedProductIds: string[]` consumed identically in Step 9 (toggle button), Step 14 (submit body), Step 15 (dep list).
- `selectedPillars: string[]` consumed identically in Step 10, Step 14, Step 15.
- `customPrompt: string` consumed in Step 12 (textarea), Step 14 (`customPrompt.trim() || undefined`), Step 15.
- `referenceImages: ImageRef[]` consumed in Step 11 (uploader), Step 14 (filter `!i.uploading`, map `i.url`), Step 15.

All consistent.

**Placeholder scan:**

No "TBD" / "TODO" / "implement later" / "Similar to Task N" / "fill in details" markers. Each step shows the actual code. The two places that say "If actual prop names differ, adapt" (Step 2 and Step 11) explicitly point to `TopicsPage.tsx` as the source of truth and tell the engineer how to confirm — that's a real instruction, not a placeholder.
