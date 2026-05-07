# Embed GeneratePage in Planner Slider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PlannerContentGeneratorPanel` (~430 lines, inline-duplicated form) with a thin slider wrapper that mounts the standalone `GeneratePage` component, mirroring the topic generator pattern shipped earlier on this branch.

**Architecture:** Add optional embedding props (`embedded`, `initialBrandId`, `initialTopicId`, `initialProductIds`, `initialPlatform`, `initialContentType`, `initialObjective`, `onSavedContent`) to `GeneratePage` so it can be rendered inside a slider. Create a new ~80-line `ContentGeneratorSlider` that wraps `<GeneratePage embedded ... />` with the same overlay+ESC+scroll-lock chrome as `TopicGeneratorSlider`. Swap `PlannerPage` to use the new slider, then delete the old panel file.

**Tech Stack:** React 19, TypeScript, Vite. Frontend-only — no backend changes.

**Branch:** `feat/planner-embed-topics-page` (extending the same branch that shipped the topic generator slider).

---

## File Plan

### Created files

- **`frontend/src/components/planner/ContentGeneratorSlider.tsx`** (~85 lines) — Slider chrome (overlay, X button, ESC, click-outside-to-close, body scroll lock, post-save delayed close timer). Renders `<GeneratePage embedded ... />` inside.

### Modified files

- **`frontend/src/pages/GeneratePage.tsx`** (~1314 lines today) — Add 8 optional props (`embedded?`, `initialBrandId?`, `initialTopicId?`, `initialProductIds?`, `initialPlatform?`, `initialContentType?`, `initialObjective?`, `onSavedContent?`). Use `initial*` props as preferred initial values (fall back to URL `searchParams` when missing). Add `useEffect`s to sync each `initial*` into state if it changes. Fire `onSavedContent?.()` from the existing SSE `generation_complete` handler when embedded. Gate page-level chrome (outer `p-6` padding, header block, `<CoachMark>`, research-context banner) on `!embedded`.
- **`frontend/src/pages/PlannerPage.tsx`** — Swap import + render: `<PlannerContentGeneratorPanel ... />` → `<ContentGeneratorSlider ... />`. Drop the props that GeneratePage handles internally (`brands`, `products`, `onToast`). Map the existing `contentGenTopic` state to the slider's `initialTopicId` + `initialBrandId` + `initialProductIds` + `initialPlatform` props.

### Deleted files

- **`frontend/src/components/planner/PlannerContentGeneratorPanel.tsx`** (~430 lines) — No more importers after Task 3 lands.

### Not modified

- Backend, schema, routes.
- `TopicGeneratorSlider` and the rest of the topic generator stack (already shipped on this branch).
- `PlannerContentPreviewPane`, `PlannerContentPreviewPanel` — those preview the LIBRARY item, not the freshly-generated one. Keep them.
- Standalone `/generate` route works unchanged (all new props are optional).

---

## Task 1: Make `GeneratePage` embeddable

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

After this task, `GeneratePage` accepts 8 optional props. When `embedded`, it skips its page-level chrome (outer padding, header, CoachMark, research banner) but the form + preview render normally. The standalone `/generate` route continues to work because all props are optional.

- [ ] **Step 1: Read the file's landmarks**

```bash
sed -n '370,400p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx   # function signature
sed -n '720,775p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx   # outer wrapper, header, CoachMark, banner
sed -n '640,650p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/GeneratePage.tsx   # SSE handler
```

Confirm:
- Function declared at line 374: `export function GeneratePage()`.
- State initializers at lines 387, 389-392, 393, 394, 397, 402 reference `searchParams.get("brandId")` etc.
- `useSSE(...)` at line 640 fires `loadGenerations()` on `generation_complete` / `generation_failed`.
- Outer wrapper at line 725: `<div className="p-6 space-y-6">`.
- Header block at lines 727-751.
- `<CoachMark ... />` at line 752.
- Research-context banner at lines 754-771.

If line numbers have shifted, adapt — the structure is what matters.

- [ ] **Step 2: Add `GeneratePageProps` interface**

Insert directly above the function declaration at line 374:

