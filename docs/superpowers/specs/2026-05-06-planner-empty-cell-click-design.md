# Planner — Click-to-Schedule on Empty Calendar Cells

**Date:** 2026-05-06
**Status:** Spec
**Owner:** Frontend

## Problem

The Planner page (`/planner`) shows topics on a monthly calendar. Today the only way to generate new topics is the **Generate** button in the page header — which opens the Topic Generator panel with the panel's own default schedule range. Users who want to plan content for a specific upcoming day have to: open the panel, then manually adjust `dateFrom` and `dateTo` to that day. That's three clicks (Generate → date input → second date input) for an action that visually maps to "click that empty cell."

## Goals

- Clicking an **empty, future, current-month** calendar cell opens the Topic Generator panel pre-filled with `dateFrom = dateTo = clicked date`.
- The panel's other defaults (brand from the page header, platform, objective, formats, count) are unchanged from the current Generate-button flow.
- Cells that are not eligible (past dates, adjacent-month gray cells, cells with existing topics) behave exactly as today — no new click affordance.
- The existing Generate button still works unchanged.

## Non-Goals

- **Form persistence across sessions.** The panel does not remember the last platform/objective/format selections. Each open starts from the panel's current defaults plus the new `initialDate` override.
- **Past-date scheduling.** Past empty cells are explicitly non-clickable.
- **Adjacent-month cells.** The grayed-out leading/trailing cells from neighbouring months stay non-clickable; they're rendered for visual completeness only.
- **Drag-to-multi-day scheduling.** Click is a single-day action; no marquee, no shift-click range.
- **Backend / API changes.** This is a pure frontend change.

## Architecture

```
   ┌────────────────────────┐
   │  PlannerPage.tsx       │
   │   ┌─ Calendar grid     │
   │   │   day cells        │
   │   │                    │
   │   │   Click on each    │
   │   │   empty future     │
   │   │   current-month    │
   │   │   cell             │
   │   └─→ setPendingScheduleDate(dateISO)
   │       setGeneratorOpen(true)
   │                        │
   │  state:                │
   │   pendingScheduleDate  │ — null when no cell click drove the open
   │   generatorOpen        │
   └────────────────────────┘
              │ props
              ▼
   ┌──────────────────────────────────┐
   │  PlannerTopicGeneratorPanel      │
   │   new prop: initialDate?: string │
   │                                  │
   │   on isOpen transition true:     │
   │     if initialDate present:      │
   │       dateFrom = initialDate     │
   │       dateTo   = initialDate     │
   │     else: use existing default   │
   └──────────────────────────────────┘
```

Three structural notes:

1. **Eligibility check lives local to the calendar render** in `PlannerPage.tsx` — not a shared util. The page already has `today` and the displayed month in scope, so a small `isClickableEmptyCell(date, currentMonth, hasTopics)` helper inside the file decides per-cell.
2. **Eligibility = `cell.date >= today AND cell.date.month === currentMonth AND cell has no topics`.** All three must be true.
3. **The Generate button continues to work** — it opens the panel without setting `pendingScheduleDate`, so `initialDate` is `null` / undefined, which falls through to the panel's existing default behavior.

## Frontend Changes

### File 1: `frontend/src/pages/PlannerPage.tsx`

#### Add eligibility predicate

Near the calendar grid render, hoisted above the cell map:

```ts
const today = new Date();
today.setHours(0, 0, 0, 0);

function isClickableEmptyCell(
  cellDate: Date,
  currentMonth: number,
  hasTopics: boolean,
): boolean {
  if (hasTopics) return false;
  if (cellDate.getMonth() !== currentMonth) return false;
  if (cellDate < today) return false;
  return true;
}
```

#### Add state

Alongside the existing `generatorOpen` state (line 97):

```ts
const [pendingScheduleDate, setPendingScheduleDate] = useState<string | null>(null);
```

#### Branching cell render

Each day cell currently renders as a `<div>` with the day number and topic chips. Wrap clickable empty cells in a `<button type="button">` and leave non-clickable cells as plain `<div>`:

```tsx
const clickable = isClickableEmptyCell(cellDate, currentMonth, dayTopics.length > 0);

if (clickable) {
  return (
    <button
      type="button"
      key={cellKey}
      onClick={() => {
        setPendingScheduleDate(toISODate(cellDate)); // "2026-05-08"
        setGeneratorOpen(true);
      }}
      aria-label={`Schedule topic for ${formatHumanDate(cellDate)}`}
      className={`${existingCellClass} text-left hover:bg-gray-50 cursor-pointer transition-colors`}
    >
      {/* same inner content as today: day number, etc. */}
    </button>
  );
}

return (
  <div key={cellKey} className={existingCellClass}>
    {/* same inner content */}
  </div>
);
```

`toISODate(date)` returns `YYYY-MM-DD`. If a helper for that already exists in the file (or in a shared utils), reuse it; otherwise inline `date.toISOString().slice(0, 10)`.

