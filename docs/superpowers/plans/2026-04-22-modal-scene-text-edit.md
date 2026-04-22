# Modal Scene/Slide/Frame Text Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the Content Library preview modal's Edit mode, let users edit the text fields of each scene / slide / frame (voiceover, visualDirection, headline, body, textOverlay, etc.) — not just the images.

**Architecture:** Single-file frontend change in `ContentPreviewModal.tsx`. Add a `handleJsonFieldChange` helper that writes per-field JSON edits into the existing `editedSections` map, fix `getJsonField` to read from that map first, and rewrite the three Edit-mode section blocks (slides / frames / scenes) to render cards with the existing image cell plus editable textareas for the type-specific fields. The save flow (`persistSectionEdits`, "Save Changes" button) already handles `editedSections` — no downstream changes.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4. Frontend-only, no backend work, no schema changes.

---

## File Structure

Files to modify:
- `frontend/src/components/library/ContentPreviewModal.tsx` — fix one helper, add one helper, rewrite three blocks in Edit mode.

No new files. No backend changes.

---

## Task 1: Fix `getJsonField` + add `handleJsonFieldChange` helper

Behavior-preserving refactor + new helper. No UI rendering change yet.

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx` — the `getJsonField` helper (around line 99), add a new sibling helper below.

- [ ] **Step 1: Update `getJsonField` to honor `editedSections`**

Find the existing helper (around line 99):

```typescript
	const getJsonField = (_sectionId: string, contentText: string, field: string): string => {
		try {
			const data = JSON.parse(contentText);
			return (data[field] as string) ?? "";
		} catch {
			return "";
		}
	};
```

Replace with:

```typescript
	const getJsonField = (sectionId: string, contentText: string, field: string): string => {
		try {
			const source = editedSections[sectionId] ?? contentText;
			const data = JSON.parse(source);
			return (data[field] as string) ?? "";
		} catch {
			return "";
		}
	};
```

The `_sectionId` becomes a real parameter. This is backward-compatible — every existing caller already passes the sectionId, the helper was just ignoring it.

- [ ] **Step 2: Add `handleJsonFieldChange` helper right below `getJsonField`**

Immediately after the `getJsonField` function, insert:

```typescript
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

Match the tab indentation of the surrounding code.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit/frontend && bunx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0, no output.

- [ ] **Step 4: Build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit/frontend && bun run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit && git add frontend/src/components/library/ContentPreviewModal.tsx && git commit -m "refactor(content-modal): getJsonField honors edits + add handleJsonFieldChange"
```

---

## Task 2: Rewrite the Slides / Frames / Scenes blocks in Edit mode

Replaces the current image-only grids with card rows that include editable text fields for the type-specific fields.

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx` — the slides block (around line 443), frames (around line 470), scenes (around line 498). All inside the `editMode` branch.

- [ ] **Step 1: Replace the Slides block**

Find the slides block (starts with the comment `{/* Slides — carousel, carousel_post, carousel_ad, tiktok_carousel, thread */}`, around line 443). Replace the entire `{slideSections.length > 0 && ( ... )}` block with:

```tsx
                {/* Slides — carousel, carousel_post, carousel_ad, tiktok_carousel, thread */}
                {slideSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Slides ({slideSections.length})
                    </label>
                    {slideSections.map((slide) => {
                      const num = getJsonField(slide.id, slide.contentText, "slideNumber");
                      const url = getJsonField(slide.id, slide.contentText, "referenceImageUrl");
                      return (
                        <div key={slide.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-32 shrink-0">
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">
                              Slide {num}
                            </p>
                            <SectionImageCell
                              sectionId={slide.id}
                              imageUrl={url}
                              label={`Slide ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="1/1"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Headline</label>
                              <input
                                type="text"
                                value={getJsonField(slide.id, slide.contentText, "headline")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "headline", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Body</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "body")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "body", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "visualDirection")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "visualDirection", e.target.value)
                                }
                                rows={1}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
