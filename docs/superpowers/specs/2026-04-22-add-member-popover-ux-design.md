# Add Member popover — position + searchable user field

**Date:** 2026-04-22
**Status:** Approved

## Problem

In the Manage Project modal, clicking "Add member" reveals the Add Member popover **below** the existing members list. With 10+ members the popover scrolls off-screen and users miss it. Inside the popover, the User field is a plain `<select>` dropdown, so searching requires manually scanning every option.

## Change

Two localized edits to `frontend/src/components/workspace-settings/ProjectMembersPanel.tsx`:

1. **Render the `AddMemberPopover` above the members list** instead of below it. No state change — just JSX order swap.
2. **Replace the `<select>` inside the popover with `<SearchableSelect>`**. Map candidates to `{ value: userId, label: fullName || email, sublabel: fullName ? email : undefined }`. `SearchableSelect` already filters by both `label` and `sublabel` (case-insensitive), so typing a name or email substring surfaces matches instantly.

## Non-goals

- No change to Approver checkbox, menu chips, or existing member rows.
- No change to the members list layout.
- No backend change.
- Don't hide the members list while adding — keep it visible below for context.

## Files touched

- `frontend/src/components/workspace-settings/ProjectMembersPanel.tsx` (one file, two edits).
