# Content Results Overview, Editing & Approval Workflow — Design Spec

**Date:** 2026-04-11
**Approach:** Incremental Enhancement (Approach A)

## Overview

Three feature updates to the content generation and library system:

1. **Inline Content Overview** — Expandable rows in the GeneratePage "Recent Generations" table showing hook (Copy in Visual), visual direction, and caption with inline editing.
2. **Approval Workflow** — Two-step approval: approve on GeneratePage moves content to Content Library; reject keeps it on GeneratePage for re-editing. Only approved content appears in Content Library.
3. **Editable Library Preview** — Content Library preview modal gets an edit toggle allowing users to edit hook, visual direction, and caption. Status can be changed back to draft (removes from library, returns to GeneratePage).

---

## 1. GeneratePage — Expandable Rows with Editable Content

### Current Behavior
"Recent Generations" table shows brand/platform/format/status with a "View" button that opens ContentPreviewModal.

### New Behavior

Each table row becomes expandable. Clicking anywhere on the row (except action buttons) toggles an expanded section below showing 3 editable fields:

| Field | Source | Input Type |
|-------|--------|------------|
| Copy in Visual (Hook) | `OutputSection` where `sectionType = "hook"` | Text input |
| Visual Direction | `OutputSection` where `sectionType = "visual_direction"` | Textarea |
| Caption | `OutputSection` where `sectionType = "caption"` | Textarea |

**Expand/collapse:** A chevron icon on the left indicates state (right = collapsed, down = expanded).

**Editing:** Fields are always editable in the expanded section. Changes held in local state. A "Save" button appears (disabled until changes detected) that PATCHes updated sections to the backend.

**Action buttons on each row:**
- Expand icon (eye) — opens ContentPreviewModal for full vertical view
- Approve (checkmark) — sets status to "approved", row disappears from table (moved to Content Library), toast confirms
- Reject (X) — sets status to "rejected", row stays on GeneratePage for re-editing

**Data fetching:** When a row is expanded for the first time, fetch full output with sections via `GET /generations/:id`. Cache in local state for instant subsequent expand/collapse.

**Approved rows disappear:** Once approved, the row is removed from the list. Toast: "Content approved and moved to library."

---

## 2. Content Library — Approval Gate and Editable Preview

### Approval Gate

Library query filters to only show outputs with `status = "approved"`. Draft and rejected outputs stay on GeneratePage only. The backend `findOutputsByWorkspace` method accepts an optional `status` filter parameter.

### Editable Preview Modal

Clicking "View" opens ContentPreviewModal, enhanced with:

1. **Edit toggle** — switch in the modal header. Default: off (read-only).
2. **Edit OFF:** Content displays as read-only text (current platform-specific preview behavior).
3. **Edit ON:** The 3 key fields become editable inputs:
   - Copy in Visual (Hook) — text input
   - Visual Direction — textarea
   - Caption — textarea
   
   A "Save" button appears at the bottom. Changes are local until saved.

4. **Status controls** remain in the footer. Changing status from "approved" back to "draft" or "rejected" removes the item from the library (returns to GeneratePage).

**Copy All** button copies only saved content (not unsaved edits).

---

## 3. Backend Changes

### Library query filter

`findOutputsByWorkspace(workspaceId, status?)` — when `status` is provided, filter by it. The library route passes `status=approved` by default.

Route: `GET /api/workspaces/:id/library?status=approved`

### Section update endpoint

New endpoint to bulk-update section text:

```
PATCH /api/workspaces/:id/library/:outputId/sections
Body: { sections: [{ id: string, contentText: string }] }
```

Updates `contentText` for each provided section ID. Used by both GeneratePage and LibraryPage when saving edits.

### No schema changes needed

- `OutputSection` already has `contentText` (editable) and `sectionType` (identifies field)
- `GenerationOutput.status` already supports `draft/approved/rejected`

---

## 4. Component Extraction

### New: `GenerationResultRow`

**File:** `frontend/src/components/generation/GenerationResultRow.tsx`

Extracted from GeneratePage to keep the file manageable. Handles:
- Row display (brand, platform, format, status)
- Expand/collapse with chevron
- Fetching and caching output sections on first expand
- Editable fields (hook, visual direction, caption)
- Local state tracking for dirty/clean
- Save button (PATCH sections)
- Approve/reject buttons (PATCH status)
- "View full" button to open ContentPreviewModal

**Props:**
```typescript
{
  generation: Generation;
  workspaceId: string;
  onApproved: (id: string) => void;
  onViewFull: (generation: Generation) => void;
}
```

### Modified: `ContentPreviewModal`

- Add `editable?: boolean` prop (default false)
- Add `onToggleEdit?: () => void` callback
- When editable, render 3 fields as inputs instead of read-only preview
- Add Save button in editable mode
- Platform-specific preview shows when NOT in edit mode

---

## 5. Files to Modify

| Layer | File | Changes |
|-------|------|---------|
| Frontend | `frontend/src/components/generation/GenerationResultRow.tsx` | **New** — expandable row with editable hook/visual direction/caption, approve/reject/save/view actions |
| Frontend | `frontend/src/pages/GeneratePage.tsx` | Replace table rows with `GenerationResultRow`, remove approved items from list |
| Frontend | `frontend/src/components/library/ContentPreviewModal.tsx` | Add edit toggle, editable fields, save button |
| Frontend | `frontend/src/pages/LibraryPage.tsx` | Filter to approved only, pass editable props to modal, handle status change removing item |
| Backend | `backend/src/repositories/generation.repository.ts` | Add `status` filter to `findOutputsByWorkspace` |
| Backend | `backend/src/routes/library.route.ts` | Pass `status` query param, add `PATCH /:outputId/sections` endpoint |
| Backend | `backend/src/services/library.service.ts` | Pass `status` filter through, add `updateSections` method |
| Backend | `backend/src/repositories/output-section.repository.ts` | Add `updateMany` method for bulk section text updates |

---

## 6. Data Flow

### Generation → Approval → Library

```
Content Generated (status: "draft")
    ↓
Shows in GeneratePage "Recent Generations" table
    ↓
User expands row → sees hook, visual direction, caption
    ↓
User edits fields → clicks Save → PATCH sections
    ↓
User clicks Approve → PATCH status to "approved"
    ↓
Row disappears from GeneratePage
    ↓
Item appears in Content Library (filtered to approved)
    ↓
User can view, toggle edit, modify, save
    ↓
User can change status back to draft → item leaves library, returns to GeneratePage
```

### Rejection Flow

```
User clicks Reject on GeneratePage row
    ↓
Status set to "rejected", row stays on GeneratePage
    ↓
User can re-edit hook/visual direction/caption
    ↓
User can re-approve after editing
```