```tsx
interface GeneratePageProps {
  /** When true, skip page-level chrome (outer padding, header, CoachMark, research banner). */
  embedded?: boolean;
  /** Pre-fill brand on mount and whenever this changes. */
  initialBrandId?: string | null;
  /** Pre-fill topic on mount and whenever this changes. */
  initialTopicId?: string | null;
  /** Pre-fill product selection on mount and whenever this changes (by product id). */
  initialProductIds?: string[];
  /** Pre-fill platform tab on mount and whenever this changes. */
  initialPlatform?: string | null;
  /** Pre-fill output format on mount and whenever this changes. */
  initialContentType?: string | null;
  /** Pre-fill objective on mount and whenever this changes. */
  initialObjective?: string | null;
  /** Called once after each successful generation completes. The Planner slider
   *  uses this to refresh its calendar/content map. */
  onSavedContent?: () => void;
}
```

- [ ] **Step 3: Update the component signature**

Replace line 374:

```tsx
export function GeneratePage() {
```

With:

```tsx
export function GeneratePage({
  embedded = false,
  initialBrandId,
  initialTopicId,
  initialProductIds,
  initialPlatform,
  initialContentType,
  initialObjective,
  onSavedContent,
}: GeneratePageProps = {}) {
```

The `= {}` default keeps `<GeneratePage />` working at the standalone route.

- [ ] **Step 4: Prefer `initial*` props in lazy state initializers**

Update each lazy initializer to prefer the new prop, falling back to existing URL search-param logic:

- Line 383: `const initialPlatformValue = initialPlatform ?? normalizePlatform(searchParams.get("platform")) || "instagram";`
  - Replace usages of `initialPlatform` later (line 393, 384) with the renamed local `initialPlatformValue`.
- Line 384: `const initialContentTypeValue = initialContentType ?? normalizeContentType(searchParams.get("format"), initialPlatformValue);`
  - Update line 394 to use `initialContentTypeValue`.
- Line 385: `const initialObjectiveValue = initialObjective ?? normalizeObjective(searchParams.get("objective"));`
  - Update line 402 to use `initialObjectiveValue`.
- Line 387: `const [brandId, setBrandId] = useState(initialBrandId ?? searchParams.get("brandId") ?? "");`
- Lines 389–392: `const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {`
  ```tsx
  if (initialProductIds && initialProductIds.length > 0) return initialProductIds;
  const ids = searchParams.getAll("productId");
  return ids.length > 0 ? ids : [];
  });
  ```
- Line 397: `const [contentTopicId, setContentTopicId] = useState(initialTopicId ?? searchParams.get("topicId") ?? "");`

Renaming the three local helpers (`initialPlatform` → `initialPlatformValue`, etc.) avoids name collision with the prop. After this step the prop names exist as the source of truth and the local "computed defaults" are renamed.

- [ ] **Step 5: Add `useEffect`s syncing each `initial*` prop into state on change**

Insert after the existing `useSearchParams`/`searchParams.get(...)` block but before the existing `loadInitialData` effect (around line 577). Each effect mirrors the topic-generator pattern:

```tsx
useEffect(() => {
  if (initialBrandId) setBrandId(initialBrandId);
}, [initialBrandId]);

useEffect(() => {
  if (initialTopicId) setContentTopicId(initialTopicId);
}, [initialTopicId]);

useEffect(() => {
  if (initialProductIds && initialProductIds.length > 0) {
    setSelectedProductIds(initialProductIds);
  }
}, [initialProductIds]);

useEffect(() => {
  if (initialPlatform) setPlatform(initialPlatform);
}, [initialPlatform]);

useEffect(() => {
  if (initialContentType) setContentType(initialContentType);
}, [initialContentType]);

useEffect(() => {
  if (initialObjective) setObjective(initialObjective);
}, [initialObjective]);
```

Falsy-guard means the standalone route (no props) gets no overrides.

- [ ] **Step 6: Fire `onSavedContent` from the SSE handler when embedded**

The existing handler at line 640:

```tsx
useSSE((event) => {
  if (event.type === "generation_complete" || event.type === "generation_failed") {
    setPendingRequestId(null);
    loadGenerations();
  }
});
```

Change to:

```tsx
useSSE((event) => {
  if (event.type === "generation_complete" || event.type === "generation_failed") {
    setPendingRequestId(null);
    loadGenerations();
    if (embedded && event.type === "generation_complete") {
      onSavedContent?.();
    }
  }
});
```

