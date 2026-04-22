# Content status change — notes + history

**Date:** 2026-04-22
**Status:** Approved for planning

## Problem

When a reviewer changes a content output's status (draft → in_review → approved / rejected) from the Library preview modal, there's no way to capture *why*. The generator and later reviewers can't tell what was wrong with a rejected piece, or who approved it and when. The decision is silent — only the final status remains.

## Goal

1. Let the user leave a short note when they change a content output's status.
2. Require a note for rejections; make it optional for all other changes.
3. Show a chronological history of status changes (with notes and who made each change) inside the preview modal.

## Non-goals

- No change to topics or campaigns. Content outputs only.
- No editing or deleting notes after they're posted — immutable audit trail.
- No threaded comments / replies on a single status change.
- No backfill of historical events with fake notes. Older events predate this feature and won't appear in the new view.
- No notifications (email / in-app) when a status changes. Follow-up if the team wants it.

## Current state

### Schema

`OutputFeedbackEvent` already exists and is scoped per `GenerationOutput`:

```
id, outputId, eventType, before, after, userId, createdAt
```

It's written to today by `LibraryService.addFeedback` for `section_create` edits, and for legacy `approve` / `reject` event types. There is **no** `note` column.

### API

`PATCH /api/workspaces/:w/library/:id` (in [library.route.ts](backend/src/routes/library.route.ts)) accepts `{ status }` and is gated by `requireApprover`. It updates `GenerationOutput.status` but does **not** currently call `addFeedback`, so status flips leave no trace.

### Frontend

`ContentPreviewModal`'s footer has an approver-only `<select>` dropdown (draft / in_review / approved / rejected) that immediately fires `handleStatusChange`. There's no visible history.

## Design

### 1. Schema

Add one nullable text column to `OutputFeedbackEvent`:

```prisma
model OutputFeedbackEvent {
  id        String   @id @default(uuid())
  outputId  String   @map("output_id")
  eventType String   @map("event_type")
  before    Json?
  after     Json?
  note      String?  @db.Text   // NEW
  userId    String?  @map("user_id")
  createdAt DateTime @default(now()) @map("created_at")

  output GenerationOutput @relation(fields: [outputId], references: [id], onDelete: Cascade)

  @@index([outputId])
  @@map("output_feedback_events")
}
```

Status-change events use this schema with:

| Field | Value |
|---|---|
| `eventType` | `"status_change"` (new value; existing `"approve"` / `"reject"` / `"section_create"` unchanged) |
| `before` | `{ "status": "<old>" }` |
| `after` | `{ "status": "<new>" }` |
| `note` | user input or null |
| `userId` | the approver who made the change |

Migration: single `bunx prisma db push` — adding a nullable column to an existing table. No data migration.

### 2. Backend changes

**Repository** (`generation.repository.ts`):

- New method `findStatusChangesByOutput(outputId: string)` — returns feedback events filtered to `eventType === "status_change"`, joined with the user's `fullName` and `email`, ordered by `createdAt desc`.

**Service** (`library.service.ts`):

- Extend `addFeedback(outputId, eventType, userId, before?, after?, note?)` — new optional `note` parameter, threaded into the repository insert.
- New method `listStatusHistory(outputId)` — calls `findStatusChangesByOutput`, returns `{ id, eventType, before, after, note, userId, userName, userEmail, createdAt }[]`.
- On status change, the service calls `addFeedback` with `eventType: "status_change"`, explicit before/after, and the note.

**Route** (`library.route.ts`):

- `PATCH :id` handler:
  - Destructure `{ status, note }` from body.
  - Validate: if `status === "rejected"` and `!note?.trim()`, return 400 `{ error: "A note is required when rejecting content" }`.
  - Fetch the output to capture `oldStatus` before updating (the route already fetches for access checks; piggyback on that).
  - Update status.
  - Call `addFeedback` with the old/new status and note.
  - Return updated output.
- `GET :id/history` handler (new, approver-gated via the same `requireApprover(prisma)` middleware the PATCH route uses):
  - Returns `listStatusHistory(outputId)` result.

### 3. Frontend changes

`ContentPreviewModal.tsx`:

**Status-change flow.** Today the footer dropdown fires PATCH on change. Replace with a two-step confirm:

1. User picks a new status in the `<select>`.
2. Local state flips to "pending change": dropdown shows the new value (or reverts visibly on cancel).
3. Inline note panel appears directly under the dropdown:
   - Label: "Note (required for rejection)" when new status is `rejected`, else "Note (optional)".
   - `<textarea>` with 3 rows.
   - Buttons: "Cancel" (reverts dropdown to original) and "Confirm change" (disabled when `newStatus === "rejected" && !note.trim()`).
4. On Confirm, PATCH with `{ status, note: note.trim() || undefined }`; on success, clear the pending state, update `currentStatus`, prepend a new history entry to the visible list.

**History panel.** Below the status row in the footer, add a collapsible section:

```
▸ History (N)
```

Expanded:

```
▾ History (N)
  <user name> · <old> → <new> · <relative time>
    "<note>"   (or "(no note)" in grey italic)
  ...
```

- Relative time formatter already exists in `formatRelativeDate` in other pages — reuse or inline a small equivalent.
- History is fetched **eagerly** on modal open (one request, small payload) so expand is instant.
- New events get prepended optimistically after a successful status change.

### 4. Data flow

```
User picks new status in modal
  → local pending state, note panel appears
User types note (required for rejection)
  → Confirm button enables when valid
User clicks Confirm
  → PATCH /library/:id { status, note }
    → Route validates (rejection requires note)
    → Route updates GenerationOutput.status
    → Route calls addFeedback(outputId, "status_change", userId, before, after, note)
    → Response: updated output
  → Frontend updates currentStatus, prepends new history entry, closes note panel
```

### 5. Tests

**Backend:**
- Service test: `addFeedback` persists `note`; rejection without note throws; `listStatusHistory` filters to `eventType === "status_change"` and sorts newest-first.
- Route test (if present in the existing suite): PATCH rejects without note returns 400 with the exact error message.

**Frontend:** No automated tests — the Library modal has no existing test harness. Manual QA in the plan step.

### 6. Risks

- **Filter excludes pre-existing `approve` / `reject` legacy events.** By design; we don't fabricate notes for historical data. If the team ever wants to surface them, the filter at repository level is one line.
- **Note column is nullable + unbounded text.** Text column accepts any length; no server-side cap. Worst case is a user pasting a novel. Add a soft client-side limit (e.g. 2000 chars) to be polite; the backend doesn't enforce.
- **Optimistic history update can desync if the PATCH succeeds but the client crashes before prepending.** Next modal open re-fetches history — self-heals.
- **Race between two reviewers.** If two approvers change status within the same second, both events land in the history with their respective notes. The final `GenerationOutput.status` is the last write. Acceptable — the history gives the full picture.

## Out of scope

- Audit on topics / campaigns (A-scope only).
- Edit / delete existing notes.
- Threaded comments.
- Notifications.
- Backfilling notes for pre-this-feature events.
- Exporting history.
