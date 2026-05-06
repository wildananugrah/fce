# Planner Topic Generator Panel — Parity with Topics Page

**Date:** 2026-05-06
**Status:** Spec
**Owner:** Frontend

## Problem

The `PlannerTopicGeneratorPanel` (slide-over from `/planner`) is missing four input fields that the standalone Topics page (`/topics`) has been generating against for months. Power users who land in the Planner panel and want product-context, pillar-filtered, image-referenced, or prompt-steered topics are forced back to the Topics page — losing the date context the Planner panel just gave them. The submit shape is already aligned (the backend route accepts all four fields), so the gap is purely on the form UI side.

## Goals

- Bring the Planner panel to **functional parity** with the Topics page form: same fields, same labels, same submit body shape.
- Match the **section order** of the Topics page so users moving between the two surfaces get a consistent layout.
- Preserve the panel's existing behavior: schedule fields, count, format toggles, brand-driven defaults, and the `initialDate` override added in the prior task.

## Non-Goals

- **Extracting shared sub-components.** Each new section's JSX is inline-duplicated from `TopicsPage.tsx`. A future refactor PR can extract `<BrandPillarPicker>`, `<ProductMultiSelect>`, `<AdditionalDirectionField>` into a shared folder if a third consumer ever appears.
- **Backend / API changes.** The four new fields (`productIds`, `pillars`, `customPrompt`, `referenceImages`) are already accepted by `/api/workspaces/:id/topics/generate`.
- **Schema, migration, tests.** Frontend-only feature; no DB columns added; no test suite to update.
- **Layout convergence.** The panel stays a side drawer; the Topics page stays a full-page two-column layout. Only the form **section order** matches; the chrome around it does not.

## Architecture

```
   ┌─────────────────────────────────────────────────────┐
   │  PlannerTopicGeneratorPanel.tsx                     │
   │                                                     │
   │   New state (4 user inputs + 2 load-derived):       │
   │     selectedProductIds: string[]                    │
   │     selectedPillars: string[]                       │
   │     customPrompt: string                            │
   │     referenceImages: ImageRef[]                     │
   │     contentPillars: string[]    (from brand brain)  │
   │     products: Product[]         (workspace fetch)   │
   │                                                     │
   │   New effects:                                      │
   │     onMount/openChange  → fetch /products           │
   │     onBrandChange       → fetch active brain →      │
   │                           set contentPillars +      │
   │                           clear product/pillar      │
   │                           selections                │
   │                                                     │
   │   Section order (matches Topics page):              │
   │     1. Brand                                        │
   │     2. Language                                     │
   │     3. Products             (NEW)                   │
   │     4. Brand Content Pillars (NEW)                  │
   │     5. Platform                                     │
   │     6. Objective                                    │
   │     7. Content Formats                              │
   │     8. Schedule (dateFrom, dateTo)                  │
   │     9. Reference Images     (NEW)                   │
   │     10. Additional Direction (NEW)                  │
   │     11. Count                                       │
   │     12. Generate button                             │
   │                                                     │
   │   Submit body adds (only when non-empty):           │
   │     productIds, pillars, customPrompt,              │
   │     referenceImages                                  │
   └─────────────────────────────────────────────────────┘
```

Three structural callouts:

1. **No new shared component / file.** Every new section is inline-duplicated JSX from `TopicsPage.tsx`. The shared `<ReferenceImageUpload>` component (already in the codebase) is the one exception — it gets imported, not copied.
2. **Brand-pillar fetch piggybacks on the existing brand-changed effect.** The Topics page calls `GET /api/workspaces/:id/brands/:brandId` and reads `data.activeBrain.vocabulary.contentPillars`. The Panel currently fetches the brand list but not the active brain. We add a second fetch keyed on `brandId`.
3. **Products list source.** Mirror `TopicsPage.tsx` — fetch `/api/workspaces/:id/products` once when the panel opens, filter client-side by `product.brandId === brandId`.

## Frontend Changes

### File: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`

#### Imports

Add at the top of the file (matching how `TopicsPage.tsx` imports):

```tsx
import { ReferenceImageUpload, type ImageRef } from "../ui/ReferenceImageUpload";
import { getPillarColor } from "../../utils/pillar-colors";
```

(The existing file may already pull from one of those utility paths — confirm before adding duplicate imports.)

Add type definitions near the top (mirror `TopicsPage.tsx` lines ~25-40 verbatim):

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

(Adapt names to match the actual existing `Brand` interface in the file. The point is `activeBrain.vocabulary.contentPillars` should be type-reachable.)

#### New state (alongside existing state declarations)

```tsx
const [products, setProducts] = useState<Product[]>([]);
const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
const [contentPillars, setContentPillars] = useState<string[]>([]);
const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
const [customPrompt, setCustomPrompt] = useState("");
const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
```

#### New effect — fetch products

```tsx
useEffect(() => {
  if (!isOpen || !workspaceId) return;
  api<Product[]>(`/api/workspaces/${workspaceId}/products`)
    .then((p) => setProducts(p))
    .catch(() => setProducts([]));
}, [isOpen, workspaceId]);
```

#### New effect — fetch active brain content pillars when brand changes

```tsx
useEffect(() => {
  if (!brandId || !workspaceId) {
    setContentPillars([]);
    setSelectedPillars([]);
    setSelectedProductIds([]);
    return;
  }
  // Reset selections when brand changes
  setSelectedProductIds([]);
  setSelectedPillars([]);

  api<BrandWithBrain>(`/api/workspaces/${workspaceId}/brands/${brandId}`)
    .then((data) => {
      setContentPillars(data.activeBrain?.vocabulary?.contentPillars ?? []);
    })
    .catch(() => setContentPillars([]));
}, [brandId, workspaceId]);
```