```

- [ ] **Step 2: Replace the Frames block**

Find the frames block (starts with `{/* Frames — story_image, story_video, facebook story */}`, around line 470). Replace with:

```tsx
                {/* Frames — story_image, story_video, facebook story */}
                {frameSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Frames ({frameSections.length})
                    </label>
                    {frameSections.map((frame) => {
                      const num = getJsonField(frame.id, frame.contentText, "frameNumber");
                      const url = getJsonField(frame.id, frame.contentText, "referenceImageUrl");
                      return (
                        <div key={frame.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-28 shrink-0">
                            <p className="text-[10px] font-semibold text-purple-500 uppercase mb-1">
                              Frame {num}
                            </p>
                            <SectionImageCell
                              sectionId={frame.id}
                              imageUrl={url}
                              label={`Frame ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="9/16"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual</label>
                              <textarea
                                value={getJsonField(frame.id, frame.contentText, "visual")}
                                onChange={(e) =>
                                  handleJsonFieldChange(frame.id, frame.contentText, "visual", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Text Overlay</label>
                              <input
                                type="text"
                                value={getJsonField(frame.id, frame.contentText, "textOverlay")}
                                onChange={(e) =>
                                  handleJsonFieldChange(frame.id, frame.contentText, "textOverlay", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
```

- [ ] **Step 3: Replace the Scenes block**

Find the scenes block (starts with `{/* Scenes — all video content types */}`, around line 498). Replace with:

```tsx
                {/* Scenes — all video content types */}
                {sceneSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Scenes ({sceneSections.length})
                    </label>
                    {sceneSections.map((scene) => {
                      const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
                      const url = getJsonField(scene.id, scene.contentText, "referenceImageUrl");
                      return (
                        <div key={scene.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-40 shrink-0">
                            <p className="text-[10px] font-semibold text-red-500 uppercase mb-1">
                              Scene {num}
                            </p>
                            <SectionImageCell
                              sectionId={scene.id}
                              imageUrl={url}
                              label={`Scene ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="16/9"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Time Range</label>
                              <input
                                type="text"
                                value={getJsonField(scene.id, scene.contentText, "timeRange")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "timeRange", e.target.value)
                                }
                                placeholder="00:00 – 00:03"
                                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "visualDirection")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "visualDirection", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Voiceover</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "voiceover")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "voiceover", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">On-Screen Text</label>
                              <input
                                type="text"
                                value={getJsonField(scene.id, scene.contentText, "onScreenText")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "onScreenText", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit/frontend && bunx tsc --noEmit 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 5: Build**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit/frontend && bun run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce/.claude/worktrees/modal-scene-text-edit && git add frontend/src/components/library/ContentPreviewModal.tsx && git commit -m "feat(content-modal): editable text fields for scenes, slides, frames"
```

---

## Task 3: Manual QA matrix

- [ ] **Step 1: Run the app against main** (no need to spin up worktree servers — same file, HMR covers it). Verify:

1. Video in Library → Edit → scene cards show Time Range, Visual Direction, Voiceover, On-Screen Text textareas per scene → type in one → "Save Changes" enables → save → reopen → edits persisted.
2. Carousel in Library → Edit → slide cards show Headline (input), Body (textarea), Visual Direction (textarea) → edit one → save → reopen → persisted.
3. Story in Library → Edit → frame cards show Visual (textarea), Text Overlay (input) → edit → save → persisted.
4. Single-image in Library → Edit → unchanged behavior (hook/caption/cta/hashtags still editable).
5. Any type → Edit → view mode switch → preview renders as today (no editing in view mode).
6. Any type → Edit → change a field, then manually revert to the exact original value → "Save Changes" goes back to disabled (isDirty clears via the `handleJsonFieldChange` revert branch).

- [ ] **Step 2: If any case fails, fix with a targeted commit**

---

## Self-review notes

- **Spec coverage:** three blocks (slides/frames/scenes) each gets its own step. The two helpers land in Task 1. The save flow leverages existing `persistSectionEdits` — no changes needed to save logic.
- **Placeholder scan:** all code blocks show the literal JSX. No TODOs.
- **Type consistency:** `handleJsonFieldChange(sectionId, contentText, field, value)` signature used identically in all three blocks. `getJsonField(sectionId, contentText, field)` matches the existing callsites.
- **Atomicity:** Task 1 is behavior-preserving (helpers exist but aren't called from new UI). Task 2 flips the UI. Each commit compiles and the app remains usable.
