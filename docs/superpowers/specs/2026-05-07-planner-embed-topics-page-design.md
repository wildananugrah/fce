# Planner Slider — Embed Standalone TopicsPage

**Date:** 2026-05-07
**Status:** Spec
**Owner:** Frontend

## Problem

The Planner page has its own `PlannerTopicGeneratorPanel` (~701 lines) that inline-duplicates the form fields of the standalone `/topics` page. Two consumers, two copies — already drifting (the prior parity task had to add four sections; today's Count → Number of Topics rename has to be applied in two places). Single source of truth gives us a smaller surface, no drift risk, and unifies the post-generation review experience users see between the standalone page and the slider.

## Goals

- Render the actual `<TopicsPage>` component inside the Planner slider — same form, same results pane, same save flow.
- Preserve the click-to-schedule UX (cell click pre-fills `dateFrom = dateTo = clicked date`).
- After bulk save inside the slider, close the slider and refresh the Planner calendar.
- Standalone `/topics` route continues to work unchanged.
- Delete `PlannerTopicGeneratorPanel.tsx` after the swap.

## Non-Goals

- **Refactoring TopicsPage internals.** The file stays at its current shape and size; we add three optional props and gate page-level chrome on one of them. No extraction, no consolidation.
- **Animation, focus trap, ESC-to-close on the slider.** Matches the prior `PlannerTopicGeneratorPanel`'s feature set; can be added later as a polish PR.
- **Backend / API changes.** This is purely frontend wiring.
- **Carrying the uncommitted Count → Number of Topics rename + move from `PlannerTopicGeneratorPanel.tsx`.** That file is being deleted. The same rename is applied to `TopicsPage.tsx` instead, so the live label users see is consistent.
- **Sliding animation.** Render / unmount is instant. YAGNI for v1.

## Architecture

```
   ┌──────────────────────────────────────────────────────┐
   │ frontend/src/pages/TopicsPage.tsx                    │
   │   Existing standalone page mounted at /topics.       │
   │   Gains 3 optional props (no breaking change):       │
   │     initialDate?: string | null                      │
   │     onSavedTopics?: () => void                       │
   │     embedded?: boolean                               │
   │   When `embedded`, skips page-level chrome           │
   │   (outer padding, page header).                      │
   │   When `initialDate` set, force                      │
   │   dateFrom = dateTo = initialDate on mount.          │
   │   When user finishes bulk-saving topics, calls       │
   │   onSavedTopics?.() so the host can react.           │
   │   Section title "Count" → "Number of Topics" and     │
   │   inner "How many topics" label dropped (the         │
   │   numeric input is unambiguous).                     │
   └──────────────────────────────────────────────────────┘
                            │ rendered inside
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │ frontend/src/components/planner/TopicGeneratorSlider │
   │   NEW. ~80 lines. Slider chrome (overlay, X button,  │
   │   click-outside-to-close).                           │
   │   Props: isOpen, onClose, workspaceId, initialDate,  │
   │          onSavedTopics                               │
   │   Renders <TopicsPage embedded                       │
   │                       initialDate={initialDate}      │
   │                       onSavedTopics={handler} />     │
   │   handler = () => { onSavedTopics?.(); onClose(); }  │
   │   Width: max-w-[1100px]. Full viewport on narrow     │
   │   screens.                                           │
   └──────────────────────────────────────────────────────┘
                            │ used by
                            ▼
   ┌──────────────────────────────────────────────────────┐
   │ frontend/src/pages/PlannerPage.tsx                   │
   │   Swap <PlannerTopicGeneratorPanel> for             │
   │   <TopicGeneratorSlider>. State                      │
   │   (pendingScheduleDate, generatorOpen) unchanged.    │
   │   <TopicCalendarView onEmptyCellClick=...> wiring   │
   │   unchanged.                                         │
   └──────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────┐
   │ DELETED:                                             │
   │   frontend/src/components/planner/                   │
   │     PlannerTopicGeneratorPanel.tsx (~701 lines)      │
   └──────────────────────────────────────────────────────┘
```

Single source of truth: `TopicsPage`. Standalone `/topics` route mounts it with no props and behaves exactly as today. Planner slider mounts it with three props and gets a stripped-chrome version inside the slider.

## Frontend Changes

### File 1: `frontend/src/pages/TopicsPage.tsx` — modify

#### Add props interface

The component currently has no props. Add:

```tsx
interface TopicsPageProps {
  /**
   * When set, force dateFrom = dateTo = this value on mount.
   * Used by the Planner slider's click-to-schedule flow.
   */
  initialDate?: string | null;
  /**
   * Called after a successful bulk save of generated topics.
   * The Planner slider uses this to close itself + refresh the calendar.
   */
  onSavedTopics?: () => void;
  /**
   * Render without page-level chrome (outer padding, page header).
   * Used when the page is mounted inside the Planner slider so the
   * slider's own header is the only one visible.
   */
  embedded?: boolean;
}

export function TopicsPage({
  initialDate,
  onSavedTopics,
  embedded = false,
}: TopicsPageProps = {}) {
  // ... existing body
}
```

#### Apply `initialDate` on mount

Locate the existing `useEffect` that sets default `dateFrom` / `dateTo`. In the same effect (or a new one keyed on the initial mount), if `initialDate` is truthy, override:

```tsx
useEffect(() => {
  if (initialDate) {
    setDateFrom(initialDate);
    setDateTo(initialDate);
  }
}, [initialDate]);
```

The implementer should locate the existing date-default logic and decide whether to extend the existing effect or add this dedicated one. Either is fine; the override must happen after defaults so it wins.

#### Call `onSavedTopics` after bulk save

Locate the existing bulk-save handler — the one that handles the "Save All" or equivalent path after a successful generation. After the existing success path (toast + redirect / state cleanup), add:

```tsx
onSavedTopics?.();
```

If TopicsPage has multiple save points (individual edit save vs bulk save), wire the callback to the **bulk save success** only. Individual edits should NOT close the slider mid-session.

#### Gate page chrome on `embedded`

Two surfaces gate:

1. **Outer page padding / wrapper.** TopicsPage probably has `<div className="p-6 ...">` or similar at its root. When `embedded`, drop the outer padding so the slider's own padding governs.
2. **Page-level header.** TopicsPage probably has a top section with title ("Topic Generator") + description. When `embedded`, hide it — the slider provides its own title bar.

The exact gate is `{!embedded && (...)}` around each chrome surface. The implementer should locate them by reading the file and adapt; the structure of TopicsPage is what it is.

#### Rename "Count" section

Locate the section title "Count" and rename to "Number of Topics". Drop the inner `<Field label="How many topics">` wrapper if present — the section title is unambiguous and the visible numeric input doesn't need a redundant inner label.

### File 2: `frontend/src/components/planner/TopicGeneratorSlider.tsx` — create

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
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      <div
        className="relative flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Slider header — only chrome we provide */}
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

The `workspaceId` prop is accepted for future use / consistency with the prior panel's API but not consumed here — TopicsPage looks up the active workspace internally.

### File 3: `frontend/src/pages/PlannerPage.tsx` — modify

#### Import swap

Replace:
```tsx
import { PlannerTopicGeneratorPanel } from "../components/planner/PlannerTopicGeneratorPanel";
```
with:
```tsx
import { TopicGeneratorSlider } from "../components/planner/TopicGeneratorSlider";
```

#### Render swap

Replace the existing usage (around lines 446-458):
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

With:
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

Props that go away (TopicsPage handles internally):
- `brands` — TopicsPage fetches its own list.
- `initialBrandId` — TopicsPage uses its own active-workspace brand defaults.
- `onEditTopic` — TopicsPage handles topic editing in its own results pane.
- `onToast` — TopicsPage uses its own toast mechanism.

State (`generatorOpen`, `pendingScheduleDate`) and the click-to-schedule wiring on `<TopicCalendarView onEmptyCellClick=...>` are unchanged.

### File 4: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` — DELETE

Once File 3's swap is in, this file has no remaining importers. Verify with:

```bash
grep -rn "PlannerTopicGeneratorPanel" frontend/src
```

Expected: zero matches. Then `git rm` the file.

The uncommitted Count → Number of Topics edit currently in this file's working tree is moot — discard it via `git checkout HEAD -- frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` BEFORE the deletion (so the deletion shows up as a clean removal in the diff, not as a modify-then-delete).

## Testing

### Manual smoke

1. **Standalone `/topics` route still works.** Navigate to `/topics` directly. No regression — page renders with full chrome (header, outer padding), behaves exactly as before.
2. **Planner slider opens.** Open `/planner`, click the **Generate** button at the top → slider opens, TopicsPage form rendered inside, no double-header (slider header says "Topic Generator", TopicsPage's own page header is hidden).
3. **Click-to-schedule pre-fill.** From `/planner`, click an eligible empty future cell (e.g. May 12) → slider opens, TopicsPage's `dateFrom` and `dateTo` are both `2026-05-12`.
4. **Click-to-schedule fallback.** From `/planner`, click the **Generate** button (not a cell) → slider opens with TopicsPage's own default `dateFrom`/`dateTo`, not a stale leftover from a previous cell click.
5. **Generate inside slider.** Inside the slider, fill the form, click Generate Topics → TopicsPage's existing generation flow runs, results render in its right pane.
6. **Save closes the slider.** Click bulk save (whatever the "Save All" / final commit button is on TopicsPage) → slider closes automatically AND Planner calendar refreshes to show the newly-scheduled topics.
7. **Edit individual topic stays open.** Inside the slider, edit one of the generated topics in the results pane (doesn't trigger bulk save) → slider stays open. Continue editing.
8. **Click outside slider.** Click on the dark backdrop → slider closes; pending date state clears (so the next button-driven open uses defaults).
9. **No stale Count label.** Section title in the form reads "Number of Topics", no inner "How many topics" label.
10. **Build + lint clean.** `cd frontend && bunx tsc -b --noEmit` → 0 errors. `npm run lint 2>&1 | tail -3` → at baseline (~73 pre-existing problems, no new findings on the changed files).

### Automated

No frontend test suite. Skip.

## Files

### Created

- `frontend/src/components/planner/TopicGeneratorSlider.tsx`

### Modified

- `frontend/src/pages/TopicsPage.tsx` — 3 optional props, chrome gating, `initialDate` override, `onSavedTopics` callback, Count → Number of Topics rename + drop inner label.
- `frontend/src/pages/PlannerPage.tsx` — import + render swap.

### Deleted

- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`

### Not modified

- Backend, schema, route — no changes.
- `TopicCalendarView` — onEmptyCellClick wiring already in place from prior task.
- Other Planner subcomponents (`PlannerListView`, `PlannerContentGeneratorPanel`, `PlannerContentPreviewPane`, `PlannerContentPreviewPanel`).

## Rollout

Single PR / single commit acceptable, or split into 3 commits (TopicsPage props, new slider component, PlannerPage swap + delete). Implementer's choice.

Backwards-compatible:

- Standalone `/topics` route mounts `<TopicsPage />` with no props → all three new props default to `undefined` / `false` → existing behavior preserved.
- No backend or API change → no migration, no schema, no feature flag.

## Open Questions

None.
