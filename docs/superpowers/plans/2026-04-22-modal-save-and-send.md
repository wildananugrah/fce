# Content Preview Modal — Save & Send to Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the Content Preview modal is opened from the Content Generator, its primary button promotes the item to Library (matching the row's save-and-approve flow) instead of only saving edits. Library-opened modals are unchanged.

**Architecture:** Add an optional `onSent` prop to `ContentPreviewModal`. When provided and the item's status is still `"generated"`, the modal's button persists edits and PATCHes status to `draft`, then calls `onSent` so the parent can remove the item and close the modal. Extract the section-persistence logic into a private helper so save-only and save-and-send paths don't duplicate it.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4. Frontend-only change. No backend work, no schema changes.

---

## File Structure

Files to modify:
- `frontend/src/components/library/ContentPreviewModal.tsx` — new prop, new handler, extracted helper, branched button + hidden status footer in Generator context.
- `frontend/src/pages/GeneratePage.tsx` — pass `onSent` when rendering the modal.

No new files. No backend changes.

---

## Task 1: Extract `persistSectionEdits` helper (pure refactor)

This task is behavior-preserving: no UI change, just moves code so Task 2 can reuse it.

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx` — the `handleSaveSections` function at lines 163-210

- [ ] **Step 1: Replace `handleSaveSections` with a shared helper + thin wrapper**

Open `frontend/src/components/library/ContentPreviewModal.tsx`. Locate `handleSaveSections` (currently at line 163). Replace the entire function (lines 163-210) with:

```typescript
	// Shared section-persistence. PATCHes existing edits and POSTs any new
	// sections that were previously only in content.* fallbacks. Reconciles
	// localSections so both the modal and the parent stay in sync. Throws
	// on any API error; callers decide how to surface the failure.
	const persistSectionEdits = async () => {
		// 1) Update existing edited sections.
		for (const [id, contentText] of Object.entries(editedSections)) {
			await api(`/api/workspaces/${workspaceId}/library/${item.id}/sections/${id}`, {
				method: "PATCH",
				body: JSON.stringify({ contentText }),
			});
		}
		// 2) Create any sections that didn't exist before (e.g. caption for
		//    older outputs whose data only lived in content.caption).
		const createdSections: Section[] = [];
		for (const [sectionType, contentText] of Object.entries(pendingNewByType)) {
			const res = await api<{ data: Section }>(
				`/api/workspaces/${workspaceId}/library/${item.id}/sections`,
				{
					method: "POST",
					body: JSON.stringify({ sectionType, contentText }),
				},
			);
			const created = (res as any).data ?? res;
			createdSections.push(created);
		}
		const finalSections =
			createdSections.length > 0 ? [...localSections, ...createdSections] : localSections;
		const withEdits = finalSections.map((s) =>
			editedSections[s.id] !== undefined ? { ...s, contentText: editedSections[s.id] } : s,
		);
		if (createdSections.length > 0) {
			setLocalSections(withEdits);
		} else {
			setLocalSections((prev) =>
				prev.map((s) =>
					editedSections[s.id] !== undefined ? { ...s, contentText: editedSections[s.id] } : s,
				),
			);
		}
		onSectionsUpdated?.(item.id, withEdits);
		setEditedSections({});
		setPendingNewByType({});
	};

	const handleSaveSections = async () => {
		setSavingSections(true);
		try {
			await persistSectionEdits();
			onToast("Changes saved", "success");
		} catch (e) {
			onToast(e instanceof Error ? e.message : "Failed to save", "error");
		} finally {
			setSavingSections(false);
		}
	};
```

The helper body is literally the contents of the old `try` block (minus `setEditedSections({})`/`setPendingNewByType({})` which stay, plus the success toast moved to the wrapper).

- [ ] **Step 2: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no output.

- [ ] **Step 3: Frontend build (sanity)**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds. Chunk-size warning is pre-existing.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send && git add frontend/src/components/library/ContentPreviewModal.tsx && git commit -m "refactor(content-modal): extract persistSectionEdits helper"
```

---

## Task 2: Add `onSent` prop + save-and-send handler + branched button + hidden status footer

