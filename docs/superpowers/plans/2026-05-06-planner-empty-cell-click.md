# Planner Empty-Cell Click-to-Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an empty, future, current-month calendar cell on the Planner page opens the Topic Generator panel pre-filled with `dateFrom = dateTo = clicked date`. Past, adjacent-month, and topic-occupied cells stay non-clickable. The existing Generate-button flow is unchanged.

**Architecture:** Add an optional `onEmptyCellClick(dateKey)` callback prop to the shared `TopicCalendarView` component. Eligible cells render as `<button>` instead of `<div>` and fire the callback. `PlannerPage` wires the callback to `setPendingScheduleDate(dateKey) + setGeneratorOpen(true)`. The Topic Generator panel gains an optional `initialDate` prop that, when set, overrides `dateFrom`/`dateTo` on the open transition. `TopicsPage` (the other consumer of `TopicCalendarView`) does not pass the new callback and is unaffected.

**Tech Stack:** React 19, TypeScript, Vite. Frontend-only — no backend, no schema, no API changes.

**Spec:** [docs/superpowers/specs/2026-05-06-planner-empty-cell-click-design.md](docs/superpowers/specs/2026-05-06-planner-empty-cell-click-design.md)

---

## Pre-flight

- [ ] **Step 0: Confirm clean working tree on a feature branch**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status
git checkout -b feat/planner-click-to-schedule
```

Pre-existing dirty files (`.claude/settings.local.json`, `backend/Makefile`, `docs/notes.md`) carry to the branch and stay unstaged.

---

## File Plan

### Modified files

- **`frontend/src/components/topics/TopicCalendarView.tsx`** — Add `onEmptyCellClick?: (dateKey: string) => void` to `TopicCalendarViewProps`. Add `isClickableEmptyCell` predicate. Branch the per-cell render into `<button>` (clickable) vs `<div>` (passive) with shared inner content.

- **`frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`** — Add `initialDate?: string | null` to `Props`. Extend the existing `useEffect(() => { ... }, [isOpen, initialBrandId])` reset-on-open block to also force `setDateFrom(initialDate)` + `setDateTo(initialDate)` when `initialDate` is non-null.

- **`frontend/src/pages/PlannerPage.tsx`** — Add `pendingScheduleDate` state. Pass `onEmptyCellClick` to `<TopicCalendarView>` that sets `pendingScheduleDate` + opens the generator. Pass `initialDate={pendingScheduleDate}` to `<PlannerTopicGeneratorPanel>`. Clear `pendingScheduleDate` in the panel's `onClose`.

### Not modified

- Backend, schema, repository, route — no changes.
- `frontend/src/pages/TopicsPage.tsx` — also uses `TopicCalendarView`. Does not pass `onEmptyCellClick`, so its calendar stays passive.
- Other Planner subcomponents (`PlannerListView`, `PlannerContentGeneratorPanel`, `PlannerContentPreviewPanel`, `PlannerContentPreviewPane`).

---

## Task 1: Extend `TopicCalendarView` with `onEmptyCellClick`

**Files:**
- Modify: `frontend/src/components/topics/TopicCalendarView.tsx` (lines ~23-29 props, ~31-37 helpers area, ~252-304 cell render)

After this task, `TopicCalendarView` accepts an optional `onEmptyCellClick(dateKey)` prop. When the prop is set AND a cell is empty/future/current-month, the cell renders as a clickable `<button>` that fires the callback. Existing consumers (PlannerPage, TopicsPage) are unaffected because the prop is optional. The PlannerPage wire-up happens in Task 3.

- [ ] **Step 1: Read the current file in full to confirm line positions**

```bash
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/topics/TopicCalendarView.tsx
```

The cell render is at lines 252-304. The `interface TopicCalendarViewProps` is at lines 23-29.

- [ ] **Step 2: Extend the `TopicCalendarViewProps` interface**

Find lines 23-29:

```tsx
interface TopicCalendarViewProps {
  topics: Topic[];
  mode: "month" | "week";
  onTopicClick: (topic: Topic) => void;
  onReschedule: (topicId: string, newDate: string | null) => void;
  getPillarColor: (pillar: string) => string;
}
```

Replace with:

```tsx
interface TopicCalendarViewProps {
  topics: Topic[];
  mode: "month" | "week";
  onTopicClick: (topic: Topic) => void;
  onReschedule: (topicId: string, newDate: string | null) => void;
  getPillarColor: (pillar: string) => string;
  /**
   * Optional. When set, eligible empty cells (current-month + future-or-today,
   * no topics) render as clickable buttons that fire this callback with the
   * cell's date in YYYY-MM-DD format. Pages that don't pass this prop keep
   * the current passive-grid behavior.
   */
  onEmptyCellClick?: (dateKey: string) => void;
}
```

- [ ] **Step 3: Destructure the new prop in the component signature**

Find the function signature (around line 79-85):

```tsx
export function TopicCalendarView({
  topics,
  mode,
  onTopicClick,
  onReschedule,
  getPillarColor,
}: TopicCalendarViewProps) {
```

Replace with:

```tsx
export function TopicCalendarView({
  topics,
  mode,
  onTopicClick,
  onReschedule,
  getPillarColor,
  onEmptyCellClick,
}: TopicCalendarViewProps) {
```

- [ ] **Step 4: Add the eligibility predicate above the component**

Insert after the existing date-helper functions (after `weekRangeLabel`, before `// ─── Main component ──── …` at line 78):

```tsx
// Today, normalised to local midnight, for "future or today" cell eligibility checks.
function todayLocalMidnight(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function isClickableEmptyCell(
  cellDate: Date,
  isOtherMonth: boolean,
  hasTopics: boolean,
): boolean {
  if (hasTopics) return false;
  if (isOtherMonth) return false;
  if (cellDate < todayLocalMidnight()) return false;
  return true;
}
```

- [ ] **Step 5: Update the cell render block to branch on clickability**

The current block at lines 252-304 reads:

```tsx
{cells.map((date, i) => {
  const key = toDateKey(date);
  const dayTopics = scheduled.get(key) ?? [];
  const isToday = key === todayKey;
  const isOtherMonth = mode === "month" && date.getMonth() !== currentMonthIndex;
  const isDragOver = dragOverKey === key;

  return (
    <div
      key={i}
      onDragOver={(e) => handleDragOver(e, key)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, key)}
      className={`${mode === "week" ? "min-h-[320px]" : "min-h-[104px]"} p-1.5 rounded-md border transition-colors ${
        isDragOver
          ? "border-indigo-400 bg-indigo-50"
          : isOtherMonth
            ? "border-gray-100 bg-gray-50/30"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[11px] font-medium ${
            isToday
              ? "bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
              : isOtherMonth
                ? "text-gray-300"
                : "text-gray-600"
          }`}
        >
          {date.getDate()}
        </span>
        {dayTopics.length > 0 && (
          <span className="text-[9px] text-gray-400">{dayTopics.length}</span>
        )}
      </div>
      <div className="space-y-1">
        {dayTopics.map((t) => (
          <TopicChip
            key={t.id}
            topic={t}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={onTopicClick}
            getPillarColor={getPillarColor}
            compact={mode === "month"}
          />
        ))}
      </div>
    </div>
  );
})}
```

Replace the entire `{cells.map(...)}` block with:

```tsx
{cells.map((date, i) => {
  const key = toDateKey(date);
  const dayTopics = scheduled.get(key) ?? [];
  const isToday = key === todayKey;
  const isOtherMonth = mode === "month" && date.getMonth() !== currentMonthIndex;
  const isDragOver = dragOverKey === key;
  const clickable =
    onEmptyCellClick !== undefined &&
    isClickableEmptyCell(date, isOtherMonth, dayTopics.length > 0);

  const cellClassName = `${mode === "week" ? "min-h-[320px]" : "min-h-[104px]"} p-1.5 rounded-md border transition-colors text-left w-full ${
    isDragOver
      ? "border-indigo-400 bg-indigo-50"
      : isOtherMonth
        ? "border-gray-100 bg-gray-50/30"
        : "border-gray-200 bg-white"
  } ${clickable ? "hover:bg-gray-50 cursor-pointer" : ""}`;

  const cellInner = (
    <>
      <div className="flex items-center justify-between mb-1">
        <span
          className={`text-[11px] font-medium ${
            isToday
              ? "bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
              : isOtherMonth
                ? "text-gray-300"
                : "text-gray-600"
          }`}
        >
          {date.getDate()}
        </span>
        {dayTopics.length > 0 && (
          <span className="text-[9px] text-gray-400">{dayTopics.length}</span>
        )}
      </div>
      <div className="space-y-1">
        {dayTopics.map((t) => (
          <TopicChip
            key={t.id}
            topic={t}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={onTopicClick}
            getPillarColor={getPillarColor}
            compact={mode === "month"}
          />
        ))}
      </div>
    </>
  );

  if (clickable) {
    return (
      <button
        key={i}
        type="button"
        onClick={() => onEmptyCellClick!(key)}
        onDragOver={(e) => handleDragOver(e, key)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, key)}
        aria-label={`Schedule topic for ${date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        })}`}
        className={cellClassName}
      >
        {cellInner}
      </button>
    );
  }

  return (
    <div
      key={i}
      onDragOver={(e) => handleDragOver(e, key)}
      onDragLeave={handleDragLeave}
      onDrop={(e) => handleDrop(e, key)}
      className={cellClassName}
    >
      {cellInner}
    </div>
  );
})}
```

`text-left w-full` is added to the shared `cellClassName` so the `<button>` variant doesn't center its content (browser button default) and matches the `<div>` width. The class is appended uniformly to both branches so visual rendering is identical at rest.

- [ ] **Step 6: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors (the new optional prop doesn't break existing callers).

- [ ] **Step 7: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -5
```

Expected: pre-existing baseline only — no new findings on `TopicCalendarView.tsx`. The current baseline is 70 problems (67 errors, 3 warnings) per Task 11 of the prior feature.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/topics/TopicCalendarView.tsx
git commit -m "feat(frontend): TopicCalendarView accepts onEmptyCellClick

When the optional callback is set, eligible cells (current-month +
future-or-today + empty) render as <button> with hover affordance and
fire the callback with the cell's date key on click. Other cells stay
as plain <div>. Drag-to-reschedule handlers continue to work on both
branches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add `initialDate` override to `PlannerTopicGeneratorPanel`

**Files:**
- Modify: `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx` (Props interface, component destructure, reset-on-open useEffect)

The panel gains an optional `initialDate?: string | null` prop. When set on `isOpen` transition, it forces `dateFrom` and `dateTo` to that date, overriding the panel's own date defaults. When unset, the existing default behavior holds.

- [ ] **Step 1: Read the current file to find existing structures**

```bash
sed -n '20,120p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
```

Note the `Props` interface around line 30-50, the component destructure around line 85-95, and the existing `useEffect(() => { ... }, [isOpen, initialBrandId])` around line 110-112.

- [ ] **Step 2: Add `initialDate` to the `Props` interface**

Find the existing prop list in the `Props` interface. Add a new optional field alongside `initialBrandId`:

```ts
initialDate?: string | null;
```

The position doesn't matter for behavior; place it directly after `initialBrandId` for readability.

- [ ] **Step 3: Destructure `initialDate` in the component signature**

Find the destructuring around line 85-95 (current ones include `isOpen, onClose, workspaceId, brands, initialBrandId, ...`). Add `initialDate` to the list:

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

(Match the exact existing prop names — read the file to confirm the destructured list.)

- [ ] **Step 4: Extend the existing reset-on-open useEffect**

Find the current effect at line 110-112:

```ts
useEffect(() => {
  if (isOpen) setBrandId(initialBrandId);
}, [isOpen, initialBrandId]);
```

Replace with:

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

`setDateFrom` and `setDateTo` are existing setters from the component's date state (lines 99-100). When `initialDate` is `null` or `undefined`, the existing default values are preserved.

- [ ] **Step 5: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors. The new prop is optional, so existing call sites still type-check.

- [ ] **Step 6: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -5
```

Expected: baseline unchanged.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx
git commit -m "feat(frontend): PlannerTopicGeneratorPanel accepts initialDate

When initialDate is set on open, override dateFrom and dateTo with the
supplied YYYY-MM-DD value. When unset, fall through to the panel's
existing default schedule range. Backwards-compatible — existing
callers pass nothing and continue to use defaults.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire up cell click in `PlannerPage`

**Files:**
- Modify: `frontend/src/pages/PlannerPage.tsx` (state, calendar prop, panel prop, panel onClose)

After this task, clicking an eligible empty cell in the Planner calendar opens the generator panel pre-filled with that date.

- [ ] **Step 1: Add `pendingScheduleDate` state**

Find the existing `generatorOpen` state declaration at line 97:

```ts
const [generatorOpen, setGeneratorOpen] = useState(false);
```

Add a new line directly after:

```ts
const [pendingScheduleDate, setPendingScheduleDate] = useState<string | null>(null);
```

- [ ] **Step 2: Pass `onEmptyCellClick` to `<TopicCalendarView>`**

Find the `<TopicCalendarView ... />` usage around line 362. The current props (read to confirm exactly):

```tsx
<TopicCalendarView
  topics={filteredTopics}
  mode="month"
  onTopicClick={...}
  onReschedule={...}
  getPillarColor={...}
/>
```

Add the new callback prop:

```tsx
<TopicCalendarView
  topics={filteredTopics}
  mode="month"
  onTopicClick={...}
  onReschedule={...}
  getPillarColor={...}
  onEmptyCellClick={(dateKey) => {
    setPendingScheduleDate(dateKey);
    setGeneratorOpen(true);
  }}
/>
```

(Keep the existing `onTopicClick`, `onReschedule`, `getPillarColor` values exactly as they are — the inline `…` here is shorthand. Don't replace working bindings.)

- [ ] **Step 3: Pass `initialDate` to `<PlannerTopicGeneratorPanel>` and clear on close**

Find the panel render at lines 446-457:

```tsx
{activeWorkspace && (
  <PlannerTopicGeneratorPanel
    isOpen={generatorOpen}
    onClose={() => setGeneratorOpen(false)}
    workspaceId={activeWorkspace.id}
    brands={brands}
    initialBrandId={activeBrandId}
    onSavedTopics={loadTopics}
    onEditTopic={(topic) => setDetailTopic(topic)}
    onToast={showToast}
  />
)}
```

Replace with:

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

Two changes: `onClose` now also clears `pendingScheduleDate`, and a new `initialDate={pendingScheduleDate}` prop is passed.

- [ ] **Step 4: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && bunx tsc -b --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Frontend lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend && npm run lint 2>&1 | tail -5
```

Expected: baseline unchanged.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/PlannerPage.tsx
git commit -m "feat(frontend): planner click empty cell opens topic generator

Click an eligible empty calendar cell -> set pendingScheduleDate and
open the topic generator panel with dateFrom = dateTo = clicked date.
Closing the panel clears pendingScheduleDate so the next button-driven
open uses default dates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Manual smoke (user)

**No new files.** All steps are user-driven UI verification. The agentic worker should run Steps 1-2 (auto checks), then hand off to the user for Steps 3-9.

- [ ] **Step 1: Final frontend typecheck + lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b --noEmit
npm run lint 2>&1 | tail -5
```

Expected: 0 typecheck errors. Lint at baseline.

- [ ] **Step 2: Confirm no out-of-scope files modified**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status --short
git diff main..HEAD --name-only
```

Expected: working tree shows only the 3 pre-existing dirty files (`.claude/settings.local.json`, `backend/Makefile`, `docs/notes.md`). Branch diff against main shows exactly:
- `frontend/src/components/topics/TopicCalendarView.tsx`
- `frontend/src/components/planner/PlannerTopicGeneratorPanel.tsx`
- `frontend/src/pages/PlannerPage.tsx`

- [ ] **Step 3: User smoke — eligible empty cell click**

Start the frontend (`cd frontend && npm run dev`), open `/planner`. Pick a future empty current-month cell (e.g., May 12 if today is May 6). Hover — cursor turns to pointer; cell tints subtly. Click — the Topic Generator panel opens. The Schedule section's `dateFrom` and `dateTo` both show the clicked date.

- [ ] **Step 4: User smoke — past dates do nothing**

Hover over a past empty cell (e.g., May 4). No cursor change. Click — nothing happens.

- [ ] **Step 5: User smoke — adjacent-month cells do nothing**

Hover over the grayed-out leading cells (e.g., April 27, 28, 29) or trailing June cells. No cursor change. Click — nothing happens.

- [ ] **Step 6: User smoke — cells with topics use existing behavior**

Click a cell that has a topic chip (e.g., May 5 in the screenshot). Existing topic-click handler fires (opens topic detail/preview), NOT the generator panel.

- [ ] **Step 7: User smoke — top Generate button still works**

Close the panel. Click the **Generate** button at the top of the Planner page. Panel opens with the panel's existing default `dateFrom` / `dateTo` values, not anything left over from a previous cell click.

- [ ] **Step 8: User smoke — close-and-reopen via button after cell click**

Open via cell click (May 12). Close via X / cancel. Click **Generate** at the top. Panel opens with default dates, NOT May 12. Confirms `pendingScheduleDate` was cleared on close.

- [ ] **Step 9: User smoke — keyboard accessibility**

On `/planner`, press Tab repeatedly. Eligible empty future cells receive focus (visible focus ring). Pressing Enter on a focused cell opens the generator with that date. Past / adjacent-month / topic-occupied cells skip focus.

If any step fails, stop and report.

- [ ] **Step 10: Push + merge (user decision)**

After all smoke steps pass:

```bash
cd /Users/bellinnn/Documents/projects/fce
git checkout main
git merge --no-ff feat/planner-click-to-schedule -m "Merge feat/planner-click-to-schedule"
git push origin main
git branch -d feat/planner-click-to-schedule
```

This matches the project's existing merge pattern (no-ff merge commit + delete branch).

---

## Self-Review

**Spec coverage:**

| Spec section / requirement | Implementing task |
|---|---|
| `TopicCalendarView` gets optional `onEmptyCellClick` prop | Task 1 Step 2 |
| Eligibility predicate (`hasTopics`, `isOtherMonth`, past-date) | Task 1 Step 4 |
| Branching cell render: `<button>` for clickable, `<div>` for passive | Task 1 Step 5 |
| Drag handlers preserved on both branches | Task 1 Step 5 (drag handlers attached identically) |
| `text-left w-full` added so `<button>` matches `<div>` visual | Task 1 Step 5 |
| `aria-label` on clickable cells | Task 1 Step 5 |
| `PlannerTopicGeneratorPanel` gets `initialDate` prop | Task 2 Step 2 |
| `dateFrom`/`dateTo` overridden on open when `initialDate` set | Task 2 Step 4 |
| `PlannerPage` adds `pendingScheduleDate` state | Task 3 Step 1 |
| `PlannerPage` wires `onEmptyCellClick` to set state + open panel | Task 3 Step 2 |
| `PlannerPage` passes `initialDate` to panel | Task 3 Step 3 |
| `PlannerPage` clears `pendingScheduleDate` on panel close | Task 3 Step 3 |
| `TopicsPage` not modified (still uses passive calendar) | File Plan "Not modified" — confirmed by Task 1 prop being optional |
| Existing Generate button continues working unchanged | Task 3 Step 3 (button doesn't touch `pendingScheduleDate`) |
| Manual smoke covering all spec edge cases | Task 4 Steps 3-9 |
| DST / local-date formatting via `toDateKey` | Task 1 Step 5 (uses existing `toDateKey` helper which is local-date safe per file lines 32-37) |

No spec gaps.

**Type / property consistency:**

- `onEmptyCellClick: (dateKey: string) => void` — defined in `TopicCalendarViewProps` (Task 1), consumed by Task 3's call site as `(dateKey) => { setPendingScheduleDate(dateKey); setGeneratorOpen(true); }`. Types match.
- `initialDate?: string | null` — defined on `Props` (Task 2), consumed via `initialDate={pendingScheduleDate}` (Task 3). Both are `string | null`. Types match.
- `pendingScheduleDate: string | null` (Task 3) is the bridge between the calendar's `dateKey` (string from `toDateKey`) and the panel's `initialDate` (string | null). Consistent.
- `toDateKey` (existing helper at TopicCalendarView.tsx:32-37) returns `YYYY-MM-DD` local-date format, which is exactly what the panel's `dateFrom`/`dateTo` HTML date inputs expect. No conversion needed.

**Placeholder scan:**

No "TBD", "TODO", "implement later", "fill in details", "Add appropriate error handling", "handle edge cases", or `// Similar to Task N` markers. Every code block is concrete and complete. The one ellipsis `…` in Task 3 Step 2 is explicitly called out as shorthand for existing bindings the engineer should not replace.
