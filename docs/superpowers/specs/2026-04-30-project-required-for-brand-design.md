# Project Required for Brand Creation — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Backend / Frontend / DB

## Problem

Today users can create a brand without first creating a project. The `BrandService.create` method silently falls back to the workspace's auto-created **Default** project when no `projectId` is provided ([backend/src/services/brand.service.ts:30-31](../../../backend/src/services/brand.service.ts#L30-L31)). The schema also leaves `Brand.projectId` nullable for legacy compat, and the partial-unique migration that would back the "1 brand per project" rule at the DB level was written but never run on this database — the constraint is only enforced in the service layer where it's race-prone.

The intended hierarchy is `Workspace → Project → Brand → Product → …`, with **1 brand per project**. We need to make the project requirement first-class: explicit in the schema, enforced at the DB and service layers, and surfaced clearly in the UI.

## Goals

- Brand creation requires an explicit `projectId`. No silent fallback to Default.
- Schema reflects reality: `Brand.projectId` is non-null.
- DB-level enforcement of "1 brand per project" via the existing (but unrun) partial unique index.
- Frontend gates the "Create Brand" button on a selected project.
- Existing legacy brands with `project_id IS NULL` are migrated cleanly into their workspace's Default project.
- The auto-created Default project stays — first-time users still see a non-empty project list. We just stop *auto-using* it for brand creation.

## Non-Goals

- Removing the Default project entirely.
- Auditing brand-creation events (out of scope; brand mutations are not currently audited).
- Restructuring the route hierarchy (`/brands/new` stays a top-level route; we don't move it under `/projects/:id/...`).
- Adding a project-creation affordance INSIDE the sidebar's project switcher beyond what's already there. If the switcher lacks a "Create new project" button, that's a small additive ask flagged during implementation, not part of this spec.
- Auditing project deletion's interaction with the new `onDelete: Restrict` (we don't currently audit project lifecycle either).

## Schema Change

Make `Brand.projectId` non-null and switch the cascade to `Restrict` so deleting a project with a live brand is blocked at the DB level:

```diff
 model Brand {
   id                   String    @id @default(uuid())
   workspaceId          String    @map("workspace_id")
-  // Nullable until the RBAC migration backfills every brand into the
-  // workspace's default project. Code paths treat `null` = "default project".
-  projectId            String?   @map("project_id")
+  projectId            String    @map("project_id")
   ...
-  project            Project?             @relation(fields: [projectId], references: [id], onDelete: SetNull)
+  project            Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
 }
```

`onDelete: Restrict` is a deliberate change from the current `SetNull`. The current behavior is a leftover from when `projectId` was nullable; once the column is non-null, the only way to delete a project that owns a brand is to first archive/reassign the brand. That matches the "1 brand per project, project is the container" mental model.

## Backend Service Change

