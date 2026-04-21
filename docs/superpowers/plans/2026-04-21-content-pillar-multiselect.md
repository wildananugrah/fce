# Content Generator Multi-Select Pillars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick a subset of brand pillars in the Content Generator when no topic is selected, instead of auto-using all brand pillars.

**Architecture:** Frontend-only tweak to `GeneratePage.tsx`. Introduce `selectedPillars: string[]` state, swap the existing "Mixed (all brand pillars)" grey-italic line for the same multi-select chip UI already used in `TopicsPage.tsx`, and update `resolvedPillars` so empty selection falls back to the full `brandContentPillars` list (preserving today's default).

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vite 8.

---

## File Structure

Files to modify:
- `frontend/src/pages/GeneratePage.tsx` — single file, four localized edits: local `PILLAR_COLORS` constant, new `selectedPillars` state + reset in all three branches of the brain-fetch effect, updated `resolvedPillars` expression, replaced pillar display block.

No backend changes. No new files. No test files (no existing frontend test harness for `GeneratePage`; backend prompt behavior already covered).

---

## Task 1: Plumb `selectedPillars` state without changing UI behavior

This task adds the state, resets it when the brand changes, and wires it into `resolvedPillars`. Because the state starts at `[]` and there's no UI to populate it yet, `resolvedPillars` still falls back to `brandContentPillars` — existing behavior is preserved.

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx` — around lines 415, 556-591, 612-618

- [ ] **Step 1: Add local `PILLAR_COLORS` constant near the top of the file**

Locate the top-of-file section where other module-scope constants live (above `export function GeneratePage`). Grep for `PLATFORM_FORMATS` or `OBJECTIVE_OPTIONS` to find the area. Immediately after the existing constants (before `function FormatBadge`), add:

```typescript
// Pastel chip colors for brand-pillar multi-select. Declared locally rather
// than shared with TopicsPage because the two surfaces may drift visually.
const PILLAR_COLORS = [
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];
```

- [ ] **Step 2: Add `selectedPillars` state**

In `GeneratePage`, immediately after the existing `const [brandContentPillars, setBrandContentPillars] = useState<string[]>([]);` line (currently line 415), add:

```typescript
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);
```

- [ ] **Step 3: Reset `selectedPillars` in all three branches of the brain-fetch effect**

Locate the `// Fetch brain context when brand/product changes` useEffect (around lines 556-591). Three places need updating:

**Early-exit branch** (around line 558-563): after the existing `setBrandContentPillars([]);` line, add:

```typescript
      setSelectedPillars([]);
```

**Start of async IIFE** (around line 565): immediately after `(async () => {` and before `try {`, add:

```typescript
      // Reset on every brand switch so stale Brand-A selections never get
      // submitted against Brand-B's pillar list. Matches the pattern in
      // TopicsPage.tsx.
      setSelectedPillars([]);
```

**Catch branch** (around line 585-589): after the existing `setBrandContentPillars([]);` line, add:

```typescript
        setSelectedPillars([]);
```

- [ ] **Step 4: Update `resolvedPillars` to honor `selectedPillars`**

Locate the `resolvedPillars` computation in `handleSubmit` (around lines 612-618). Replace the whole expression:

```typescript
      const selectedTopic = topics.find((t) => t.id === contentTopicId);
      const resolvedPillars =
        contentTopicId
          ? selectedTopic?.pillar
            ? [selectedTopic.pillar]
            : []
          : brandContentPillars;
```

with:

```typescript
      const selectedTopic = topics.find((t) => t.id === contentTopicId);
      const resolvedPillars = contentTopicId
        ? selectedTopic?.pillar
          ? [selectedTopic.pillar]
          : []
        : selectedPillars.length > 0
          ? selectedPillars
          : brandContentPillars;
```

When no topic is selected: a non-empty `selectedPillars` is used directly; an empty `selectedPillars` falls back to `brandContentPillars` (preserving "mix all" as the 0-selected default).

- [ ] **Step 5: Typecheck**

Run: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect/frontend && npx tsc --noEmit 2>&1 | tail -5`

Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect && git add frontend/src/pages/GeneratePage.tsx && git commit -m "refactor(content-ui): plumb selectedPillars state (no UI yet)"
```

---

## Task 2: Replace the "Mixed (all brand pillars)" line with the multi-select chip UI

