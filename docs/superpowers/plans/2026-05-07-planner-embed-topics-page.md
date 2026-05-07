# Embed TopicsPage in Planner Slider — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `PlannerTopicGeneratorPanel` (~701 lines, inline-duplicated form) with a thin slider wrapper that mounts the standalone `TopicsPage` component, so the topic generator form has a single source of truth.

**Architecture:** Add three optional props (`initialDate`, `onSavedTopics`, `embedded`) to `TopicsPage` so it can be rendered inside a slider without breaking the standalone `/topics` route. Create a new ~80-line `TopicGeneratorSlider` component that wraps `<TopicsPage embedded ... />` with overlay + close button. Swap `PlannerPage` to use the new slider, then delete the old panel file.

**Tech Stack:** React 19, TypeScript, Vite. Frontend-only — no backend changes.

**Spec:** [docs/superpowers/specs/2026-05-07-planner-embed-topics-page-design.md](docs/superpowers/specs/2026-05-07-planner-embed-topics-page-design.md)

---

## Pre-flight

- [ ] **Step 0: Confirm clean working tree on a feature branch**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status
git checkout -b feat/planner-embed-topics-page
```

Pre-existing dirty files (`.claude/settings.local.json`, `docs/notes.md`) follow the branch and stay unstaged.

---

## File Plan

### Created files

- **`frontend/src/components/planner/TopicGeneratorSlider.tsx`** (~80 lines) — Slider chrome (overlay, X button, click-outside-to-close). Renders `<TopicsPage embedded initialDate={initialDate} onSavedTopics={...} />` inside. Width: `max-w-[1100px]`.

### Modified files

- **`frontend/src/pages/TopicsPage.tsx`** (~1139 lines today) — Add 3 optional props (`initialDate?`, `onSavedTopics?`, `embedded?`). Add `initialDate` override effect. Call `onSavedTopics?.()` after successful bulk save. Gate page-level chrome (outer `p-6` padding, header block lines 410–445, `<CoachMark>` line 446) on `!embedded`. Move the Save All button to an alternate render location when embedded (so it stays visible).
- **`frontend/src/pages/PlannerPage.tsx`** (~493 lines) — Swap import and render: `<PlannerTopicGeneratorPanel ... />` → `<TopicGeneratorSlider ... />`. Drop the props that TopicsPage handles internally (`brands`, `initialBrandId`, `onEditTopic`, `onToast`).

### Deleted files

- **`frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`** (~701 lines) — No more importers after Task 3 lands.

### Not modified

- Backend, schema, routes, repository.
- `TopicCalendarView`, `PlannerListView`, `PlannerContentGeneratorPanel`, `PlannerContentPreviewPane`, `PlannerContentPreviewPanel`.
- Standalone `/topics` route works unchanged (TopicsPage's new props are all optional).

### Skipped from spec

- **"Count → Number of Topics" rename on TopicsPage.** The spec carried this over from the panel-side rename context. Inspection of TopicsPage shows the count slider's visible label already reads "Number of topics: {count}" (line 777). No rename needed on TopicsPage. The rename is moot once `PlannerTopicGeneratorPanel` is deleted (Task 3).

---

## Task 1: Make `TopicsPage` embeddable

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

After this task, `TopicsPage` accepts three optional props (`initialDate`, `onSavedTopics`, `embedded`). When `embedded`, it skips its page-level chrome (outer padding, header block, CoachMark) but keeps the Save All affordance visible in a different position. The standalone `/topics` route continues to work because all props are optional.

- [ ] **Step 1: Read the file's landmarks**

```bash
sed -n '110,160p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx
sed -n '370,460p' /Users/bellinnn/Documents/projects/fce/frontend/src/pages/TopicsPage.tsx
```

Confirm:
- Component declared at line 116: `export function TopicsPage()` (no props).
- `dateFrom` / `dateTo` state at lines 143–151 (lazy initializers using today + 30 days).
- `handleSaveAll` at line 378.
- Outer wrapper at line 408: `<div className="p-6 space-y-6">`.
- Header block at lines 410–445 (title, subtitle, HelpButton, Save All button conditional).
- `<CoachMark ... />` at line 446.

If line numbers have shifted, adapt — the structure is what matters.

- [ ] **Step 2: Add `TopicsPageProps` interface**

Insert directly above the function declaration at line 116:

```tsx
interface TopicsPageProps {
  /**
   * When set, force dateFrom = dateTo = this YYYY-MM-DD value on mount.
   * Used by the Planner slider's click-to-schedule flow.
   */
  initialDate?: string | null;
  /**
   * Called after a successful bulk save of generated topics.
   * The Planner slider uses this to close itself + refresh the calendar.
   */
  onSavedTopics?: () => void;
  /**
   * Render without page-level chrome (outer padding, page header, CoachMark).
   * The slider's own header is the only one shown when embedded.
   */
  embedded?: boolean;
}
```

- [ ] **Step 3: Update the component signature to accept props**

Replace line 116:

```tsx
export function TopicsPage() {
```

With:

```tsx
export function TopicsPage({
  initialDate,
  onSavedTopics,
  embedded = false,
}: TopicsPageProps = {}) {
```

The `= {}` default allows `<TopicsPage />` (no props) to keep working at the standalone route.

- [ ] **Step 4: Add `initialDate` override effect**

Find a stable spot in the existing useEffect block (after the `dateFrom`/`dateTo` lazy init at lines 143–151 is established). A clean place is after all the existing `useState` declarations and before the first `useEffect`. Insert:

```tsx
useEffect(() => {
  if (initialDate) {
    setDateFrom(initialDate);
    setDateTo(initialDate);
  }
}, [initialDate]);
```

If the file already has a similar mount effect we can extend, do that instead. Otherwise the dedicated effect above is correct: it only runs on `initialDate` change (including initial mount), and only mutates state when `initialDate` is truthy. When `initialDate` is `undefined` / `null` (standalone route case), the effect is a no-op and the existing lazy defaults stand.

- [ ] **Step 5: Call `onSavedTopics?.()` after successful bulk save**

Find `handleSaveAll` at line 378. Current body:

```tsx
const handleSaveAll = async () => {
  // Topics are already saved in the backend as drafts, this is just confirmation
  setSaving(true);
  try {
    showToast("All topics saved to library!", "success");
    setTopicsSaved(true);
  } finally {
    setSaving(false);
  }
};
```

Replace with:

```tsx
const handleSaveAll = async () => {
  // Topics are already saved in the backend as drafts, this is just confirmation
  setSaving(true);
  try {
    showToast("All topics saved to library!", "success");
    setTopicsSaved(true);
    onSavedTopics?.();
  } finally {
    setSaving(false);
  }
};
```

The single new line — `onSavedTopics?.();` after `setTopicsSaved(true)` — is what tells the Planner slider to close itself and refresh the calendar. Optional chaining means standalone-route mounts (no callback) are unaffected.

- [ ] **Step 6: Gate page-level chrome on `!embedded`**

Replace line 408 (the outer wrapper) and the header + CoachMark blocks. Current shape:

```tsx
return (
  <div className="p-6 space-y-6">
    {/* Header */}
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-black">
          Topic Generator
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Generate a bulk content calendar before building
          individual posts.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <HelpButton pageKey="topics" />
        {generatedTopics.length > 0 && !topicsSaved && (
          <Button
            onClick={handleSaveAll}
            loading={saving}
            className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-lg"
          >
            <svg ...>
              <path .../>
            </svg>
            Save All Topics
          </Button>
        )}
      </div>
    </div>
    <CoachMark pageKey="topics" title="Topics" body="..." />

    {loading ? (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    ) : (
      <div className="flex gap-6">
        {/* ... rest of page */}
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
            <h1 className="text-2xl font-bold text-black">
              Topic Generator
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Generate a bulk content calendar before building
              individual posts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <HelpButton pageKey="topics" />
            {generatedTopics.length > 0 && !topicsSaved && (
              <Button
                onClick={handleSaveAll}
                loading={saving}
                className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-lg"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Save All Topics
              </Button>
            )}
          </div>
        </div>
        <CoachMark pageKey="topics" title="Topics" body="Topics are content ideas you can save, refine, and turn into posts later. Useful for capturing ideas you're not ready to generate yet." />
      </>
    )}

    {/* When embedded, Save All goes in its own right-aligned row above
        the form/results columns so the user can still commit a generation. */}
    {embedded && generatedTopics.length > 0 && !topicsSaved && (
      <div className="flex justify-end px-6 pt-4">
        <Button
          onClick={handleSaveAll}
          loading={saving}
          className="!bg-indigo-600 hover:!bg-indigo-700 !rounded-lg"
        >
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
          Save All Topics
        </Button>
      </div>
    )}

    {loading ? (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    ) : (
      <div className={`flex gap-6${embedded ? " px-6" : ""}`}>
        {/* ... rest of page unchanged */}
```

Three structural edits in this step:

1. Outer `<div>` className becomes conditional: `${embedded ? "" : "p-6 "}space-y-6`. When embedded, no outer padding (the slider provides its own).
2. The entire page header block + CoachMark are wrapped in `{!embedded && (<>...</>)}`. When embedded, they're hidden.
3. A new alternate-position Save All block is added, gated on `embedded && generatedTopics.length > 0 && !topicsSaved`. It uses the same `Button` + SVG markup as the original. The `px-6 pt-4` gives it some padding since the outer wrapper has none in embedded mode.
4. The form-and-results `<div className="flex gap-6">` (immediately after the loading branch) gets `px-6` appended when embedded so the columns aren't flush against the slider edge.

If the actual JSX layout differs (e.g. there's a container wrapper around the columns we missed), apply the same conditional logic — strip outer padding when embedded, gate header/CoachMark on `!embedded`, add Save All in alternate location.

- [ ] **Step 7: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors. The new optional props don't break the standalone route since they're optional with sensible defaults.

- [ ] **Step 8: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
```

Expected: pre-existing baseline (~73 problems, 70 errors, 3 warnings). No new findings on `TopicsPage.tsx`.

- [ ] **Step 9: Smoke check standalone route still works**

Start the dev server (`cd frontend && npm run dev`), navigate to `/topics`. Confirm:
- Page renders with full chrome (header "Topic Generator", subtitle, outer padding).
- Form + results columns layout looks the same as before.
- Generate Topics still works.
- Save All still works (toast appears).

If any of these regressed, the gate logic in Step 6 has a bug.

- [ ] **Step 10: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/TopicsPage.tsx
git commit -m "feat(frontend): TopicsPage gains optional embedded mode

Add three optional props for slider embedding:
- initialDate: forces dateFrom/dateTo on mount (click-to-schedule).
- onSavedTopics: called after successful bulk save (so a host can
  close itself + refresh).
- embedded: skips page-level chrome (outer padding, header,
  CoachMark) and renders Save All in an alternate position so the
  slider's own header is the only one visible.

Standalone /topics route is unchanged because all props are optional.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Create `TopicGeneratorSlider`

**Files:**
- Create: `frontend/src/components/planner/TopicGeneratorSlider.tsx`

After this task, the slider component exists but no caller uses it yet. Standalone build still passes.

- [ ] **Step 1: Confirm `lucide-react` X icon import location**

Other Planner files use `import { X } from "lucide-react"`. Confirm with:

```bash
grep -rnE "from \"lucide-react\"" /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner | head -5
```

- [ ] **Step 2: Create the file**

Create `frontend/src/components/planner/TopicGeneratorSlider.tsx`:

```tsx
import { X } from "lucide-react";
import { TopicsPage } from "../../pages/TopicsPage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  initialDate?: string | null;
  onSavedTopics?: () => void;
}

/**
 * Slider chrome that mounts the standalone TopicsPage in `embedded` mode.
 *
 * Used by the Planner page so users can generate topics in a slide-over
 * without leaving the calendar context. After a successful bulk save,
 * the slider auto-closes (TopicsPage fires onSavedTopics → handler calls
 * onSavedTopics?.() then onClose()).
 */
export function TopicGeneratorSlider({
  isOpen,
  onClose,
  initialDate,
  onSavedTopics,
}: Props) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      {/* Slider panel */}
      <div
        className="relative flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            Topic Generator
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

        {/* Embedded TopicsPage */}
        <div className="flex-1 overflow-y-auto">
          <TopicsPage
            embedded
            initialDate={initialDate}
            onSavedTopics={() => {
              onSavedTopics?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

The `workspaceId` prop is accepted for API parity with the prior panel but not used inside the slider — `TopicsPage` resolves the active workspace internally. Keeping the prop name in `Props` makes the swap in Task 3 a literal substitution at the PlannerPage call site.

- [ ] **Step 3: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors. The new file imports `TopicsPage` (now accepts the props from Task 1) and `X` from lucide-react (already installed).

- [ ] **Step 4: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
```

Expected: baseline. The unused `workspaceId` prop will trigger ESLint's `@typescript-eslint/no-unused-vars` warning in some configs. If it does, prefix with underscore: `workspaceId: _workspaceId`. Or just drop the prop from the interface — the trade-off is the swap in Task 3 needs to remove the prop too. Easier to keep + underscore.

If lint complains, update the destructure:

```tsx
export function TopicGeneratorSlider({
  isOpen,
  onClose,
  initialDate,
  onSavedTopics,
}: Props) {
```

That's the version above — already drops `workspaceId` from the destructure. Lint should be clean since `workspaceId` is in the type but unused props in a destructure are not flagged in the project config (verified in prior tasks).

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/planner/TopicGeneratorSlider.tsx
git commit -m "feat(frontend): add TopicGeneratorSlider wrapping embedded TopicsPage

Slider chrome (overlay, X button, click-outside-to-close) that mounts
the standalone TopicsPage in embedded mode. After a successful bulk
save, the slider auto-closes via the onSavedTopics → onClose chain.

Width: max-w-[1100px] so the TopicsPage's two-column form+results
layout fits without horizontal scrolling.

Not yet used anywhere — PlannerPage swap lands in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Swap `PlannerPage` to use the new slider, delete the old panel

**Files:**
- Modify: `frontend/src/pages/PlannerPage.tsx`
- Delete: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`

After this task, the new flow is live: clicking a Planner cell or the Generate button opens the slider rendering TopicsPage. Old panel file is gone.

- [ ] **Step 1: Replace the import in `PlannerPage.tsx`**

Find the existing import (around line 12):

```tsx
import { PlannerTopicGeneratorPanel } from "../components/planner/PlannerTopicGeneratorPanel";
```

Replace with:

```tsx
import { TopicGeneratorSlider } from "../components/planner/TopicGeneratorSlider";
```

- [ ] **Step 2: Replace the render usage**

Find the current render (around lines 446–457):

```tsx
{activeWorkspace && (
  <PlannerTopicGeneratorPanel
    isOpen={generatorOpen}
    onClose={() => {
      setGeneratorOpen(false);
      setPendingScheduleDate(null);
    }}
    workspaceId={activeWorkspace.id}
    brands={brands}
    initialBrandId={activeBrandId}
    initialDate={pendingScheduleDate}
    onSavedTopics={loadTopics}
    onEditTopic={(topic) => setDetailTopic(topic)}
    onToast={showToast}
  />
)}
```

Replace with:

```tsx
{activeWorkspace && (
  <TopicGeneratorSlider
    isOpen={generatorOpen}
    onClose={() => {
      setGeneratorOpen(false);
      setPendingScheduleDate(null);
    }}
    workspaceId={activeWorkspace.id}
    initialDate={pendingScheduleDate}
    onSavedTopics={loadTopics}
  />
)}
```

Four props are dropped because TopicsPage handles them internally:
- `brands` — TopicsPage fetches its own brand list.
- `initialBrandId` — TopicsPage uses its own active-workspace brand defaults.
- `onEditTopic` — TopicsPage handles topic editing in its own results pane.
- `onToast` — TopicsPage uses its own toast mechanism.

State (`generatorOpen`, `pendingScheduleDate`) and the `<TopicCalendarView onEmptyCellClick=...>` wiring stay unchanged.

- [ ] **Step 3: Verify no remaining importers of the old panel**

```bash
grep -rn "PlannerTopicGeneratorPanel" /Users/bellinnn/Documents/projects/fce/frontend/src
```

Expected: zero matches. If anything still references it, fix that first before deleting.

- [ ] **Step 4: Delete the old panel file**

```bash
git rm /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
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

Expected: baseline.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/PlannerPage.tsx
git commit -m "feat(frontend): planner uses TopicGeneratorSlider (single source of truth)

Swap PlannerTopicGeneratorPanel for TopicGeneratorSlider, which
mounts <TopicsPage embedded /> inside slider chrome. Drops the four
props that TopicsPage resolves internally (brands, initialBrandId,
onEditTopic, onToast).

Delete PlannerTopicGeneratorPanel.tsx (~701 lines of duplicated form
JSX). All topic generator UX now lives in TopicsPage; no more drift
between the standalone /topics page and the planner slider.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: End-to-end manual smoke (user)

**No new files.** All steps are user-driven UI verification. The agentic worker should run Steps 1-2 (auto checks), then hand off to the user for Steps 3-10.

- [ ] **Step 1: Final auto gate**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -3
cd /Users/bellinnn/Documents/projects/fce && git status --short
git log --oneline main..HEAD
```

Expected:
- 0 TypeScript errors.
- Lint at baseline (~73 problems).
- Git status shows only the 2 pre-existing dirty files.
- Branch diff shows 3 commits (Task 1, Task 2, Task 3).

- [ ] **Step 2: Confirm out-of-scope files untouched**

```bash
git diff main..HEAD --name-only
```

Expected (exactly):
- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` (deleted)
- `frontend/src/components/planner/TopicGeneratorSlider.tsx` (added)
- `frontend/src/pages/PlannerPage.tsx` (modified)
- `frontend/src/pages/TopicsPage.tsx` (modified)

No backend, no other frontend file.

- [ ] **Step 3: User smoke — standalone `/topics` route**

User starts the dev server (`cd frontend && npm run dev`). Navigate to `/topics`. Confirm:
- Page renders with full chrome (header "Topic Generator", subtitle, outer padding).
- Form + results columns layout looks identical to before.
- Generate Topics still works.
- Save All Topics button still works (toast appears).

If anything regressed, the gate logic in Task 1 Step 6 has a bug.

- [ ] **Step 4: User smoke — Planner slider opens via Generate button**

Navigate to `/planner`. Click the **Generate** button at the top of the page. Slider opens. Confirm:
- Slider header reads "Topic Generator" with an X close button.
- Inside the slider, TopicsPage form + (empty) results pane render.
- No double-header (TopicsPage's own header is hidden).
- No outer page padding from TopicsPage (slider provides chrome).

- [ ] **Step 5: User smoke — click-to-schedule pre-fills date**

In the Planner calendar, click an eligible empty future cell (e.g. May 12). Slider opens with TopicsPage's `dateFrom` and `dateTo` fields BOTH set to `2026-05-12`. Other form defaults intact.

- [ ] **Step 6: User smoke — Generate inside slider**

With form filled, click Generate Topics. TopicsPage's existing flow runs. Topics appear in the right results pane. The Save All Topics button appears (in its embedded position, above the columns).

- [ ] **Step 7: User smoke — Save All closes slider + refreshes calendar**

Click Save All Topics. Toast appears. Slider closes automatically. Planner calendar refreshes — newly scheduled topics appear on May 12 (or wherever you scheduled).

- [ ] **Step 8: User smoke — individual edit keeps slider open**

Open the slider again. Generate. In the results pane, edit one topic's title. Save the individual edit (whatever the per-row save UX is). Slider stays open. No premature close.

- [ ] **Step 9: User smoke — close behaviors**

Open the slider. Test each:
- X button → slider closes.
- Click on the dark backdrop → slider closes.
- After close, click Generate again → slider opens with TopicsPage's defaults (no leftover dates from a previous cell click).

- [ ] **Step 10: User smoke — visual layout fits**

In the open slider, confirm at typical desktop width (1440x900):
- Form column (left) and results column (right) both visible.
- No horizontal scrolling on the slider panel itself.
- No content cut off or overflowing the slider frame.

If at narrower widths (e.g. 1024px) the columns get cramped, that's expected — the slider takes full viewport on smaller screens.

- [ ] **Step 11: Push + merge (user decision)**

After all smoke steps pass:

```bash
cd /Users/bellinnn/Documents/projects/fce
git checkout main
git merge --no-ff feat/planner-embed-topics-page -m "Merge feat/planner-embed-topics-page"
git push origin main
git branch -d feat/planner-embed-topics-page
```

(Or merge without push if you prefer batched pushing, matching the prior pattern.)

If any smoke step fails, stop and report.

---

## Self-Review

**Spec coverage:**

| Spec section / requirement | Implementing step |
|---|---|
| `TopicsPage` gains 3 optional props | Task 1 Step 2 + Step 3 |
| `initialDate` overrides `dateFrom`/`dateTo` on mount | Task 1 Step 4 |
| `onSavedTopics` called after bulk save success | Task 1 Step 5 |
| `embedded` flag gates page chrome | Task 1 Step 6 |
| Standalone `/topics` route unchanged | Task 1 Step 3 (default-empty-props pattern) + Step 9 (smoke) |
| Save All button visible in embedded mode (alternate position) | Task 1 Step 6 (alternate render block) |
| New `TopicGeneratorSlider` component created | Task 2 |
| Slider chrome: overlay, X button, click-outside-to-close | Task 2 Step 2 |
| Slider width `max-w-[1100px]` | Task 2 Step 2 (width prop in className) |
| Slider auto-closes after save (chains `onSavedTopics → onClose`) | Task 2 Step 2 (handler in TopicsPage `onSavedTopics` prop) |
| `PlannerPage` swaps panel for slider | Task 3 Step 1 + Step 2 |
| Drop irrelevant props (`brands`, `initialBrandId`, `onEditTopic`, `onToast`) | Task 3 Step 2 |
| Delete `PlannerTopicGeneratorPanel.tsx` | Task 3 Step 3 + Step 4 |
| State (`generatorOpen`, `pendingScheduleDate`) preserved | Task 3 Step 2 (no state changes) |
| Click-to-schedule via `<TopicCalendarView onEmptyCellClick=...>` preserved | Task 3 Step 2 (no calendar changes) |
| Skipped: Count → Number of Topics rename on TopicsPage | File Plan "Skipped from spec" — TopicsPage already says "Number of topics" |
| Manual smoke covering edge cases | Task 4 |

No spec gaps. The one explicit deviation is the "Skipped from spec" note — TopicsPage's count label is already correct, so the rename was a leftover from the panel-deletion context.

**Type / property consistency:**

- `TopicsPageProps` defined in Task 1 Step 2, consumed in Task 1 Step 3. Three fields with consistent names: `initialDate`, `onSavedTopics`, `embedded`. Same names re-appear in `TopicGeneratorSlider`'s `Props` interface (Task 2 Step 2) where they're forwarded. Same names re-appear in `PlannerPage`'s usage (Task 3 Step 2). End-to-end consistent.
- `initialDate?: string | null` shape is consistent across all three layers (TopicsPage, slider, PlannerPage's `pendingScheduleDate` state).
- `onSavedTopics?: () => void` shape is consistent — no args, no return value, used as a "side-effect occurred" signal.
- Slider's `Props.workspaceId: string` accepted but unused. Consistent with the prior panel's API for transition compatibility; documented inline in Task 2 Step 2.
- `setDateFrom`, `setDateTo` referenced in Task 1 Step 4 are pre-existing `useState` setters at lines 143 and 147 of TopicsPage — verified in Step 1's read.
- `handleSaveAll` modified in Task 1 Step 5 — adds one new line; existing body preserved.
- `generatorOpen`, `pendingScheduleDate`, `loadTopics` referenced in Task 3 Step 2 are pre-existing in PlannerPage (state + `loadTopics` callback from prior tasks) — verified by reading lines 446–457 of PlannerPage in Task 3 Step 2's snippet.

All types and identifiers used in later tasks are defined or pre-existing per earlier task / file structure.

**Placeholder scan:**

No "TBD" / "TODO" / "implement later" / "Similar to Task N" / "fill in details" markers. Every code block is concrete and complete.

The two places with conditional adaptation language ("If line numbers have shifted, adapt" in Task 1 Step 1; "If lint complains, update the destructure" in Task 2 Step 4) are explicit fallbacks the implementer should follow if their environment differs from what the plan assumes — they include the actual fix to apply, not abstract advice.
