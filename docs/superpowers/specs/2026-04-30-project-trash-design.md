# Project Soft-Delete via Trash — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend / DB

## Problem

Today `DELETE /api/workspaces/:wid/projects/:pid` already does a soft-delete (sets `archivedAt`). But the Trash UI ([backend/src/routes/trash.route.ts](../../../backend/src/routes/trash.route.ts), [frontend/src/components/workspace-settings/TrashTab.tsx](../../../frontend/src/components/workspace-settings/TrashTab.tsx)) only handles `brand | product | topic | content`. A "deleted" project disappears from the project switcher but is invisible in Trash — the user can't restore it, can't permanent-delete it, and the hourly `ArchiveSweepJob` doesn't sweep it. Effectively projects are stuck in limbo after archiving.

A second issue: the project-required-for-brand work (yesterday) made `Brand.projectId` non-null with `onDelete: Restrict`. As a side effect, the user can archive a project that contains a live brand — leaving the brand live but pointing at an archived project. Brand list filters don't account for this, so the brand stays visible. That's broken state.

This spec brings projects into the same soft-delete + Trash flow as brands/products/topics/content, and fixes the cascade behavior so a project's brand follows the project through every lifecycle event (archive → restore → permanent-delete).

## Goals

- Archived projects show up in Trash, can be restored, can be permanent-deleted.
- Cascade: archiving a project also archives its brand. Restoring restores the brand. Permanent-delete cascade-deletes the brand and everything under it (products, topics, content, brain versions) via existing FK constraints.
- The hourly sweeper hard-deletes archived projects past the TTL, same as brands.
- The Trash row for a project subsumes its brand — no duplicate rows for the cascaded children.
- The Default project remains un-archivable (existing rule, unchanged).

## Non-Goals