This is the behavior change — but only visible when a parent passes `onSent`. Without a caller (Task 3), the runtime behavior is identical to before.

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx` — props interface (lines 28-37), add handler + flag (after `handleSaveSections`), button (lines 488-499), status footer (lines 514-547).

- [ ] **Step 1: Add the `onSent` prop to the props interface**

Find `interface ContentPreviewModalProps` (lines 28-37). Replace with:

```typescript
interface ContentPreviewModalProps {
	item: LibraryItem;
	workspaceId: string;
	onClose: () => void;
	onStatusChange: (id: string, status: string) => void;
	onToast: (msg: string, type: "success" | "error" | "info") => void;
	onSectionsUpdated?: (itemId: string, sections: Section[]) => void;
	/** When false, the status dropdown is replaced with a read-only badge. */
	canChangeStatus?: boolean;
	/** When provided, "Save Changes" on a still-`generated` item also promotes
	 *  it to `draft` and calls this callback so the parent can remove it from
	 *  its list. Used by the Content Generator, not the Library. */
	onSent?: (itemId: string) => void;
}
```

Then destructure `onSent` in the component signature. Find:

```typescript
export function ContentPreviewModal({
	item,
	workspaceId,
	onClose,
	onStatusChange,
	onToast,
	onSectionsUpdated,
	canChangeStatus = true,
}: ContentPreviewModalProps) {
```

Replace with:

```typescript
export function ContentPreviewModal({
	item,
	workspaceId,
	onClose,
	onStatusChange,
	onToast,
	onSectionsUpdated,
	canChangeStatus = true,
	onSent,
}: ContentPreviewModalProps) {
```

- [ ] **Step 2: Add the `isGeneratorContext` flag and `handleSaveAndSend` handler**

Immediately after the `handleSaveSections` definition from Task 1, insert:

```typescript
	// "Generator context" = modal was opened from the Content Generator
	// (parent passed onSent) AND the output is still in the pre-library
	// "generated" state. The primary button then becomes Save-and-Send.
	const isGeneratorContext = !!onSent && item.status === "generated";

	const handleSaveAndSend = async () => {
		setSavingSections(true);
		try {
			if (isDirty) {
				await persistSectionEdits();
			}
			await api(`/api/workspaces/${workspaceId}/library/${item.id}`, {
				method: "PATCH",
				body: JSON.stringify({ status: "draft" }),
			});
			onSent?.(item.id);
			onClose();
		} catch (e) {
			onToast(e instanceof Error ? e.message : "Failed to send", "error");
		} finally {
			setSavingSections(false);
		}
	};
```

- [ ] **Step 3: Branch the button render**

Find the button block (currently lines 488-499):

```tsx
              <button
                type="button"
                onClick={handleSaveSections}
                disabled={!isDirty || savingSections}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isDirty
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {savingSections ? "Saving..." : "Save Changes"}
              </button>
```

Replace it with:

```tsx
              <button
                type="button"
                onClick={isGeneratorContext ? handleSaveAndSend : handleSaveSections}
                disabled={savingSections || (!isGeneratorContext && !isDirty)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isGeneratorContext
                    ? "bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                    : isDirty
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {savingSections
                  ? isGeneratorContext
                    ? "Sending..."
                    : "Saving..."
                  : isGeneratorContext
                    ? isDirty
                      ? "Save & Send to Library"
                      : "Send to Library"
                    : "Save Changes"}
              </button>
```

| Label/style matrix | No edits | Has edits |
|---|---|---|
| Generator context | "Send to Library" (green, enabled) | "Save & Send to Library" (green, enabled) |
| Library context | "Save Changes" (grey, disabled) | "Save Changes" (indigo, enabled) |
| While saving (Generator) | "Sending..." | "Sending..." |
| While saving (Library) | "Saving..." | "Saving..." |

- [ ] **Step 4: Hide the status footer in Generator context**

Find the footer status block (currently lines 514-547). It starts with:

```tsx
        {/* Footer — Status (editable only for approvers) */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
```

Wrap that entire `<div>` (from `{/* Footer — Status` through the matching `</div>` at line 547) in a conditional:

```tsx
        {!isGeneratorContext && (
          <>
            {/* Footer — Status (editable only for approvers) */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
              {/* existing content — unchanged */}
            </div>
          </>
        )}
```

The existing content inside the div (the "Status:" label, the `canChangeStatus` branch with `<select>`, the read-only `<span>` fallback) stays exactly as it is. Only the wrapper conditional is new.

- [ ] **Step 5: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no output.

- [ ] **Step 6: Frontend build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send && git add frontend/src/components/library/ContentPreviewModal.tsx && git commit -m "feat(content-modal): save-and-send button when opened from Generator"
```

---

## Task 3: Wire `onSent` in GeneratePage

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx` — the `<ContentPreviewModal>` render at lines 1191-1201

- [ ] **Step 1: Pass `onSent` to the modal**

Open `frontend/src/pages/GeneratePage.tsx`. Find the modal render (starts around line 1191). Replace:

```tsx
      {previewItem && activeWorkspace && (
        <ContentPreviewModal
          item={previewItem}
          workspaceId={activeWorkspace.id}
          onClose={() => setPreviewItem(null)}
          onStatusChange={(id, status) => {
            setPreviewItem((prev) => prev && prev.id === id ? { ...prev, status } : prev);
          }}
          onToast={showToast}
        />
      )}
```

with:

```tsx
      {previewItem && activeWorkspace && (
        <ContentPreviewModal
          item={previewItem}
          workspaceId={activeWorkspace.id}
          onClose={() => setPreviewItem(null)}
          onStatusChange={(id, status) => {
            setPreviewItem((prev) => prev && prev.id === id ? { ...prev, status } : prev);
          }}
          onToast={showToast}
          onSent={() => {
            // The modal just flipped the output's status to "draft". The
            // backend's list filter (findByWorkspace) only returns requests
            // with no outputs OR outputs still in "generated" state — so
            // this request will disappear from the list on reload.
            // Reload instead of doing id correlation gymnastics:
            // previewItem carries the output id, not the generation id.
            setPreviewItem(null);
            loadGenerations();
            showToast(
              "Sent to Library as Draft — review it there to approve or reject.",
              "success",
            );
          }}
        />
      )}
```

`loadGenerations` already exists at [GeneratePage.tsx:511](frontend/src/pages/GeneratePage.tsx#L511). Toast copy matches `handleGenerationApproved`'s existing message so the user gets identical feedback regardless of which path (row button or modal) they used.

- [ ] **Step 2: Frontend typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 3: Frontend build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send && git add frontend/src/pages/GeneratePage.tsx && git commit -m "feat(generate-page): wire modal onSent to remove item after send"
```

---

## Task 4: End-to-end manual verification

**Files:** (no edits; exercise the UI)

- [ ] **Step 1: Start the dev servers from the worktree**

Backend: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/backend && bun run --hot src/index.ts`

Frontend: `cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-save-and-send/frontend && npm run dev -- --port 5174`

Set `VITE_API_URL` in the frontend `.env` to point at the backend port used (default 3004 or whatever the worktree sets up). If the main dev server is also running, use alternate ports.

- [ ] **Step 2: Case 1 — Video, edited, from Generator**

1. Open `http://localhost:5174/generate`
2. Generate a video-type content (platform=instagram, format=reels; or tiktok/video).
3. When it appears in the list, click the row to open the preview modal.
4. Edit any scene's voiceover text (or visualDirection).
5. Confirm the button label reads **"Save & Send to Library"** (green).
6. Click it.
7. Expected:
   - Modal closes.
   - Toast appears: "Sent to Library as Draft — review it there to approve or reject."
   - The video row disappears from the Generator list.
   - Navigate to `/library`. The video appears there with status "Draft" (or "draft"-styled badge).
   - Open it from the Library — the edit you made is persisted in the scene.

- [ ] **Step 3: Case 2 — Video, untouched, from Generator**

1. Generate another video. Click the row to open the modal. Do **not** edit anything.
2. Confirm the button reads **"Send to Library"** (green, still enabled).
3. Click. Expected: same as Case 1 minus the edit persistence — item moves to Library without any section PATCH in the network tab.

- [ ] **Step 4: Case 3 — Single-image, from Generator**

Repeat Case 1 with a single-image content type. Confirm identical behavior — the fix isn't type-specific.

- [ ] **Step 5: Case 4 — Library-opened modal, edited**

1. Navigate to `/library`. Click a previously-sent item to open its modal.
2. Edit something.
3. Confirm the button reads **"Save Changes"** (indigo) — NOT "Save & Send to Library".
4. Click. Expected:
   - Toast: "Changes saved".
   - Modal stays open.
   - Status unchanged.
   - Status dropdown at the bottom is still visible (approvers can still change status there).

- [ ] **Step 6: Case 5 — Library-opened modal, untouched**

1. Open a Library item without editing.
2. Confirm the button is **disabled** (grey "Save Changes") — same as before this change.

- [ ] **Step 7: Case 6 — Generator-opened modal, status footer**

1. On a Generator row, open the modal.
2. Scroll to the bottom. Expected: **no "Status:" row visible** (it's hidden in Generator context).
3. Go to the Library, open a Library-status item. The "Status:" row at the bottom should be present.

- [ ] **Step 8: If any case fails, fix with a targeted commit**

Use a message like `fix(content-modal): <what>`. Re-run the failing case.

- [ ] **Step 9: Stop dev servers and report done**

---

## Self-review notes

- **Spec coverage:**
  - §1 "New optional prop" → Task 2 Step 1.
  - §2 "Extract helper" → Task 1.
  - §3 "New handler" → Task 2 Step 2.
  - §4 "Branched button" → Task 2 Step 3.
  - §5 "Hide status footer" → Task 2 Step 4.
  - §6 "Wire GeneratePage" → Task 3.
  - Testing matrix → Task 4 Steps 2-7 cover all six spec cases.
- **Placeholder scan:** no TBDs. Every step has concrete code or concrete commands.
- **Type consistency:** `onSent?: (itemId: string) => void` referenced identically in props interface, destructure, handler call, and GeneratePage pass. `isGeneratorContext` defined once and read in both handler choice and footer conditional.
- **Atomicity per commit:**
  - Task 1 is a pure refactor — behavior byte-identical to before.
  - Task 2 introduces the new code path, but without a caller the modal still renders with Library behavior for every caller.
  - Task 3 flips GeneratePage to the new path. Only now does user-visible behavior change.
  - Each commit compiles and the app remains usable.
- **Risk notes (from spec):** double-click guard is already in `savingSections`. `onClose` firing twice (from `handleSaveAndSend` + parent's reset) is idempotent. Hiding the status footer in Generator context removes a previously-broken UI (dropdown didn't include the `"generated"` value), net positive.