The host (`PlannerPage`) refreshes its content map on this signal so the calendar's "View Content" button lights up. We don't auto-close the slider — users may want to regenerate, and the standalone topic generator pattern's "delayed close after Save All" doesn't apply to per-generation events.

- [ ] **Step 7: Gate page-level chrome on `!embedded`**

Replace the outer wrapper, header, CoachMark, and research banner. Current shape (around line 724):

```tsx
return (
  <div className="p-6 space-y-6">
    {/* Header */}
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-black">Content Generator</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate platform-native content from Brand Brain and Product Brain.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <HelpButton pageKey="generate" />
        <span className="text-sm text-gray-500">{advancedMode ? "Advanced mode" : "Basic mode"}</span>
        <button ...>...</button>
      </div>
    </div>
    <CoachMark pageKey="generate" title="Generate content" body="..." />

    {researchContext && (
      <div className="flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 mb-4">
        ...
      </div>
    )}

    {loading ? ( ... ) : (
      <div className="flex gap-6">
        ...
```

Replace with:

```tsx
return (
  <div className={`${embedded ? "" : "p-6 "}space-y-6`}>
    {!embedded && (
      <>
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-black">Content Generator</h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate platform-native content from Brand Brain and Product Brain.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton pageKey="generate" />
            <span className="text-sm text-gray-500">{advancedMode ? "Advanced mode" : "Basic mode"}</span>
            <button
              type="button"
              onClick={() => setAdvancedMode(!advancedMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                advancedMode ? "bg-indigo-600" : "bg-gray-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  advancedMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
        <CoachMark pageKey="generate" title="Generate content" body="Generate content by picking a product and describing the angle. FCE runs the job in the background — you can keep working, and we'll notify you when it's done." />

        {researchContext && (
          <div className="flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-violet-300">
              <Sparkles size={16} />
              <span>Using research as inspiration: {researchTitle || "Research result"}</span>
            </div>
            <button
              onClick={() => {
                searchParams.delete("researchContext");
                searchParams.delete("researchTitle");
                setSearchParams(searchParams);
              }}
              className="text-xs text-violet-400 hover:text-violet-200"
            >
              Dismiss
            </button>
          </div>
        )}
      </>
    )}

    {loading ? (
      <div className="flex justify-center py-12"><Spinner /></div>
    ) : (
      <div className={`flex gap-6${embedded ? " px-6" : ""}`}>
        {/* ... rest of page unchanged */}
```

Three edits in this step:

1. Outer `<div>` className becomes `${embedded ? "" : "p-6 "}space-y-6`.
2. Wrap `header + CoachMark + research banner` in `{!embedded && (<>...</>)}`.
3. The form-and-results `<div className="flex gap-6">` after the loading branch gets `px-6` appended when embedded so the columns aren't flush against the slider edge. Note: the slider itself adds `px-6` on its inner wrapper, so this `px-6` on the inner columns wrapper is redundant — but matches the topic generator's pattern. The slider provides `px-6`; remove this conditional only if Task 2's slider also adds `px-6`. (See Task 2 Step 2.)

Decision: align with TopicGeneratorSlider's final design — slider provides `px-6`, GeneratePage embedded mode does NOT add it. So leave the `flex gap-6` wrapper as a constant `<div className="flex gap-6">` (no embedded condition). The slider's body wrapper is the single owner of horizontal padding.

- [ ] **Step 8: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
```

Expected: ~72 problems baseline (no new findings on `GeneratePage.tsx`).

- [ ] **Step 10: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat(frontend): GeneratePage gains optional embedded mode

Add 8 optional props for slider embedding:
- embedded: skips page-level chrome (outer padding, header,
  CoachMark, research banner).
- initialBrandId / initialTopicId / initialProductIds /
  initialPlatform / initialContentType / initialObjective: pre-fill
  state on mount and whenever each value changes. Each falls back to
  the existing URL search-param when no prop is passed.
- onSavedContent: called from the SSE generation_complete handler so
  a host (the planner slider) can refresh its calendar/content map.

Standalone /generate route is unchanged because all props are
optional with sensible URL-param fallbacks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create `ContentGeneratorSlider`

**Files:**
- Create: `frontend/src/components/planner/ContentGeneratorSlider.tsx`

After this task, the slider component exists but no caller uses it yet.

- [ ] **Step 1: Read the existing `TopicGeneratorSlider` for reference**

```bash
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/TopicGeneratorSlider.tsx
```

The new slider mirrors that file's structure (overlay, X button, ESC handler, body-scroll lock, click-outside-to-close, role=dialog). The differences:
- Forwards a different prop set (brand, topic, products, platform).
- No post-save auto-close timer (per Task 1 Step 6, content gen does not auto-close).

- [ ] **Step 2: Create the file**

Create `frontend/src/components/planner/ContentGeneratorSlider.tsx`:

```tsx
import { useEffect } from "react";
import { X } from "lucide-react";
import { GeneratePage } from "../../pages/GeneratePage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialBrandId?: string | null;
  initialTopicId?: string | null;
  initialProductIds?: string[];
  initialPlatform?: string | null;
  initialContentType?: string | null;
  initialObjective?: string | null;
  onSavedContent?: () => void;
}