- Restoring a project that was permanently deleted by the sweeper (it's gone — Trash entries past TTL no longer exist).
- Trashing project memberships individually (memberships cascade with the project; users don't trash them directly).
- A new "Trash" affordance directly on the project list page (the existing Workspace Settings → Trash tab is the single Trash UI).

## Schema Change

Revert yesterday's `onDelete: Restrict` on `Brand.projectId` back to `Cascade`. The Trash gate now provides the safety: hard-delete only happens when the user explicitly clicks "Delete forever" from the Trash UI; no stray code path can trip an accidental cascade.

```diff
 model Brand {
   ...
-  project            Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
+  project            Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
   ...
 }
```

All other Project children (`UserProjectMembership`, `AnalysisConfig`, `CompetitorPipelineRun`, `Creator`) are already `onDelete: Cascade`. With this change, deleting a project row cleanly cascades through the entire subtree.

## Backend Changes

### Project archive endpoint ([project.route.ts:222-250](../../../backend/src/routes/project.route.ts#L222-L250))

Cascade-archive the brand inside the same transaction. Products / topics / content stay untouched at the row level — they auto-hide via the existing `archivedAt` join filters once the brand is archived (matching the existing brand→product collapse pattern).

```ts
app.delete("/:projectId", requireWorkspaceAdmin(), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const projectId = c.req.param("projectId");
    const existing = await prisma.project.findUnique({
        where: { id: projectId },
        select: { workspaceId: true, slug: true, name: true },
    });
    if (!existing || existing.workspaceId !== workspaceId) {
        return c.json({ error: "Project not found" }, 404);
    }
    if (existing.slug === "default") {
        return c.json({ error: "The Default project cannot be archived" }, 400);
    }
    const now = new Date();
    await prisma.$transaction([
        prisma.project.update({ where: { id: projectId }, data: { archivedAt: now } }),
        prisma.brand.updateMany({
            where: { projectId, archivedAt: null },
            data: { archivedAt: now },
        }),
    ]);
    await auditService.log({
        workspaceId,
        userId,
        action: "project.archive",
        entityType: "project",
        entityId: projectId,
        metadata: { name: existing.name },
    });
    return c.body(null, 204);
});
```

### TrashService ([trash.service.ts](../../../backend/src/services/trash.service.ts))

- Add `"project"` to `TrashItemType`.
- Add `prisma: PrismaClient` to the constructor and use it directly for the project query — no `IProjectRepository` exists today and creating one for a single-method use is overkill. Existing four repos stay injected as-is.
- Fetch archived projects via `prisma.project.findMany({ where: { workspaceId, archivedAt: { not: null } } })`.
- Append project items to the `list()` aggregator.
- **Collapse rule**: a brand whose `projectId` points to an archived project is hidden from the Trash list — the project row subsumes it. This matches the existing rule for brand→product. Implementation: when iterating archived brands, skip any whose project (looked up cheaply via the workspace's archived-project set already in scope) is also archived.

```ts
export type TrashItemType = "brand" | "product" | "topic" | "content" | "project";
```

The aggregator iteration order doesn't matter; existing code already sorts by `archivedAt` desc at the end.

The composition root ([backend/src/index.ts](../../../backend/src/index.ts)) needs to pass `prisma` as the new first argument to `new TrashService(...)`.

### Trash routes ([trash.route.ts](../../../backend/src/routes/trash.route.ts))

Add `case "project":` to both the restore and permanent-delete switch statements:

```ts
// In the restore handler
case "project": {
    await prisma.$transaction([
        prisma.project.update({ where: { id }, data: { archivedAt: null } }),
        prisma.brand.updateMany({
            where: { projectId: id, archivedAt: { not: null } },
            data: { archivedAt: null },
        }),
    ]);
    break;
}

// In the permanent-delete handler — capture name BEFORE delete
case "project": {
    const row = await prisma.project.findUnique({
        where: { id },
        select: { name: true },
    });
    name = row?.name ?? null;
    // FK cascade does the rest: brand, brand brain versions, products,
    // products brain versions, topics, generation requests/outputs,
    // memberships, analysis configs, competitor pipeline runs, creators.
    await prisma.project.delete({ where: { id } });
    break;
}
```

### Sweeper ([archive-sweep.job.ts](../../../backend/src/jobs/archive-sweep.job.ts))

Add a sweep step for projects:

```ts
await this.prisma.project.deleteMany({
    where: {
        archivedAt: { lt: cutoff },
        slug: { not: "default" },
    },
});
```

The slug guard is belt-and-suspenders; the archive endpoint already refuses to archive Default, so this branch is unreachable in practice. Cheap insurance against future bugs.

### Audit emits

`trash.permanent_delete` is already emitted from the trash route's permanent-delete handler with `entityType: type`. The `type` parameter now includes `"project"` — no code change beyond making sure `name` is populated for the project case (covered in the snippet above).

## Frontend Changes

### TrashTab type union ([frontend/src/components/workspace-settings/TrashTab.tsx](../../../frontend/src/components/workspace-settings/TrashTab.tsx))

Add `"project"` to whatever local type union mirrors the backend's `TrashItemType`. Add a "Project" option to the type filter at the top of the Trash table.

### Trash row rendering

A project row uses the existing `name + archivedAt + expiresAt` shape. No `context` line (a project is the top of the tree). Pick a sensible icon from `lucide-react` to match the existing brand/product/topic/content icons (e.g. `Folder` or `FolderOpen`).

### Restore + Delete forever buttons

The existing handlers POST to `/api/workspaces/:wid/trash/:type/:id/restore` and DELETE to `/api/workspaces/:wid/trash/:type/:id`. No per-type frontend logic; the URL carries `"project"` as the `:type` param. After either action, call `useProject().refresh()` so the sidebar's project switcher updates immediately (same pattern as the create-project fix that just landed).

### Archive confirmation copy ([ProjectsTab.tsx:49](../../../frontend/src/components/workspace-settings/ProjectsTab.tsx#L49))

Update from:

```
Archive project "${project.name}"? Members will lose access to it.
```

to (showing the cascade so the user isn't surprised):

```
Move project "${project.name}" to Trash? Its brand and everything inside (products, topics, content) will move with it. You can restore from Workspace Settings → Trash within 30 days.
```

The "30 days" matches the env default for `ARCHIVE_TTL_DAYS`. The frontend doesn't currently read backend env values, so hardcoding is acceptable for v1.

## Testing

- Optional unit test for the TrashService aggregator: archived project + archived brand pointing to that project produces ONE Trash item (the project), not two. Skip if the existing TrashService has no unit tests; route-level smoke covers it.
- Manual smoke:
  1. Create a project; inside it, create a brand.
  2. Archive the project from Workspace Settings → Projects.
  3. Verify: project disappears from sidebar AND brand disappears from Brands list. Workspace Settings → Trash shows ONE row labeled "Project: ${name}", NOT separate rows for project + brand.
  4. Click Restore on that row. Verify: project reappears in sidebar, brand reappears in Brands list.
  5. Archive again. Click "Delete forever" in Trash. Verify: row disappears, no FK errors in backend logs.
  6. DB check: `SELECT id FROM brands WHERE project_id = '<deleted-id>'` returns zero rows. Same for products, topics, generation_requests, generation_outputs that referenced the deleted project's tree.
  7. Wait through (or simulate via shortened TTL) the sweeper run. Verify it removes long-archived projects without errors.

## Open Questions

None. Cascade-everything answer locked Q1 during brainstorming; the rest follows existing patterns from the brand→product Trash flow.

## Rollout

1. Schema change + `bunx prisma db push` (reverts Brand.projectId to `Cascade`).
2. Deploy backend changes (archive cascade, Trash routes, sweeper, TrashService).
3. Deploy frontend changes (TrashTab handles project type, refresh sidebar, updated archive copy).

No data migration needed — there are no archived projects in the wild yet (or if there are, they slot cleanly into the new Trash list on the next page load).

No feature flag — the change is monotonic. Existing brand/product/topic/content Trash flows are untouched.
