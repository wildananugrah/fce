# Content Preview modal — "Save & Send to Library" in Generator context

**Date:** 2026-04-22
**Status:** Approved for planning

## Problem

When a user on the Content Generator opens a row to preview/edit it (e.g. to adjust scene voiceovers on a video), the `ContentPreviewModal` shows a "Save Changes" button. Clicking it persists text edits to the sections but **does not** flip status or move the item to the Library — the video stays parked on the Generator. The user has to close the modal and click the separate "Save & Send to Library" button on the row itself.

The row button (`handleSaveAndApprove` in [GenerationResultRow.tsx:179](frontend/src/components/generation/GenerationResultRow.tsx#L179)) already does save-then-send correctly for every content type. But users editing video scenes inside the modal naturally expect the modal's primary button to complete the flow — not to require a second action after closing.

Originally framed as "video doesn't move to library while single image does." In fact the modal behaves identically for all content types today; the UX friction is just more visible on video because the scene editor is where most edits happen.

## Goals

1. Clicking "Save Changes" in the modal when opened **from the Content Generator** persists any edits and promotes the item to Library in one step, then closes the modal. Matches the row's `handleSaveAndApprove` exactly.
2. Clicking "Save Changes" in the modal when opened **from the Library** keeps today's behavior: save edits only, status unchanged, modal stays open.

## Non-goals

- No change to the row's green "Save & Send to Library" button. Users keep both paths.
- No change to the section persistence API.
- No change to the Library-context status dropdown.
- Not type-specific. Works the same for video, single-image, carousel, story, etc.
- No new backend work.

## Current state

### Modal ([ContentPreviewModal.tsx](frontend/src/components/library/ContentPreviewModal.tsx))

- `handleSaveSections` (lines 163-210) PATCHes edits into `/api/workspaces/:w/library/:id/sections/...`. No status change.
- Button (lines 488-499) says "Save Changes", disabled when `!isDirty || savingSections`.
- Footer (lines 514-547) shows a status dropdown for approvers. In Generator context the current status is `"generated"` — not in the dropdown option list, so the field is effectively unusable.

### Used by

- **GeneratePage** (lines 1191-1201) — passes `item`, `workspaceId`, `onClose`, `onStatusChange`, `onToast`. Opens the modal when a user views a Generator row.
- **LibraryPage** — same modal, same purpose (view/edit post-send items).

### Row button for reference ([GenerationResultRow.tsx:179-214](frontend/src/components/generation/GenerationResultRow.tsx#L179-L214))

`handleSaveAndApprove`: if `isDirty` → bulk-PATCH sections → PATCH `/library/:outputId` with `{status: "draft"}` → call `onApproved(generation.id)` (which removes from the Generator list).

The modal's new behavior will mirror this.

## Design

### 1. New optional prop on `ContentPreviewModal`

```ts
/** When provided, "Save Changes" on a still-`generated` item also promotes
 *  it to `draft` and calls this callback so the parent can remove it from
 *  its list. Used by the Content Generator, not the Library. */
onSent?: (itemId: string) => void;
```

The presence of `onSent` **and** `item.status === "generated"` together define "Generator context". Name the derived flag `isGeneratorContext`.

### 2. Extract `persistSectionEdits` helper

The section-persistence logic currently inside `handleSaveSections` (the two for-loops that PATCH existing edits and POST new sections, then reconcile `localSections`) moves into a private async helper so both save-only and save-and-send paths share it without duplication. `handleSaveSections` becomes a thin wrapper that calls the helper then toasts "Changes saved".

### 3. New handler `handleSaveAndSend`

```ts
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

No toast on success — `onSent` callback is the success signal (parent shows its own "Sent to Library" toast).

### 4. Branched button

```tsx
const isGeneratorContext = !!onSent && item.status === "generated";

<button
  type="button"
  onClick={isGeneratorContext ? handleSaveAndSend : handleSaveSections}
  disabled={
    savingSections ||
    (!isGeneratorContext && !isDirty)
  }
  className={/* green for Generator, indigo for Library — see visual */}
>
  {savingSections
    ? (isGeneratorContext ? "Sending..." : "Saving...")
    : isGeneratorContext
      ? (isDirty ? "Save & Send to Library" : "Send to Library")
      : "Save Changes"}
</button>
```

| Context | isDirty | Label | Enabled |
|---|---|---|---|
| Generator | no | "Send to Library" | yes |
| Generator | yes | "Save & Send to Library" | yes |
| Library | no | "Save Changes" | no |
| Library | yes | "Save Changes" | yes |

Button color: keep current indigo styling for Library; use `bg-green-600 hover:bg-green-700` for Generator to match the row button visually (confirms to the user that this is the "approve" action).

### 5. Hide the status footer in Generator context

Wrap the existing status footer block (lines 514-547) in `{!isGeneratorContext && (...)}`. A `"generated"` item has no meaningful status the dropdown can transition to, and the send action is the gate — exposing the dropdown would let the user set `"approved"` directly, bypassing the `"draft"` entry point the Library approval flow expects.

### 6. Wire up GeneratePage

[GeneratePage.tsx:1191-1200](frontend/src/pages/GeneratePage.tsx#L1191-L1200) gains:

```tsx
onSent={(id) => {
  handleGenerationApproved(id);
  setPreviewItem(null);
}}
```

`handleGenerationApproved` at line 482 already removes the item from the `generations` array and shows the "Sent to Library as Draft" toast. `setPreviewItem(null)` closes the modal; this overlaps with `onClose` fired inside `handleSaveAndSend`, which is fine — idempotent.

`LibraryPage` is untouched. Without `onSent`, `isGeneratorContext` stays `false`, modal keeps today's behavior.

## Data flow

```
User clicks row in Generator → GeneratePage.handleViewGeneration opens modal
  → Modal renders, item.status = "generated"
  → Modal detects isGeneratorContext (onSent present + status match)
  → Button label flips to "Save & Send to Library" / "Send to Library"
User edits scene voiceover → editedSections grows → isDirty = true
User clicks button
  → handleSaveAndSend
      → persistSectionEdits() [if dirty]
      → PATCH /library/:id { status: "draft" }
      → onSent(item.id) — parent removes from generations list + toast
      → onClose() — modal closes
```

## Testing

Manual matrix (no frontend tests for this modal exist; no backend change, so no new backend tests). After deploy:

1. **Video, edited, from Generator** → button reads "Save & Send to Library" → click → edits persist, item vanishes from Generator, appears in Library as draft, modal closes, toast shows.
2. **Video, untouched, from Generator** → button reads "Send to Library" → click → no edit PATCH in network log, status PATCH fires, moved to Library.
3. **Single image, from Generator** → same flow as #1 and #2 — confirms not type-specific.
4. **Library item (any status), edited** → button reads "Save Changes" → click → edits persist, status unchanged, modal stays open, status dropdown still visible at footer.
5. **Library item, untouched** → button disabled (today's behavior).
6. **Race sanity** — click "Save & Send to Library" twice quickly → button disables after first click via `savingSections`, double-submit blocked.

## Risks

- **Double-source-of-truth for "send to library".** Users can now send via (a) the row's green button or (b) the modal's button. If one is bugged and the other works, support confusion. Mitigation: both call functionally equivalent code paths (PATCH sections + PATCH status + parent callback). Any bug will affect both equally.
- **`onClose` firing twice.** `handleSaveAndSend` calls `onClose()`, parent's `onSent` callback also resets `setPreviewItem(null)`. Harmless but technically redundant. Acceptable — the redundancy is defensive against either side forgetting.
- **Hiding the status dropdown is a visible regression for Generator-opened items.** Today an approver could in theory use it to skip the draft step. In practice the dropdown options don't include "generated" so the UI is broken anyway. The new behavior is strictly clearer.

## Out of scope

- Toast copy tuning. `handleGenerationApproved`'s existing toast ("Sent to Library as Draft — review it there to approve or reject.") already works.
- Adding a "Reject" action inside the modal for Generator items. If the user opens a video to review and doesn't like it, they close the modal and use the row's ✕ icon — unchanged.
- Any change to the Library approval flow (draft → in_review → approved/rejected).
- Auto-approving the item past draft (e.g. directly to in_review). We keep draft as the intended entry into Library so existing approvers workflow is undisturbed.
