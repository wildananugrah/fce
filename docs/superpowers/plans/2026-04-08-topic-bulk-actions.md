# Topic Library Bulk Actions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-select checkboxes to the Topic Library table with bulk delete (hard delete with confirmation) and bulk status change actions.

**Architecture:** Two new backend endpoints (`DELETE /bulk`, `PATCH /bulk-status`) flow through service → repository → Prisma. Frontend adds checkbox column to existing table, selection state, a floating action bar, and a confirmation dialog using the existing Modal component.

**Tech Stack:** Hono, Prisma, React 19, Tailwind CSS 4

---

## File Structure

### Backend (modified)
- `backend/src/interfaces/repositories/topic.repository.interface.ts` — Add `deleteMany`, `updateManyStatus` to interface
- `backend/src/repositories/topic.repository.ts` — Implement new methods with Prisma
- `backend/src/interfaces/services/topic.service.interface.ts` — Add `deleteMany`, `updateManyStatus` to interface
- `backend/src/services/topic.service.ts` — Implement new methods delegating to repository
- `backend/src/routes/topic.route.ts` — Add `DELETE /bulk` and `PATCH /bulk-status` routes

### Frontend (modified)
- `frontend/src/pages/TopicLibraryPage.tsx` — Checkbox column, selection state, floating action bar, delete confirmation dialog

---

### Task 1: Repository Interface & Implementation

**Files:**
- Modify: `backend/src/interfaces/repositories/topic.repository.interface.ts:1-19`
- Modify: `backend/src/repositories/topic.repository.ts:1-36`

- [ ] **Step 1: Add methods to ITopicRepository interface**

In `backend/src/interfaces/repositories/topic.repository.interface.ts`, add two methods after the `update` method (before the closing `}`):

```typescript
deleteMany(workspaceId: string, ids: string[]): Promise<number>;
updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
```

- [ ] **Step 2: Implement deleteMany in TopicRepository**

In `backend/src/repositories/topic.repository.ts`, add this method after the `update` method:

```typescript
async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
	const result = await this.prisma.contentTopic.deleteMany({
		where: { workspaceId, id: { in: ids } },
	});
	return result.count;
}
```

- [ ] **Step 3: Implement updateManyStatus in TopicRepository**

In `backend/src/repositories/topic.repository.ts`, add this method after `deleteMany`:

```typescript
async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
	const result = await this.prisma.contentTopic.updateMany({
		where: { workspaceId, id: { in: ids } },
		data: { status },
	});
	return result.count;
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/repositories/topic.repository.interface.ts backend/src/repositories/topic.repository.ts
git commit -m "feat(topic): add deleteMany and updateManyStatus to repository"
```

---

### Task 2: Service Interface & Implementation

**Files:**
- Modify: `backend/src/interfaces/services/topic.service.interface.ts:1-18`
- Modify: `backend/src/services/topic.service.ts:1-66`

- [ ] **Step 1: Add methods to ITopicService interface**

In `backend/src/interfaces/services/topic.service.interface.ts`, add two methods after `generate` (before the closing `}`):

```typescript
deleteMany(workspaceId: string, ids: string[]): Promise<number>;
updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
```

- [ ] **Step 2: Implement deleteMany in TopicService**

In `backend/src/services/topic.service.ts`, add this method after the `generate` method:

```typescript
async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
	if (!ids.length) {
		throw new Error("No topic IDs provided");
	}
	return this.topicRepository.deleteMany(workspaceId, ids);
}
```

- [ ] **Step 3: Implement updateManyStatus in TopicService**

In `backend/src/services/topic.service.ts`, add this method after `deleteMany`:

```typescript
async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
	const validStatuses = ["draft", "scheduled", "published", "archived"];
	if (!ids.length) {
		throw new Error("No topic IDs provided");
	}
	if (!validStatuses.includes(status)) {
		throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
	}
	return this.topicRepository.updateManyStatus(workspaceId, ids, status);
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/interfaces/services/topic.service.interface.ts backend/src/services/topic.service.ts
git commit -m "feat(topic): add deleteMany and updateManyStatus to service"
```

---

### Task 3: Route Handlers

**Files:**
- Modify: `backend/src/routes/topic.route.ts:1-85`

- [ ] **Step 1: Add DELETE /bulk route**

In `backend/src/routes/topic.route.ts`, add this route **after** the `POST /generate` route and **before** the `POST /` route (to avoid `:id` param conflict):