/**
 * Slider chrome that mounts the standalone GeneratePage in `embedded` mode.
 *
 * Used by the Planner page so users can generate content for a topic in
 * a slide-over without leaving the calendar context. The slider does NOT
 * auto-close after a generation — users may want to regenerate. The
 * onSavedContent callback fires per generation so the host can refresh
 * its content map and the calendar's "View Content" affordance lights up.
 */
export function ContentGeneratorSlider({
  isOpen,
  onClose,
  initialBrandId,
  initialTopicId,
  initialProductIds,
  initialPlatform,
  initialContentType,
  initialObjective,
  onSavedContent,
}: Props) {
  // Lock body scroll + handle ESC while open.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slider panel */}
      <div
        className="relative flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-generator-slider-title"
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <h2
            id="content-generator-slider-title"
            className="text-base font-semibold text-gray-900"
          >
            Content Generator
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Embedded GeneratePage */}
        <div className="flex-1 overflow-y-auto px-6">
          <GeneratePage
            embedded
            initialBrandId={initialBrandId}
            initialTopicId={initialTopicId}
            initialProductIds={initialProductIds}
            initialPlatform={initialPlatform}
            initialContentType={initialContentType}
            initialObjective={initialObjective}
            onSavedContent={onSavedContent}
          />
        </div>
      </div>
    </div>
  );
}
```

This mirrors `TopicGeneratorSlider`'s post-Task-2-fixes shape: backdrop owns click-to-close (no `stopPropagation`), `role=dialog` + `aria-modal` + `aria-labelledby`, ESC handler, body scroll lock, `px-6` body wrapper. No auto-close timer because content gen fires `onSavedContent` per generation (not per Save All).

- [ ] **Step 3: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
```

Expected: ~72 problems baseline.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/planner/ContentGeneratorSlider.tsx
git commit -m "feat(frontend): add ContentGeneratorSlider wrapping embedded GeneratePage

Slider chrome (overlay, X button, ESC, click-outside-to-close, body
scroll lock, role=dialog/aria-modal/aria-labelledby) that mounts the
standalone GeneratePage in embedded mode. Forwards 6 initial-value
props (brand, topic, products, platform, content type, objective)
plus onSavedContent for host-side refresh.

Width: max-w-[1100px], same as TopicGeneratorSlider.

No auto-close timer — content gen fires onSavedContent per
completion, not per bulk action.

Not yet used anywhere — PlannerPage swap lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Swap `PlannerPage` to use the new slider, delete the old panel

**Files:**
- Modify: `frontend/src/pages/PlannerPage.tsx`
- Delete: `frontend/src/components/planner/PlannerContentGeneratorPanel.tsx`

After this task, the planner's content generator UX is the slider rendering GeneratePage. Old panel file is gone.

- [ ] **Step 1: Replace the import**

Find around line 13:

```tsx
import { PlannerContentGeneratorPanel } from "../components/planner/PlannerContentGeneratorPanel";
```

Replace with:

```tsx
import { ContentGeneratorSlider } from "../components/planner/ContentGeneratorSlider";
```

- [ ] **Step 2: Replace the render usage**

Find around lines 413–428 (the `<PlannerContentGeneratorPanel>` block):

```tsx
{activeWorkspace && (
  <PlannerContentGeneratorPanel
    isOpen={contentGenTopic !== null}
    onClose={() => setContentGenTopic(null)}
    workspaceId={activeWorkspace.id}
    brands={brands}
    products={products}
    topic={contentGenTopic}
    onSaved={() => {
      void loadContent();
    }}
    onToast={showToast}
  />
)}
```

