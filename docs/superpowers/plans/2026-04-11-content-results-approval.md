# Content Results Overview, Editing & Approval Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add expandable rows with editable content preview (hook, visual direction, caption) to the GeneratePage, implement two-step approval workflow (approve → Content Library, reject → stays), and add edit toggle to Content Library preview modal.

**Architecture:** Backend gets a status filter on the library list endpoint. Frontend gets a new `GenerationResultRow` component for expandable/editable rows, and the existing `ContentPreviewModal` gains an edit toggle mode. The library page filters to approved-only and handles status changes that remove items.

**Tech Stack:** TypeScript, Hono, Prisma 7, React 19, Tailwind CSS 4

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `backend/src/interfaces/repositories/generation.repository.interface.ts` | Add `status?` param to `findOutputsByWorkspace` |
| Modify | `backend/src/repositories/generation.repository.ts` | Implement status filter |
| Modify | `backend/src/interfaces/services/library.service.interface.ts` | Add `status?` param to `list` |
| Modify | `backend/src/services/library.service.ts` | Pass status filter through |
| Modify | `backend/src/routes/library.route.ts` | Read `status` query param, add bulk sections update endpoint |
| Create | `frontend/src/components/generation/GenerationResultRow.tsx` | Expandable row with editable hook/visual direction/caption, approve/reject/save |
| Modify | `frontend/src/pages/GeneratePage.tsx` | Replace table rows with `GenerationResultRow`, handle approved removal |
| Modify | `frontend/src/components/library/ContentPreviewModal.tsx` | Add edit toggle, editable fields, save |
| Modify | `frontend/src/pages/LibraryPage.tsx` | Filter to approved, handle status change removal |

---

### Task 1: Backend — Add Status Filter to Library List

**Files:**
- Modify: `backend/src/interfaces/repositories/generation.repository.interface.ts:23-25`
- Modify: `backend/src/repositories/generation.repository.ts:58-76`
- Modify: `backend/src/interfaces/services/library.service.interface.ts:4`
- Modify: `backend/src/services/library.service.ts:14-16`
- Modify: `backend/src/routes/library.route.ts:15-19`

- [ ] **Step 1: Update generation repository interface**

In `backend/src/interfaces/repositories/generation.repository.interface.ts`, change line 23-25 from:

```typescript
findOutputsByWorkspace(
    workspaceId: string,
): Promise<(GenerationOutput & { request: GenerationRequest })[]>;
```

To:

```typescript
findOutputsByWorkspace(
    workspaceId: string,
    status?: string,
): Promise<(GenerationOutput & { request: GenerationRequest })[]>;
```

- [ ] **Step 2: Update generation repository implementation**

In `backend/src/repositories/generation.repository.ts`, update `findOutputsByWorkspace` to accept and use the status filter. Change the method to:

```typescript
async findOutputsByWorkspace(workspaceId: string, status?: string) {
    const requestIds = await this.prisma.generationRequest.findMany({
        where: { workspaceId },
        select: { id: true },
    });

    if (requestIds.length === 0) return [];

    return this.prisma.generationOutput.findMany({
        where: {
            requestId: { in: requestIds.map((r) => r.id) },
            ...(status ? { status } : {}),
        },
        include: {
            request: {
                include: {
                    brand: { select: { id: true, name: true } },
                    product: { select: { id: true, name: true } },
                },
            },
            sections: { orderBy: { sectionOrder: "asc" } },
        },
        orderBy: { createdAt: "desc" },
    });
}
```

- [ ] **Step 3: Update library service interface**

In `backend/src/interfaces/services/library.service.interface.ts`, change:

```typescript
list(workspaceId: string): Promise<any[]>;
```

To:

```typescript
list(workspaceId: string, status?: string): Promise<any[]>;
```

- [ ] **Step 4: Update library service implementation**

In `backend/src/services/library.service.ts`, change `list` method:

```typescript
async list(workspaceId: string, status?: string): Promise<any[]> {
    return this.generationRepository.findOutputsByWorkspace(workspaceId, status);
}
```

- [ ] **Step 5: Update library route to read status query param**

In `backend/src/routes/library.route.ts`, change the GET `/` handler:

```typescript
app.get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const status = c.req.query("status") || undefined;
    const outputs = await libraryService.list(workspaceId, status);
    return c.json({ data: outputs });
});
```

- [ ] **Step 6: Add bulk sections update endpoint**