```typescript
// DELETE /bulk — bulk delete topics
app.delete("/bulk", async (c) => {
	const workspaceId = c.get("workspaceId");
	const { ids } = await c.req.json<{ ids: string[] }>();
	if (!Array.isArray(ids) || ids.length === 0) {
		return c.json({ error: "ids must be a non-empty array" }, 400);
	}
	const deleted = await topicService.deleteMany(workspaceId, ids);
	return c.json({ deleted });
});
```

- [ ] **Step 2: Add PATCH /bulk-status route**

In `backend/src/routes/topic.route.ts`, add this route right after `DELETE /bulk`:

```typescript
// PATCH /bulk-status — bulk status change
app.patch("/bulk-status", async (c) => {
	const workspaceId = c.get("workspaceId");
	const { ids, status } = await c.req.json<{ ids: string[]; status: string }>();
	if (!Array.isArray(ids) || ids.length === 0) {
		return c.json({ error: "ids must be a non-empty array" }, 400);
	}
	if (!status) {
		return c.json({ error: "status is required" }, 400);
	}
	try {
		const updated = await topicService.updateManyStatus(workspaceId, ids, status);
		return c.json({ updated });
	} catch (e) {
		return c.json({ error: e instanceof Error ? e.message : "Invalid status" }, 400);
	}
});
```

- [ ] **Step 3: Verify types compile**

Run: `cd backend && bunx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Manual smoke test**

Start the backend: `cd backend && bun run --hot src/index.ts`

Test bulk status (replace workspace ID with a valid one):
```bash
curl -X PATCH http://localhost:3001/api/workspaces/<WORKSPACE_ID>/topics/bulk-status \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["non-existent-id"], "status": "archived"}'
```
Expected: `{"updated":0}`

Test bulk delete:
```bash
curl -X DELETE http://localhost:3001/api/workspaces/<WORKSPACE_ID>/topics/bulk \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["non-existent-id"]}'
```
Expected: `{"deleted":0}`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/topic.route.ts
git commit -m "feat(topic): add bulk delete and bulk status change endpoints"
```

---

### Task 4: Frontend — Selection State & Checkbox Column

**Files:**
- Modify: `frontend/src/pages/TopicLibraryPage.tsx:126-239`

- [ ] **Step 1: Add selection state**

In the `TopicLibraryPage` component, add after the existing `useState` declarations (after line 132):

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 2: Clear selection when filter changes**

Replace the existing status filter `Select` component's `onChange` (line 174) to also clear selection:

```typescript
onChange={(e) => {
  setStatusFilter(e.target.value);
  setSelectedIds(new Set());
}}
```

- [ ] **Step 3: Add select-all checkbox to table header**

Add a new `<th>` as the **first column** in the `<thead>` row (before the Title `<th>`):

```tsx
<th className="w-10 px-4 py-2.5">
  <input
    type="checkbox"
    className="rounded border-gray-300 accent-indigo-600"
    checked={filteredTopics.length > 0 && selectedIds.size === filteredTopics.length}
    ref={(el) => {
      if (el) {
        el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredTopics.length;
      }
    }}
    onChange={(e) => {
      if (e.target.checked) {
        setSelectedIds(new Set(filteredTopics.map((t) => t.id)));
      } else {
        setSelectedIds(new Set());
      }
    }}
  />
</th>
```

- [ ] **Step 4: Add row checkbox to table body**

Add a new `<td>` as the **first cell** in each `<tr>` row (before the Title `<td>`):

```tsx
<td className="w-10 px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
  <input
    type="checkbox"
    className="rounded border-gray-300 accent-indigo-600"
    checked={selectedIds.has(topic.id)}
    onChange={() => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(topic.id)) {
          next.delete(topic.id);
        } else {
          next.add(topic.id);
        }
        return next;
      });
    }}
  />
</td>
```

Note: `e.stopPropagation()` on the `<td>` prevents the row's `onClick` (edit modal) from firing when clicking the checkbox.

- [ ] **Step 5: Verify frontend compiles**

Run: `cd frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/TopicLibraryPage.tsx
git commit -m "feat(topic-library): add checkbox column with select-all support"
```

---

### Task 5: Frontend — Floating Action Bar & Bulk Status Change

**Files:**
- Modify: `frontend/src/pages/TopicLibraryPage.tsx`

- [ ] **Step 1: Add bulk status change handler**

