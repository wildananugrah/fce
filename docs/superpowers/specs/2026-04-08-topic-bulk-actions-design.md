# Topic Library Bulk Actions — Design Spec

## Overview

Add bulk selection and actions to the Topic Library page. Users can select multiple topics via checkboxes, then perform bulk status changes or bulk hard-delete with confirmation.

## Backend

### New Endpoints

Both endpoints are workspace-scoped under `/api/workspaces/:workspaceId/topics`.

#### `DELETE /bulk`

- **Request body:** `{ ids: string[] }`
- **Behavior:** Hard-deletes all topics matching the provided IDs that belong to the workspace.
- **Response:** `{ deleted: number }`
- **Validation:** IDs must be non-empty array. Only deletes topics within the workspace (Prisma `deleteMany` with `workspaceId` + `id in [...]` filter).

#### `PATCH /bulk-status`

- **Request body:** `{ ids: string[], status: string }`
- **Behavior:** Updates the status of all matching topics within the workspace.
- **Validation:** `status` must be one of: `draft`, `scheduled`, `published`, `archived`. IDs must be non-empty array.
- **Response:** `{ updated: number }`

### Repository Changes

**Interface** (`ITopicRepository`): Add two methods:

```typescript
deleteMany(workspaceId: string, ids: string[]): Promise<number>;
updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
```

**Implementation** (`TopicRepository`): Use Prisma `deleteMany` and `updateMany` with `where: { workspaceId, id: { in: ids } }`. Return the `count` from the Prisma batch result.

### Service Changes

**Interface** (`ITopicService`): Add two methods:

```typescript
deleteMany(workspaceId: string, ids: string[]): Promise<number>;
updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
```

**Implementation** (`TopicService`): Validate inputs (non-empty IDs, valid status for bulk-status), delegate to repository.

### Route Changes

**File:** `topic.route.ts` — Add two new route handlers:

- `app.delete("/bulk", ...)` — Parse body, call `topicService.deleteMany(workspaceId, ids)`, return `{ deleted }`.
- `app.patch("/bulk-status", ...)` — Parse body, validate status, call `topicService.updateManyStatus(workspaceId, ids, status)`, return `{ updated }`.

**Important:** Register `DELETE /bulk` and `PATCH /bulk-status` before `GET /:id` / `PATCH /:id` to avoid route conflicts with the `:id` parameter.

## Frontend

### Selection State

In `TopicLibraryPage.tsx`, add:

- `selectedIds: Set<string>` — tracks selected topic IDs
- Clear `selectedIds` when `statusFilter` changes
- Clear `selectedIds` after any bulk action succeeds

### Table Changes

- **New first column:** Checkbox column
  - **Header cell:** Checkbox that selects/deselects all currently visible (filtered) topics. Shows indeterminate state when partially selected.
  - **Row cell:** Checkbox bound to `selectedIds`. Clicking the checkbox toggles selection without triggering the row's click-to-edit behavior (use `e.stopPropagation()` on the checkbox click).

### Floating Action Bar

Appears fixed at the bottom-center of the page when `selectedIds.size > 0`. Contains:

1. **Selection count:** "{n} topic(s) selected"
2. **"Change Status" dropdown button:** A button that reveals a small dropdown with four options: Draft, Scheduled, Published, Archived. On selection:
   - Calls `PATCH /bulk-status` with `{ ids: [...selectedIds], status }`
   - On success: refresh topic list, clear selection, show success toast
   - On error: show error toast
3. **"Delete" button (red):** Opens the confirmation dialog.

Styling: White background, subtle shadow, rounded, centered with `fixed bottom-6 left-1/2 -translate-x-1/2`, flex row with gap.

### Confirmation Dialog

Uses the existing `Modal` component. Rendered inline in `TopicLibraryPage.tsx` (no new component file).

- **Title:** "Delete Topics"
- **Body:** "Are you sure you want to delete **{n} topic(s)**? This action cannot be undone."
- **Footer actions:**
  - "Cancel" button (gray) — closes dialog
  - "Delete" button (red) — shows loading spinner during API call
- **On confirm:**
  - Calls `DELETE /bulk` with `{ ids: [...selectedIds] }`
  - On success: close dialog, refresh topic list, clear selection, show success toast
  - On error: show error toast, keep dialog open

### API Calls

Add to the existing `api()` usage pattern in TopicLibraryPage:

```typescript
// Bulk delete
api(`/api/workspaces/${workspaceId}/topics/bulk`, {
  method: "DELETE",
  body: JSON.stringify({ ids: [...selectedIds] }),
});

// Bulk status change
api(`/api/workspaces/${workspaceId}/topics/bulk-status`, {
  method: "PATCH",
  body: JSON.stringify({ ids: [...selectedIds], status }),
});
```

## Files to Modify

### Backend
1. `backend/src/interfaces/repositories/topic.repository.interface.ts` — Add `deleteMany`, `updateManyStatus`
2. `backend/src/repositories/topic.repository.ts` — Implement new methods
3. `backend/src/interfaces/services/topic.service.interface.ts` — Add `deleteMany`, `updateManyStatus`
4. `backend/src/services/topic.service.ts` — Implement new methods
5. `backend/src/routes/topic.route.ts` — Add `DELETE /bulk` and `PATCH /bulk-status` routes

### Frontend
6. `frontend/src/pages/TopicLibraryPage.tsx` — Checkbox column, selection state, floating action bar, confirmation dialog

## Edge Cases

- **Empty selection:** Action bar hidden when no topics selected. Buttons disabled during loading.
- **Filter change:** Clears selection to avoid acting on non-visible topics.
- **All filtered topics deleted:** After deletion, if the list is empty for the current filter, the empty state renders naturally.
- **Concurrent edits:** If a topic was already deleted by another user, the bulk operations still succeed (Prisma `deleteMany`/`updateMany` silently skip missing IDs). The returned count reflects actual changes.