Replace with:

```tsx
{activeWorkspace && (
  <ContentGeneratorSlider
    isOpen={contentGenTopic !== null}
    onClose={() => setContentGenTopic(null)}
    initialBrandId={contentGenTopic?.brandId ?? activeBrandId}
    initialTopicId={contentGenTopic?.id}
    initialProductIds={contentGenTopic?.products?.map((tp) => tp.product.id)}
    initialPlatform={contentGenTopic?.platform ?? undefined}
    initialContentType={contentGenTopic?.format ?? undefined}
    initialObjective={contentGenTopic?.objective ?? undefined}
    onSavedContent={() => { void loadContent(); }}
  />
)}
```

Behavior: `contentGenTopic` is the topic the user picked from the planner row. Map its fields into the slider's `initial*` props. `initialBrandId` falls back to `activeBrandId` (the planner's currently-viewed brand) when the topic itself has no brand association.

If `Topic` (the type imported in PlannerPage) doesn't have `objective` or `brandId` fields, just drop those `initial*` lines. Read [PlannerPage.tsx:1-90] to confirm the imported `Topic` type's shape and adjust accordingly. The minimum required mapping is: `initialTopicId`, `initialProductIds`, `initialPlatform`, `initialContentType`.

State (`contentGenTopic`, `setContentGenTopic`, `loadContent`, `activeBrandId`) is unchanged. Re-using `contentGenTopic !== null` as `isOpen` keeps the open/close trigger semantics identical.

- [ ] **Step 3: Verify no remaining importers of the old panel**

```bash
grep -rn "PlannerContentGeneratorPanel" /Users/bellinnn/Documents/projects/fce/frontend/src
```

Expected: zero matches.

- [ ] **Step 4: Delete the old panel file**

```bash
git rm /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/PlannerContentGeneratorPanel.tsx
```

- [ ] **Step 5: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
```

Expected: ~72 problems baseline (or slightly less now that ~430 lines of duplicated code are gone).

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/PlannerPage.tsx
git commit -m "feat(frontend): planner uses ContentGeneratorSlider (single source of truth)

Swap PlannerContentGeneratorPanel for ContentGeneratorSlider, which
mounts <GeneratePage embedded /> inside slider chrome. Drops the
props GeneratePage resolves internally (brands, products, onToast).
Maps the planner's contentGenTopic state into the slider's
initial* prop set so the slider opens with topic-anchored defaults.

Delete PlannerContentGeneratorPanel.tsx (~430 lines of duplicated
form JSX). All content generator UX now lives in GeneratePage; no
more drift between the standalone /generate page and the planner
slider — same as the topic generator change earlier on this branch.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: End-to-end manual smoke (user)

**No new files.** All steps are user-driven UI verification.

- [ ] **Step 1: Final auto gate**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
cd /Users/bellinnn/Documents/projects/fce && git status --short
git log --oneline main..HEAD
git diff main..HEAD --name-only
```