`BrandService.create` ([backend/src/services/brand.service.ts:26-65](../../../backend/src/services/brand.service.ts#L26-L65)) — drop the Default fallback and require an explicit `projectId`:

```ts
async create(workspaceId: string, input: CreateBrandInput): Promise<Brand> {
    if (!input.projectId) {
        throw new Error(
            "projectId is required — pick or create a project before creating a brand",
        );
    }

    // Pre-check kept for the friendly error message; DB partial unique
    // catches the same condition under race.
    if (await this.brandRepository.projectHasBrand(input.projectId)) {
        throw new Error(
            "This project already has a brand. Each project can contain only one brand — create a new project to add another.",
        );
    }

    try {
        return await this.brandRepository.create({
            workspaceId,
            projectId: input.projectId,
            name: input.name,
            slug: input.slug,
            category: input.category,
            websiteUrl: input.websiteUrl,
            language: input.language,
        });
    } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new Error(
                "A brand with this name is already in this project — possibly in Workspace Settings → Trash. Restore it, permanently delete it from Trash, or pick a different name.",
            );
        }
        throw e;
    }
}
```

The repository method `findDefaultProjectId(workspaceId)` becomes unused by `create`. Leave the method in place for now (it may have other callers; deleting is out of scope for this work).

## Route Change

`POST /api/workspaces/:wid/brands` ([backend/src/routes/brand.route.ts:29-44](../../../backend/src/routes/brand.route.ts#L29-L44)) — validate `projectId` before delegating to the service so the friendly 400 fires before any DB call:

```ts
app.post("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const body = await c.req.json();
    const { name, slug, category, websiteUrl, projectId, language } = body;
    if (!name || !slug) {
        return c.json({ error: "Name and slug are required" }, 400);
    }
    if (!projectId || typeof projectId !== "string") {
        return c.json({
            error: "projectId is required — pick or create a project before creating a brand",
        }, 400);
    }
    const brand = await brandService.create(workspaceId, {
        name,
        slug,
        category,
        websiteUrl,
        projectId,
        language,
    });
    return c.json({ data: brand }, 201);
});
```

## Frontend Change

### BrandsPage ([frontend/src/pages/BrandsPage.tsx](../../../frontend/src/pages/BrandsPage.tsx))

Disable the "Create Brand" button when `activeProject == null`. Tooltip: "Select or create a project from the sidebar first."

The empty-state copy at lines 323–326 changes:

```diff
- Your brand brain powers every generated topic and post. {activeProject?.name ?? "This project"}
- doesn't have a brand yet — create one to get started.
+ {activeProject
+   ? `Your brand brain powers every generated topic and post. ${activeProject.name} doesn't have a brand yet — create one to get started.`
+   : "Pick a project from the sidebar (or create a new one) to add a brand."}
```

The "Create Brand" button at line 328 — disable when no project; tooltip explains why.

If the page header carries another "+ New Brand" affordance elsewhere, gate it the same way. The implementation step lists the exact line numbers after a final read of the file.

### NewBrandPage ([frontend/src/pages/NewBrandPage.tsx](../../../frontend/src/pages/NewBrandPage.tsx))

Defense-in-depth for direct URL access (`/brands/new`):

- At mount, if `activeProject == null`, run `navigate("/brands", { replace: true })`. This guarantees the form never renders without a project context.
- The form already passes `projectId={activeProject?.id}` (line 88). With the guard above, that value is never undefined when the form actually mounts. No change needed to that prop wiring.
- Backend may still return the 400 "projectId is required" in pathological cases (stale tab, race between project deletion and form submit). Surface that as a toast: `"Please select a project first"` and `navigate("/brands")`.

### Sidebar (AppShell)

The project switcher already exists ([AppShell.tsx:218-243](../../../frontend/src/components/layout/AppShell.tsx#L218-L243)). No structural change in this spec. Verify during implementation that the switcher includes a path to "Create new project"; if missing, flag as a follow-up — out of scope here.

## Migrations

Run in strict order. Each step must succeed before the next ships:

1. **`backend/scripts/backfill-brand-default-project.ts`** — new one-shot script. For every brand with `project_id IS NULL`, set `project_id` to the row in `projects` matching that brand's `workspace_id` AND `slug = 'default'`. Refuse to run (with a clear error and exit code 1) if any workspace is missing a Default project — that surfaces a missing prerequisite (`migrate-rbac.ts` not run) instead of corrupting data. Idempotent (no-op when zero rows match). Safe to re-run. Logs the count of brands updated.

2. **`backend/scripts/migrate-brand-partial-unique.ts`** — already written, never run. Creates `brands_project_id_active_key` and `brands_project_id_slug_active_key` (both partial: `WHERE archived_at IS NULL`), drops the old full unique indexes if present (they're not present in the current DB; that's fine — the script tolerates this). Idempotent.

3. **`bunx prisma db push`** — applies the schema change (non-null `projectId`, `onDelete: Restrict`). Will fail loudly if step 1 left any null `project_id` row; that's the safety. Regenerates the Prisma client.

4. **Deploy backend code** — service + route changes from this spec. After this point, brand creation without `projectId` returns 400.

5. **Deploy frontend code** — disabled button + redirect guard + copy change.

The current DB has 2 brands with `project_id IS NULL`. Step 1 will assign both to their workspace's Default project. After step 1, the count is 0 and step 3 succeeds.

## Error Handling

- **Backend**: missing `projectId` → 400 `{ error: "projectId is required …" }`.
- **Backend**: `projectHasBrand` already returns true → 400 with the existing friendly message.
- **Backend**: project deleted while brand creation in flight → either (a) FK violation from Prisma if the project disappeared between the `projectHasBrand` read and the `create` write, or (b) `onDelete: Restrict` blocks the delete. The error path is rare and acceptable.
- **Frontend**: any 400 from the create endpoint surfaces as a toast and (for the project-required case) redirects back to `/brands`.

## Testing

- Service test: `create` throws when `projectId` is missing.
- Service test: `create` no longer reads `findDefaultProjectId` when `projectId` is missing (asserts the fallback path is gone).
- Service test: `create` still throws the friendly 1-per-project error when `projectHasBrand` returns true.
- Manual smoke after deployment:
  1. As a user with no `activeProject` selected, the "Create Brand" button is disabled with the explanatory tooltip.
  2. Typing `/brands/new` in URL with no `activeProject` → bounces to `/brands`.
  3. Pick a project → button enables → create brand → success.
  4. Try to create a second brand in the same project → friendly error message.
  5. Try to delete a project (via Prisma Studio or workspace admin if a delete endpoint exists) that has a live brand → DB-level Restrict rejects.

No new unit tests for the route — `brand.route.ts` has no test coverage today and the convention is to test at the service layer.

## Rollout Order

The five migration steps above are the rollout. Each is safe before the next ships:

- Step 1 leaves brand rows with valid project assignments — no behavior change yet.
- Step 2 adds DB constraints that current data already satisfies.
- Step 3 enforces non-null at the schema level — prerequisite satisfied by step 1.
- Step 4 adds the explicit-projectId requirement — frontend hasn't changed yet, but the form already sends `projectId` whenever `activeProject` is set, so most live flows continue to work; only the `/brands/new` direct-URL-without-project case starts erroring.
- Step 5 closes the UI gap — disabled button + redirect guard prevents the user from hitting the error path.

No feature flag needed; the rollout is monotonic and reversible at each step.

## Open Questions

None. All three design questions resolved during brainstorming:

- Default project: keep it, stop auto-falling-back to it.
- Legacy null-projectId brands: backfill to workspace's Default.
- Frontend gating: disable "Create Brand" button + redirect direct-URL access.