#### Filtered-products derived value (near the render)

```tsx
const filteredProducts = products.filter((p) => p.brandId === brandId);
```

#### New JSX sections

Insert in the existing form's section flow, in this order:

**Products section** (after Language, before Platform):

```tsx
{brandId && filteredProducts.length > 0 && (
  <Field label="Products">
    <p className="text-xs text-gray-500 mb-2">
      Select one or more products for cross-product topics.
    </p>
    <div className="flex flex-wrap gap-2">
      {filteredProducts.map((p) => {
        const selected = selectedProductIds.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setSelectedProductIds((curr) =>
                selected ? curr.filter((id) => id !== p.id) : [...curr, p.id],
              );
            }}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
              selected
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700 border-gray-300 hover:border-indigo-400"
            }`}
          >
            {selected ? "✓ " : ""}{p.name}
          </button>
        );
      })}
    </div>
    <p className="text-xs text-gray-400 mt-1.5">
      {selectedProductIds.length === 0
        ? "No product selected — topics span the brand"
        : `${selectedProductIds.length} product${selectedProductIds.length === 1 ? "" : "s"} selected`}
    </p>
  </Field>
)}
```

**Brand Content Pillars section** (after Products):

```tsx
{brandId && contentPillars.length > 0 && (
  <Field label="Brand Content Pillars">
    <p className="text-xs text-gray-500 mb-2">
      Pick one or more pillars, or leave blank to mix across all.
    </p>
    <div className="flex flex-wrap gap-2">
      {contentPillars.map((p) => {
        const selected = selectedPillars.includes(p);
        const colorClass = selected
          ? getPillarColor(p)
          : "bg-gray-50 text-gray-600 border-gray-200";
        return (
          <button
            key={p}
            type="button"
            onClick={() => {
              setSelectedPillars((curr) =>
                selected ? curr.filter((x) => x !== p) : [...curr, p],
              );
            }}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${colorClass}`}
          >
            {p}
          </button>
        );
      })}
    </div>
    {selectedPillars.length === 0 && (
      <p className="text-xs text-gray-400 mt-1.5">Mixed (all pillars)</p>
    )}
  </Field>
)}
```

**Reference Images section** (after Schedule, before Additional Direction):

```tsx
<Field label="Reference Images (optional)">
  <ReferenceImageUpload
    workspaceId={workspaceId}
    images={referenceImages}
    onChange={setReferenceImages}
  />
</Field>
```

**Additional Direction section** (after Reference Images, before Count):

```tsx
<Field label="Additional Direction (optional)">
  <textarea
    value={customPrompt}
    onChange={(e) => setCustomPrompt(e.target.value)}
    placeholder="e.g. focus on Q4 promo angles, or steer towards founder-led storytelling"
    rows={3}
    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
  />
  <p className="text-xs text-gray-400 mt-1.5">
    Free-text guidance the AI will follow alongside the brand brain.
  </p>
</Field>
```

#### Submit body changes

The existing `handleGenerate` (or equivalent) sends a JSON body to `POST /api/workspaces/:id/topics/generate`. Extend it (mirror `TopicsPage.tsx` lines ~305-325):

```tsx
body: JSON.stringify({
  brandId,
  // ...existing fields preserved
  productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
  pillars: selectedPillars.length > 0 ? selectedPillars : undefined,
  customPrompt: customPrompt.trim() || undefined,
  referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
    ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
    : undefined,
  // ...rest preserved
}),
```

The pattern: send `undefined` (i.e., omit the field) when the user hasn't supplied anything, so the backend's existing default behavior holds.

#### Reset behavior

No change to the existing `isOpen`-driven reset effect for the 4 new fields — they retain their values across panel re-opens within the same session, matching how the Topics page behaves. The brand-change effect resets product + pillar selections (because they're brand-scoped). `customPrompt` and `referenceImages` persist across brand switches (matching Topics page).

## Testing

### Manual smoke

1. Open `/planner`. Click an eligible empty future cell. Panel opens.
2. Verify the four new sections appear in order: Products → Pillars (after Brand+Language, before Platform), Reference Images → Additional Direction (after Schedule, before Count).
3. Pick a brand with products + brand brain pillars. Products section populates with the brand's products. Pillars section populates with colored chips. Hint text reads "Mixed (all pillars)" when nothing selected.
4. Toggle a product chip → it visually selects (indigo bg). Toggle off → deselects (white bg).
5. Toggle pillars → colored fill on selected, gray on unselected.
6. Type into Additional Direction. Drop an image into Reference Images.
7. Click Generate Topics. Confirm the generated topics reflect the inputs (product context in titles, pillar in tags, image-aware composition, prompt steering visible in output).
8. Switch brand → product + pillar selections clear, contentPillars re-fetch from the new brand. Custom prompt and reference images persist.
9. Close panel → re-open via Generate button. Verify the panel does not throw away brand-driven state mid-session (matches Topics page).

### Automated

No frontend test suite. Skip.

## Files

### Modified

- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` — 6 new state hooks, 2 new effects, 4 new JSX sections, 4 new submit body fields, ~140-180 net lines added (matches the inline-duplicate volume from TopicsPage).

### Not modified

- `frontend/src/pages/TopicsPage.tsx` — the source of the duplicated JSX. Stays as-is.
- Backend, schema, route, repository — no changes.
- Other Planner subcomponents (`PlannerListView`, `PlannerContentGeneratorPanel`, etc.) — out of scope.

## Rollout

Single PR, single commit acceptable. Backwards-compatible at the API level (new submit fields are optional). No feature flag, no migration. Layered cleanly on top of the prior `feat/planner-click-to-schedule` branch (currently 5 commits ahead of `main`).

## Open Questions

None.