In `backend/src/routes/library.route.ts`, add before the `return app;` line:

```typescript
// PATCH /:id/sections/bulk — bulk update section texts
app.patch("/:id/sections/bulk", async (c) => {
    const userId = c.get("userId");
    const body = await c.req.json();
    const { sections } = body;
    if (!Array.isArray(sections) || sections.length === 0) {
        return c.json({ error: "sections must be a non-empty array" }, 400);
    }
    const results = [];
    for (const s of sections) {
        if (!s.id || !s.contentText) continue;
        const updated = await libraryService.updateSection(s.id, s.contentText, userId);
        results.push(updated);
    }
    return c.json({ data: results });
});
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/repositories/generation.repository.interface.ts \
  backend/src/repositories/generation.repository.ts \
  backend/src/interfaces/services/library.service.interface.ts \
  backend/src/services/library.service.ts \
  backend/src/routes/library.route.ts
git commit -m "feat: add status filter to library list and bulk sections update endpoint"
```

---

### Task 2: Frontend — Create GenerationResultRow Component

**Files:**
- Create: `frontend/src/components/generation/GenerationResultRow.tsx`

- [ ] **Step 1: Create the component file**

Create `frontend/src/components/generation/GenerationResultRow.tsx`:

```tsx
import { useState } from "react";
import { ChevronRight, ChevronDown, Eye, Check, X, Save, Loader2 } from "lucide-react";
import { api } from "../../services/api";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface Generation {
  id: string;
  status: string;
  platform: string;
  contentType: string;
  createdAt: string;
  brand?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
}

interface GenerationResultRowProps {
  generation: Generation;
  workspaceId: string;
  onApproved: (id: string) => void;
  onViewFull: (generation: Generation) => void;
  getPlatformStyle: (platform: string) => { bg: string; text: string };
  getStatusStyle: (status: string) => string;
  getStatusDot: (status: string) => string;
  formatRelativeDate: (date: string) => string;
}

export function GenerationResultRow({
  generation,
  workspaceId,
  onApproved,
  onViewFull,
  getPlatformStyle,
  getStatusStyle,
  getStatusDot,
  formatRelativeDate,
}: GenerationResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [outputId, setOutputId] = useState<string | null>(null);

  const isDirty = Object.keys(editedSections).length > 0;

  const fetchSections = async () => {
    if (sections !== null) return; // already cached
    setLoading(true);
    try {
      const res = await api<{
        data: {
          outputs: Array<{
            id: string;
            sections: Section[];
          }>;
        };
      }>(`/api/workspaces/${workspaceId}/generations/${generation.id}`);
      const data = (res as any).data ?? res;
      const output = data.outputs?.[0];
      if (output) {
        setOutputId(output.id);
        setSections(output.sections ?? []);
      } else {
        setSections([]);
      }
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      fetchSections();
    }
    setExpanded(!expanded);
  };

  const getSectionText = (type: string): string => {
    if (!sections) return "";
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return "";
    return editedSections[section.id] ?? section.contentText;
  };

  const handleFieldChange = (type: string, value: string) => {
    if (!sections) return;
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return;
    if (value === section.contentText) {
      // Revert to original — remove from edited
      setEditedSections((prev) => {
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
    } else {
      setEditedSections((prev) => ({ ...prev, [section.id]: value }));
    }
  };

  const handleSave = async () => {
    if (!outputId || !isDirty) return;
    setSaving(true);
    try {
      const updates = Object.entries(editedSections).map(([id, contentText]) => ({
        id,
        contentText,
      }));
      await api(`/api/workspaces/${workspaceId}/library/${outputId}/sections/bulk`, {
        method: "PATCH",
        body: JSON.stringify({ sections: updates }),
      });
      // Update cached sections with saved values
      setSections((prev) =>
        prev
          ? prev.map((s) =>
              editedSections[s.id] !== undefined
                ? { ...s, contentText: editedSections[s.id] }
                : s
            )
          : prev
      );
      setEditedSections({});
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!outputId) return;
    setStatusUpdating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (newStatus === "approved") {
        onApproved(generation.id);
      }
    } catch {
      // silently fail
    } finally {
      setStatusUpdating(false);
    }
  };

  const ps = getPlatformStyle(generation.platform);

  return (
    <>
      {/* Main row */}
      <tr
        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
        onClick={handleToggle}
      >
        <td className="px-4 py-2.5 w-8">
          {expanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
        </td>
        <td className="px-4 py-2.5">
          <p className="text-sm text-gray-800">{generation.brand?.name ?? "—"}</p>
          {generation.product?.name && (
            <p className="text-xs text-gray-400">{generation.product.name}</p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${ps.bg} ${ps.text}`}
          >
            {generation.platform}
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700 capitalize">
          {generation.contentType?.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusStyle(generation.status)}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(generation.status)}`} />
            {generation.status}
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatRelativeDate(generation.createdAt)}
          </p>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {generation.status === "completed" && (
              <>
                <button
                  type="button"
                  onClick={() => onViewFull(generation)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-md hover:bg-indigo-50"
                  title="View full preview"
                >
                  <Eye size={14} />
                </button>
                {outputId && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("approved")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-md hover:bg-green-50"
                      title="Approve — move to library"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("rejected")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
                      title="Reject"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded content */}
      {expanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50/50">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : sections && sections.length > 0 ? (
              <div className="space-y-3 max-w-2xl">
                {/* Hook / Copy in Visual */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Copy in Visual (Hook)
                  </label>
                  <input
                    type="text"
                    value={getSectionText("hook")}
                    onChange={(e) => handleFieldChange("hook", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    placeholder="No hook generated"
                  />
                </div>

                {/* Visual Direction */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Visual Direction
                  </label>
                  <textarea
                    value={getSectionText("visual_direction")}
                    onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No visual direction generated"
                  />
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Caption
                  </label>
                  <textarea
                    value={getSectionText("caption")}
                    onChange={(e) => handleFieldChange("caption", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No caption generated"
                  />
                </div>

                {/* Save button */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isDirty
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {saving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  {isDirty && (
                    <span className="text-[10px] text-amber-500">Unsaved changes</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No content sections available. Content may still be processing.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/generation/GenerationResultRow.tsx
git commit -m "feat: create GenerationResultRow component with expandable editable content"
```