Add this function inside the `TopicLibraryPage` component, after the `loadTopics` callback:

```typescript
const handleBulkStatusChange = async (status: string) => {
  try {
    await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk-status`, {
      method: "PATCH",
      body: JSON.stringify({ ids: [...selectedIds], status }),
    });
    showToast(`${selectedIds.size} topic(s) updated to ${status}`, "success");
    setSelectedIds(new Set());
    loadTopics();
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Failed to update topics", "error");
  }
};
```

- [ ] **Step 2: Add state for delete confirmation and status dropdown**

Add alongside the other useState declarations:

```typescript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
const [showStatusDropdown, setShowStatusDropdown] = useState(false);
```

- [ ] **Step 3: Add floating action bar**

Add this JSX **after** the `selectedTopic && <TopicEditModal ...>` block and **before** the `toast &&` block:

```tsx
{selectedIds.size > 0 && (
  <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-white border border-gray-200 shadow-lg rounded-xl px-5 py-3">
    <span className="text-sm font-medium text-gray-700">
      {selectedIds.size} topic(s) selected
    </span>
    <div className="w-px h-6 bg-gray-200" />
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setShowStatusDropdown(!showStatusDropdown)}
      >
        Change Status
        <svg className="w-3.5 h-3.5 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </Button>
      {showStatusDropdown && (
        <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {STATUS_EDIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setShowStatusDropdown(false);
                handleBulkStatusChange(opt.value);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
    <Button
      variant="danger"
      size="sm"
      onClick={() => setShowDeleteConfirm(true)}
    >
      Delete
    </Button>
  </div>
)}
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TopicLibraryPage.tsx
git commit -m "feat(topic-library): add floating action bar with bulk status change"
```

---

### Task 6: Frontend — Delete Confirmation Dialog

**Files:**
- Modify: `frontend/src/pages/TopicLibraryPage.tsx`

- [ ] **Step 1: Add bulk delete handler**

Add this function inside the `TopicLibraryPage` component, after the `handleBulkStatusChange` function:

```typescript
const [deleting, setDeleting] = useState(false);

const handleBulkDelete = async () => {
  setDeleting(true);
  try {
    await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ ids: [...selectedIds] }),
    });
    showToast(`${selectedIds.size} topic(s) deleted`, "success");
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    loadTopics();
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Failed to delete topics", "error");
  } finally {
    setDeleting(false);
  }
};
```

- [ ] **Step 2: Add delete confirmation modal**

Add this JSX right after the floating action bar block:

```tsx
{showDeleteConfirm && (
  <Modal isOpen onClose={() => setShowDeleteConfirm(false)} title="Delete Topics" size="sm">
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedIds.size} topic(s)</span>? This action cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" onClick={handleBulkDelete} loading={deleting}>
          Delete
        </Button>
      </div>
    </div>
  </Modal>
)}
```

- [ ] **Step 3: Verify frontend compiles**

Run: `cd frontend && npm run typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TopicLibraryPage.tsx
git commit -m "feat(topic-library): add delete confirmation dialog for bulk delete"
```

---

### Task 7: End-to-End Manual Verification

- [ ] **Step 1: Start backend and frontend**

```bash
cd backend && bun run --hot src/index.ts &
cd frontend && npm run dev &
```

- [ ] **Step 2: Verify checkbox selection**

Navigate to `http://localhost:5173/topic-library`. Verify:
- Checkboxes appear as first column
- Individual row checkboxes toggle selection
- Header checkbox selects all visible topics
- Header checkbox shows indeterminate state when partially selected
- Clicking a checkbox does NOT open the edit modal
- Clicking elsewhere on the row still opens the edit modal

- [ ] **Step 3: Verify bulk status change**

Select 2-3 topics, click "Change Status" in the floating bar, pick "archived". Verify:
- Topics update to archived status
- Selection clears
- Success toast appears

- [ ] **Step 4: Verify bulk delete**

Select 1-2 topics, click "Delete" in the floating bar. Verify:
- Confirmation dialog appears with correct count
- Cancel closes the dialog without deleting
- Confirm deletes topics, clears selection, shows success toast
- Topics are removed from the list

- [ ] **Step 5: Verify filter interaction**

Change the status filter dropdown. Verify:
- Selection clears when filter changes
- Select-all only selects filtered topics

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat(topic-library): bulk select, status change, and delete with confirmation"
```
