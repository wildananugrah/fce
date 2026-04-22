# Content Preview modal — editable text for scenes, slides, frames

**Date:** 2026-04-22
**Status:** Approved for planning

## Problem

In the Content Library preview modal's Edit mode, users can already edit top-level text (hook, caption, cta, hashtags) and regenerate images on scenes/slides/frames — but they can't edit the **text content** of those multi-part items (voiceover, visualDirection, on-screen text, slide body, frame overlay, etc.). A user viewing a Reel in Library sees the scene scripts in view mode but has no way to tweak them.

## Goal

In Edit mode, render editable textareas for every scene / slide / frame alongside the existing image controls. Save flow is unchanged — any edits flow through the existing `editedSections` + `persistSectionEdits` pipeline.

## Non-goals

- No backend work. Section `contentText` is already a JSON blob; PATCHing is already supported.
- No change to view (preview) mode.
- No change to the Content Generator's scene editor (`VisualScriptTable` or the inline non-video cards).
- No scene/slide/frame reordering, adding, or deleting.

## Design

### Editable fields per type

| Type | Fields |
|---|---|
| Scene | `timeRange`, `visualDirection`, `voiceover`, `onScreenText` |
| Slide | `headline`, `body`, `visualDirection` |
| Frame | `visual`, `textOverlay` |

### Two helper functions

Inside `ContentPreviewModal.tsx`:

```ts
// Update existing helper to honor edits (currently ignores sectionId).
const getJsonField = (sectionId: string, contentText: string, field: string): string => {
  try {
    const source = editedSections[sectionId] ?? contentText;
    const data = JSON.parse(source);
    return (data[field] as string) ?? "";
  } catch {
    return "";
  }
};

// New helper — writes field edits into editedSections.
const handleJsonFieldChange = (
  sectionId: string,
  contentText: string,
  field: string,
  value: string,
) => {
  try {
    const current = editedSections[sectionId] ?? contentText;
    const data = JSON.parse(current);
    const nextText = JSON.stringify({ ...data, [field]: value });
    if (nextText === contentText) {
      setEditedSections((prev) => {
        const { [sectionId]: _removed, ...rest } = prev;
        return rest;
      });
    } else {
      setEditedSections((prev) => ({ ...prev, [sectionId]: nextText }));
    }
  } catch {
    /* malformed JSON → no-op */
  }
};
```

### Card layout (stacked list, full width)

Each item rendered as:

```
Scene N · <timeRange>
[image thumbnail]  [editable fields column]
```

Replaces the current `grid-cols-3` (slides/scenes) and `grid-cols-4` (frames) compact image grids. One card per item.

### Save flow unchanged

`editedSections`, `isDirty`, `persistSectionEdits`, and the "Save Changes" button already handle arbitrary `sectionId → newContentText` maps. The new handler writes to the same map, so nothing downstream changes.

## Risks

- Old rows with malformed JSON `contentText` won't render edits; helpers catch the parse error and no-op. Not worth a migration; affects rare pre-this-feature content only.
- Layouts at 12+ items in a single card list scroll in the modal body — acceptable at current scales.

## Files touched

- `frontend/src/components/library/ContentPreviewModal.tsx` — the three grid blocks in Edit mode + two helpers.