---

### Task 3: Frontend — Update GeneratePage to Use GenerationResultRow

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx:870-928`

- [ ] **Step 1: Add import for GenerationResultRow**

At the top of `frontend/src/pages/GeneratePage.tsx`, add:

```typescript
import { GenerationResultRow } from "../components/generation/GenerationResultRow";
```

- [ ] **Step 2: Add handler to remove approved generations from list**

After the existing `handleViewGeneration` function, add:

```typescript
const handleGenerationApproved = (genId: string) => {
    setGenerations((prev) => prev.filter((g) => g.id !== genId));
    showToast("Content approved and moved to library", "success");
};
```

- [ ] **Step 3: Add a chevron column header and replace table body rows**

Replace the table `<thead>` (lines 876-882) with:

```tsx
<thead>
    <tr className="border-b border-gray-100 bg-gray-50">
        <th className="px-4 py-2.5 w-8" />
        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</th>
        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Platform</th>
        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Format</th>
        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
        <th className="px-4 py-2.5" />
    </tr>
</thead>
```

Replace the table `<tbody>` content (lines 884-924) with:

```tsx
<tbody>
    {generations.map((gen) => (
        <GenerationResultRow
            key={gen.id}
            generation={gen}
            workspaceId={activeWorkspace!.id}
            onApproved={handleGenerationApproved}
            onViewFull={handleViewGeneration}
            getPlatformStyle={getPlatformStyle}
            getStatusStyle={getStatusStyle}
            getStatusDot={getStatusDot}
            formatRelativeDate={formatRelativeDate}
        />
    ))}
</tbody>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/GeneratePage.tsx
git commit -m "feat: use GenerationResultRow for expandable content preview on GeneratePage"
```

---

### Task 4: Frontend — Add Edit Toggle to ContentPreviewModal

**Files:**
- Modify: `frontend/src/components/library/ContentPreviewModal.tsx`

- [ ] **Step 1: Add edit state and section editing logic**

Add new state after the existing state declarations (after line 50):

```typescript
const [editMode, setEditMode] = useState(false);
const [editedSections, setEditedSections] = useState<Record<string, string>>({});
const [savingSections, setSavingSections] = useState(false);

const isDirty = Object.keys(editedSections).length > 0;

const getSectionText = (type: string): string => {
    const section = item.sections.find((s) => s.sectionType === type);
    if (!section) return "";
    return editedSections[section.id] ?? section.contentText;
};