#### Update generator-panel close + props

```tsx
<PlannerTopicGeneratorPanel
  isOpen={generatorOpen}
  onClose={() => {
    setGeneratorOpen(false);
    setPendingScheduleDate(null);
  }}
  workspaceId={activeWorkspace.id}
  brands={brands}
  initialBrandId={activeBrandId}
  initialDate={pendingScheduleDate}                /* NEW */
  onSavedTopics={loadTopics}
  onEditTopic={(topic) => setDetailTopic(topic)}
  onToast={showToast}
/>
```

### File 2: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`

#### Add prop to `Props` interface

```ts
interface Props {
  // ...existing props
  initialDate?: string | null; // ISO date "2026-05-08"; if set, overrides dateFrom/dateTo defaults on open
}
```

#### Destructure in component

```ts
export function PlannerTopicGeneratorPanel({
  isOpen,
  onClose,
  workspaceId,
  brands,
  initialBrandId,
  initialDate,
  onSavedTopics,
  onEditTopic,
  onToast,
}: Props) {
```

#### Override date defaults inside the existing reset-on-open effect

The current effect (around line 111) is:

```ts
useEffect(() => {
  if (isOpen) setBrandId(initialBrandId);
}, [isOpen, initialBrandId]);
```

Extend to:

```ts
useEffect(() => {
  if (!isOpen) return;
  setBrandId(initialBrandId);
  if (initialDate) {
    setDateFrom(initialDate);
    setDateTo(initialDate);
  }
}, [isOpen, initialBrandId, initialDate]);
```

`setDateFrom` and `setDateTo` already exist (lines 99–100). Don't change their default values when `initialDate` is null/undefined — fall through to existing behavior.

## Edge Cases

- **Click an empty cell, then click "Generate" button without closing the panel first.** Not possible — the panel covers the calendar while open. No special handling needed.
- **Open via cell click, close via X button or Save & Close, click Generate button next.** Works correctly: `pendingScheduleDate` is cleared in `onClose`, so the button click sees `initialDate = null` and uses defaults.
- **Click a cell at exactly midnight (calendar boundary).** `today` is constructed with `setHours(0,0,0,0)`, so a cell representing today (May 6 00:00) is `>= today` and is clickable. Only cells strictly before today are blocked.
- **DST / timezone weirdness.** `cellDate.getMonth()` and the `>= today` check are pure-local-time comparisons. `toISODate` uses `toISOString().slice(0,10)` which gives UTC date — could shift by one day in non-UTC timezones near midnight. Mitigation: use a local-date formatter:
  ```ts
  function toISODate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  ```
  This formats the cell's local date verbatim and avoids UTC drift.
- **Loading state — `activeWorkspace` not yet resolved.** The existing render already gates the panel on `activeWorkspace`. Cell click handlers can fire before brands load, but `setGeneratorOpen(true)` is harmless and the panel handles missing data gracefully.

## Testing

### Manual smoke

1. Open `/planner`. Calendar shows current month.
2. **Click an empty future cell** (e.g., May 12 if today is May 6). Topic Generator opens with `dateFrom = dateTo = 2026-05-12`. ✓
3. **Click an empty past cell** (e.g., May 4). Nothing happens — no cursor change on hover, no panel. ✓
4. **Click an empty adjacent-month cell** (e.g., the grayed-out April 27 or June 1). Nothing happens. ✓
5. **Click a cell that already has a topic** (e.g., May 5 with "5 Alasan Pentingnya As..."). Existing behavior unchanged — opens topic detail / preview. ✓
6. **Click "Generate" button at the top.** Panel opens with the panel's own default `dateFrom`/`dateTo` (today + 7 days, or whatever the existing default is). No override. ✓
7. **Click empty future cell → Generator opens. Close it. Click "Generate" button.** Second open uses defaults, not the cell date from step 1. ✓
8. **Hover over an empty future cell.** Cursor changes to pointer; cell background subtly tints (`hover:bg-gray-50`). ✓
9. **Keyboard a11y**: Tab through the calendar. Empty future cells are focusable buttons; pressing Enter opens the panel. Other cells skip focus.

### Automated

No frontend test suite in this codebase. Skip.

## Files

### Modified

- `frontend/src/pages/PlannerPage.tsx` — eligibility predicate, `pendingScheduleDate` state, branching cell render, panel prop pass-through.
- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` — `initialDate` prop on `Props`, override `dateFrom`/`dateTo` in the reset-on-open effect.

### Not modified

- Backend / routes / schema — no changes.
- Other Planner subcomponents (`PlannerListView`, `PlannerContentGeneratorPanel`, etc.) — out of scope.

## Rollout

Single PR, single commit acceptable. Backwards-compatible at the panel level (`initialDate` is optional; existing callers continue to work). No feature flag, no migration.

## Open Questions

None.