This task swaps the read-only grey italic line (currently shown when no topic is selected and the brand has pillars) for the same chip selector used in `TopicsPage.tsx`. Clicking chips populates `selectedPillars`, which Task 1 already wired into `resolvedPillars`.

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx` — around lines 803-833

- [ ] **Step 1: Replace the pillar display block**

Locate the existing pillar display block (around lines 803-833) — it starts with `{contentTopicId ? (() => {` and ends with the closing `}` of the outer ternary. Replace the ENTIRE block (the two-case IIFE-vs-static-text structure) with this JSX:

```tsx
                  {contentTopicId ? (() => {
                    const selectedTopic = topics.find((t) => t.id === contentTopicId);
                    if (!selectedTopic) return null;
                    return (
                      <div className="flex items-center gap-2 -mt-1">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Pillar
                        </span>
                        {selectedTopic.pillar ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {selectedTopic.pillar}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            Mixed (no pillar set)
                          </span>
                        )}
                      </div>
                    );
                  })() : (
                    brandId && brandContentPillars.length > 0 && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            Brand Content Pillars
                          </label>
                          <span className="text-[10px] text-gray-400">
                            {selectedPillars.length === 0
                              ? "Mixed (all pillars)"
                              : `Selected: ${selectedPillars.join(", ")}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {brandContentPillars.map((p, i) => {
                            const isSelected = selectedPillars.includes(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  setSelectedPillars((prev) =>
                                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                                  )
                                }
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                    : `${PILLAR_COLORS[i % PILLAR_COLORS.length]} border-transparent hover:border-gray-300`
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Pick one or more pillars, or leave blank to mix across all.
                        </p>
                      </div>
                    )
                  )}
```

Visual anchor points:
- The topic-selected branch (everything inside `contentTopicId ? (() => { ... })()`) is unchanged.
- Only the `else` branch of the outer ternary (after `: (`) changes — from a static italic line to the chip selector.
- The chip selector markup mirrors TopicsPage.tsx lines 493-527 (with the one visual tweak of `pt-2` instead of `pt-3 border-t border-gray-100` because GeneratePage's context card already has its own container border).

- [ ] **Step 2: Typecheck**

Run: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect/frontend && npx tsc --noEmit 2>&1 | tail -5`

Expected: exit 0, no output.

- [ ] **Step 3: Build**

Run: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect/frontend && npm run build 2>&1 | tail -10`

Expected: build succeeds (chunk-size warning is pre-existing, unrelated).

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect && git add frontend/src/pages/GeneratePage.tsx && git commit -m "feat(content-ui): multi-select brand pillar chips when no topic picked"
```

---

## Task 3: End-to-end manual verification

No automated tests. Walk through the manual QA matrix from the spec.

- [ ] **Step 1: Start the backend and frontend dev servers**

Backend: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect/backend && bun run --hot src/index.ts`
Frontend: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/content-pillar-multiselect/frontend && npm run dev`

Open `http://localhost:5173/generate` in a browser.

- [ ] **Step 2: Verify each case from the QA matrix**

For each case below, run a generation and inspect the resulting user prompt in the AI activity log (Workspace Settings → Integrations → AI Activity, or query `ai_provider_logs` directly).

1. **No topic, no chips clicked** — status line shows "Mixed (all pillars)"; prompt contains `Align this content with one of the brand's content pillars: "P1", "P2", …` listing EVERY brand pillar.
2. **No topic, 2 chips clicked** — status line shows `Selected: A, B`; prompt contains `Align this content with one of the brand's content pillars: "A", "B"` and ONLY those two.
3. **No topic, 1 chip clicked** — status line shows `Selected: A`; prompt contains `This content should reinforce the brand pillar: "A"` (single-pillar branch).
4. **Topic with pillar selected** — chip UI hidden; indigo badge shows topic pillar; prompt reinforces that pillar.
5. **Topic without pillar selected** — chip UI hidden; "Mixed (no pillar set)" shows; prompt has no pillar section.
6. **Switch brand A (with 2 chips clicked) → brand B** — selection clears immediately; Brand-A pillar strings never appear in Brand-B's prompts.
7. **Brand with no pillars configured, no topic** — no chip UI rendered; generation succeeds with no pillar guidance.

- [ ] **Step 3: If any case fails, fix and commit**

Add a targeted fix commit with a message like `fix(content-ui): <what>`. Re-run the failing case to confirm.

- [ ] **Step 4: Shut down dev servers and report done**

---

## Self-review notes

- Every spec section maps to a task:
  - "UI" (§1 of spec) → Task 2
  - "State" (§2) → Task 1 Step 2, Step 3
  - "Resolution on submit" (§3) → Task 1 Step 4
  - "Files touched" (§4) → single file per plan, ✓
  - "Testing" (§5) → Task 3 QA matrix mirrors spec's 7-case matrix
- No placeholders. Every code block shows the exact code to land.
- Type consistency: `selectedPillars: string[]` used identically in state, reset setters, resolvedPillars, and chip UI. `PILLAR_COLORS` constant declared once and referenced by index in the chip className.
- Atomicity: Task 1 is behavior-preserving (state exists but UI can't populate it → `selectedPillars.length === 0` always → fallback path runs → identical behavior to today). Task 2 swaps the UI to let the user populate the state.