const handleFieldChange = (type: string, value: string) => {
    const section = item.sections.find((s) => s.sectionType === type);
    if (!section) return;
    if (value === section.contentText) {
        setEditedSections((prev) => {
            const next = { ...prev };
            delete next[section.id];
            return next;
        });
    } else {
        setEditedSections((prev) => ({ ...prev, [section.id]: value }));
    }
};

const handleSaveSections = async () => {
    setSavingSections(true);
    try {
        for (const [id, contentText] of Object.entries(editedSections)) {
            await api(`/api/workspaces/${workspaceId}/library/${item.id}/sections/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ contentText }),
            });
        }
        setEditedSections({});
        onToast("Changes saved", "success");
    } catch (e) {
        onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
        setSavingSections(false);
    }
};
```

- [ ] **Step 2: Add edit toggle to the modal header**

In the header section (after the Copy All button, before the close button), add:

```tsx
<button
    type="button"
    onClick={() => setEditMode(!editMode)}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
        editMode
            ? "bg-indigo-600 text-white"
            : "text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"
    }`}
>
    {editMode ? "Editing" : "Edit"}
</button>
```

- [ ] **Step 3: Add editable fields view when edit mode is on**

Replace the preview body section (lines 146-156) with:

```tsx
{/* Preview body */}
<div className="flex-1 overflow-y-auto px-5 pb-4">
    {editMode ? (
        <div className="space-y-4 py-2">
            <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Copy in Visual (Hook)
                </label>
                <input
                    type="text"
                    value={getSectionText("hook")}
                    onChange={(e) => handleFieldChange("hook", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    placeholder="No hook"
                />
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Visual Direction
                </label>
                <textarea
                    value={getSectionText("visual_direction")}
                    onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No visual direction"
                />
            </div>

            <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Caption
                </label>
                <textarea
                    value={getSectionText("caption")}
                    onChange={(e) => handleFieldChange("caption", e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No caption"
                />
            </div>

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
        </div>
    ) : (
        <PreviewComponent
            content={item.content}
            sections={item.sections}
            brandName={brandName}
            productName={productName ?? undefined}
            contentTitle={item.contentTitle ?? undefined}
            contentType={item.request.contentType}
            platform={item.request.platform}
        />
    )}
</div>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/library/ContentPreviewModal.tsx
git commit -m "feat: add edit toggle with editable hook/visual direction/caption to ContentPreviewModal"
```

---

### Task 5: Frontend — Update LibraryPage for Approved-Only Filter

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx`

- [ ] **Step 1: Update the API call to filter by approved status**

In `frontend/src/pages/LibraryPage.tsx`, change the `loadItems` function (around line 131):

From:
```typescript
const data = await api<LibraryItem[]>(`/api/workspaces/${activeWorkspace.id}/library`);
```

To:
```typescript
const data = await api<LibraryItem[]>(`/api/workspaces/${activeWorkspace.id}/library?status=approved`);
```

- [ ] **Step 2: Update handleStatusChange to remove non-approved items**

Replace the existing `handleStatusChange` function (around line 144) with:

```typescript
const handleStatusChange = (id: string, status: string) => {
    if (status === "approved") {
        // Still approved — just update in place
        setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    } else {
        // Changed to draft or rejected — remove from library
        setItems((prev) => prev.filter((item) => item.id !== id));
        showToast(
            status === "draft"
                ? "Content moved back to drafts on Content Generator"
                : "Content rejected and moved back to Content Generator",
            "info",
        );
    }
};
```

- [ ] **Step 3: Update page title/description**

Update the page header description to clarify that only approved content appears:

Find the subtitle text (likely something like "Your database of generated social media content") and change to:

```
Approved content ready for publishing. Manage and preview your finalized posts.
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LibraryPage.tsx
git commit -m "feat: filter content library to approved-only with status change removal"
```

---

### Task 6: Verification — Build and Test

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `cd backend && bun test`
Expected: All tests pass (no new tests needed — changes are to query filters and a new route, covered by existing integration patterns).

- [ ] **Step 2: Run frontend build**

Run: `cd frontend && npm run build`
Expected: TypeScript check passes and production build succeeds.

- [ ] **Step 3: Run Biome format**

Run: `cd backend && bunx biome check --write .`
Expected: All files formatted.

- [ ] **Step 4: Final commit if formatting changes**

```bash
git add -A
git commit -m "chore: format and lint"
```