Expected (frontend files in branch diff):
- `frontend/src/components/planner/ContentGeneratorSlider.tsx` (added)
- `frontend/src/components/planner/PlannerContentGeneratorPanel.tsx` (deleted)
- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` (deleted, from Tasks 1-3 of the prior plan)
- `frontend/src/components/planner/TopicGeneratorSlider.tsx` (added, from prior plan)
- `frontend/src/pages/GeneratePage.tsx` (modified)
- `frontend/src/pages/PlannerPage.tsx` (modified)
- `frontend/src/pages/TopicsPage.tsx` (modified, from prior plan)

- [ ] **Step 2: User smoke — standalone `/generate` route**

User navigates to `/generate`. Confirm:
- Page renders with full chrome (header "Content Generator", subtitle, advanced-mode toggle, HelpButton, outer padding).
- Brand picker, product picker, platform tabs, format picker, generate button — all behave as before.
- URL params (`?brandId=`, `?topicId=`, `?platform=`, etc.) still pre-fill state correctly.
- Generating content from the form still works (existing flow unchanged).

- [ ] **Step 3: User smoke — planner slider opens for a topic**

Navigate to `/planner`. In the topic list/calendar, click an action that opens the content generator (e.g. the Generate button on a row). Confirm:
- Slider opens with header "Content Generator" + X close button.
- Inside the slider, GeneratePage form shows pre-filled brand, topic, products, platform, format from the topic.
- No double-header (GeneratePage's own header is hidden).
- No outer page padding from GeneratePage.
- Background scroll is locked while slider is open.
- ESC key closes the slider.
- X button closes the slider.
- Backdrop click closes the slider.

- [ ] **Step 4: User smoke — generate content inside slider**

With the form filled, click Generate Content. Submission completes. SSE eventually fires `generation_complete`. Confirm:
- Toast appears.
- Generation list inside the slider refreshes.
- Slider stays open (no auto-close — that's intentional).
- After closing the slider (X / ESC / backdrop), the planner row's content indicator updates (the View Content button lights up).

- [ ] **Step 5: User smoke — regenerate inside slider**

While slider is open and a generation has completed, modify the form and hit Generate Content again. Confirm:
- New submission goes through.
- Old preview is replaced.
- Slider still doesn't auto-close.

- [ ] **Step 6: User smoke — close + reopen behavior**

Close the slider (any method). Open it again from a different topic. Confirm:
- Form pre-fills with the new topic's brand/products/platform — no leftover state from the previous topic.

- [ ] **Step 7: Push + merge (user decision)**

After all smoke steps pass:

```bash
cd /Users/bellinnn/Documents/projects/fce
git checkout main
git merge --no-ff feat/planner-embed-topics-page -m "Merge feat/planner-embed-topics-page (topic + content gen embedded)"
git push origin main
git branch -d feat/planner-embed-topics-page
```

If any smoke step fails, stop and report.

---

## Self-Review

**Spec coverage:**

| Requirement | Implementing step |
|---|---|
| `GeneratePage` gains 8 optional props | Task 1 Step 2 + Step 3 |
| `initial*` props override URL params at mount | Task 1 Step 4 |
| `initial*` props sync state on change | Task 1 Step 5 |
| `onSavedContent` fires on `generation_complete` when embedded | Task 1 Step 6 |
| `embedded` flag gates page chrome | Task 1 Step 7 |
| Standalone `/generate` route unchanged | Task 1 Step 3 (default-empty-props) + Task 4 Step 2 (smoke) |
| New `ContentGeneratorSlider` created | Task 2 |
| Slider chrome (overlay, X, ESC, scroll lock, role=dialog) | Task 2 Step 2 |
| Slider width `max-w-[1100px]` | Task 2 Step 2 |
| `PlannerPage` swaps panel for slider | Task 3 Step 1 + Step 2 |
| Drop irrelevant props (`brands`, `products`, `onToast`, `workspaceId`) | Task 3 Step 2 |
| Map topic state into `initial*` props | Task 3 Step 2 |
| Delete `PlannerContentGeneratorPanel.tsx` | Task 3 Step 3 + Step 4 |
| State (`contentGenTopic`, `loadContent`) preserved | Task 3 Step 2 |
| Manual smoke covering edge cases | Task 4 |

**Type / property consistency:**

- `GeneratePageProps` (Task 1 Step 2) field names match the slider's `Props` field names (Task 2 Step 2): `embedded`, `initialBrandId`, `initialTopicId`, `initialProductIds`, `initialPlatform`, `initialContentType`, `initialObjective`, `onSavedContent`. End-to-end consistent.
- All `initial*` fields are `string | null | undefined` shape (matching the topic generator pattern).
- `initialProductIds` is `string[] | undefined` (no nullable).
- `onSavedContent: () => void` matches the topic generator's `onSavedTopics: () => void`.
- `setBrandId`, `setContentTopicId`, `setSelectedProductIds`, `setPlatform`, `setContentType`, `setObjective` are pre-existing `useState` setters in GeneratePage — verified in Step 1's read.
- `loadContent` referenced in Task 3 Step 2 is pre-existing in PlannerPage.

**Placeholder scan:**

No "TBD" / "TODO" / "implement later" / "Similar to Task N" / "fill in details" markers. Every code block is concrete.

The conditional-adaptation note in Task 3 Step 2 ("If `Topic` doesn't have `objective` or `brandId` fields, just drop those `initial*` lines") includes an explicit fallback (the minimum required mapping), not abstract advice.
