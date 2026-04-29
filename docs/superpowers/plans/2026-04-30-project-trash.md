# Project Trash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring projects into the soft-delete + Trash flow that brands/products/topics/content already use, with cascade behavior across archive/restore/permanent-delete.

**Architecture:** Five surfaces change. Schema reverts `Brand.projectId` from `Restrict` to `Cascade`. The project archive endpoint cascades soft-delete to the brand. `TrashService` aggregates archived projects (collapsing the brand under them). The Trash route's restore + permanent-delete handlers gain `case "project"`. The hourly sweeper adds a project step. Frontend's `TrashTab` adds the new type; `ProjectsTab` updates the archive confirmation copy and the sidebar gets refreshed after Trash mutations.

**Tech Stack:** Bun runtime, Prisma 7, PostgreSQL, Hono, React 19.

**Spec:** [docs/superpowers/specs/2026-04-30-project-trash-design.md](../specs/2026-04-30-project-trash-design.md)

---

## Task 1: Schema — revert `Brand.projectId` to `onDelete: Cascade`

**Files:**
- Modify: `backend/prisma/schema.prisma:146`

The Trash gate now provides the safety: hard-delete only happens when the user explicitly clicks "Delete forever" from the Trash UI. Yesterday's `Restrict` is no longer needed and would actively block the new permanent-delete flow.

- [ ] **Step 1: Edit the schema**

In `backend/prisma/schema.prisma`, find the `Brand` model. Change line 146:

```diff
-  project            Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
+  project            Project              @relation(fields: [projectId], references: [id], onDelete: Cascade)
```

Nothing else in the model changes.

- [ ] **Step 2: Push the schema and regenerate the Prisma client**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
bunx prisma generate
```

Expected from `prisma db push`: `🚀  Your database is now in sync with your Prisma schema.` No data warnings — a column-attribute change like cascade action doesn't move data.

Expected from `prisma generate`: `✔ Generated Prisma Client …`.

- [ ] **Step 3: Verify the FK action in Postgres**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT conname, confdeltype FROM pg_constraint WHERE conname LIKE 'brands_project_id_fkey%';"
```

Expected: `confdeltype = c` (Cascade). Codes: `a` = NoAction, `r` = Restrict, `c` = Cascade, `n` = SetNull, `d` = SetDefault.

- [ ] **Step 4: Run the test suite — confirm no regression**

```bash
cd backend
set -a && source .env && set +a
bun test 2>&1 | tail -5
```

Expected: roughly the same pass count as the baseline on main (~213 pass / 1 fail; the 1 fail is the pre-existing `chat.service.test.ts apply_plan_edit` test, unrelated).

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(project): cascade brand on hard-delete (revert Restrict)"
```

---

## Task 2: Project archive endpoint — cascade-archive the brand

**Files:**
- Modify: `backend/src/routes/project.route.ts:222-250`

When the user clicks "Delete" on a project, the endpoint sets `archivedAt` on both the project AND its (single) brand inside one transaction. Products / topics / content stay untouched at the row level — they auto-hide via the existing `archivedAt` join filters.

- [ ] **Step 1: Replace the DELETE handler**

In `backend/src/routes/project.route.ts`, replace lines 222–250 (the existing DELETE handler) with:

```ts
	// DELETE /:projectId — soft delete (move to Trash). Cascades the
	// archive to the project's brand so the whole tree disappears
	// together. Restoring (or permanent-deleting) the project is done
	// from the Trash UI.
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

The diff vs the existing handler: replace the single `prisma.project.update` with the two-statement `$transaction` array. The 404 + Default-guard checks and the audit emit stay byte-for-byte identical.

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep "project\.route" || echo "NO_ERRORS"
```

Expected: `NO_ERRORS`.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/project.route.ts
git commit -m "feat(project): cascade-archive brand when project is moved to Trash"
```

---

## Task 3: Extend `TrashService` to include archived projects

**Files:**
- Modify: `backend/src/services/trash.service.ts`
- Modify: `backend/src/index.ts` (composition root — pass `prisma` to TrashService)

`TrashService` currently aggregates four entity types via injected repositories. Adding `prisma` as a constructor dependency lets us query `archived projects` directly without inventing an `IProjectRepository` for one method.

- [ ] **Step 1: Update the type union and constructor**

In `backend/src/services/trash.service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { IProductRepository } from "../interfaces/repositories/product.repository.interface";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";

export type TrashItemType = "brand" | "product" | "topic" | "content" | "project";

export interface TrashItem {
	id: string;
	type: TrashItemType;
	name: string;
	archivedAt: Date;
	expiresAt: Date;
	context?: string;
}

export class TrashService {
	constructor(
		private prisma: PrismaClient,
		private brandRepository: IBrandRepository,
		private productRepository: IProductRepository,
		private topicRepository: ITopicRepository,
		private generationRepository: IGenerationRepository,
		private ttlDays: number,
	) {}
	// ... list() comes next
}
```

The new constructor parameter is `prisma`, prepended as the first arg. Existing repo args follow in the same order; `ttlDays` stays last.

- [ ] **Step 2: Replace `list()` with the project-aware version**

Replace the existing `list()` method (lines 39–105 in the current file) with:

```ts
	async list(workspaceId: string): Promise<TrashItem[]> {
		const [archivedProjects, brands, products, topics, outputs] = await Promise.all([
			this.prisma.project.findMany({
				where: { workspaceId, archivedAt: { not: null } },
				select: { id: true, name: true, archivedAt: true },
			}),
			this.brandRepository.findArchivedByWorkspace(workspaceId),
			this.productRepository.findArchivedByWorkspace(workspaceId),
			this.topicRepository.findArchivedByWorkspace(workspaceId),
			this.generationRepository.findArchivedOutputsByWorkspace(workspaceId),
		]);

		// Set of archived project ids — used to collapse brands whose
		// project is also archived (the project row subsumes them).
		const archivedProjectIds = new Set(archivedProjects.map((p) => p.id));

		const items: TrashItem[] = [];

		for (const project of archivedProjects) {
			if (!project.archivedAt) continue;
			items.push({
				id: project.id,
				type: "project",
				name: project.name,
				archivedAt: project.archivedAt,
				expiresAt: this.computeExpiry(project.archivedAt),
			});
		}

		for (const brand of brands) {
			if (!brand.archivedAt) continue;
			// If this brand's project is also archived, the project row
			// already represents it. Skip to avoid duplicates.
			if (brand.projectId && archivedProjectIds.has(brand.projectId)) continue;
			items.push({
				id: brand.id,
				type: "brand",
				name: brand.name,
				archivedAt: brand.archivedAt,
				expiresAt: this.computeExpiry(brand.archivedAt),
			});
		}

		for (const product of products) {
			if (!product.archivedAt) continue;
			items.push({
				id: product.id,
				type: "product",
				name: product.name,
				archivedAt: product.archivedAt,
				expiresAt: this.computeExpiry(product.archivedAt),
				context: product.brand?.name ? `Brand: ${product.brand.name}` : undefined,
			});
		}

		for (const topic of topics) {
			if (!topic.archivedAt) continue;
			items.push({
				id: topic.id,
				type: "topic",
				name: topic.title,
				archivedAt: topic.archivedAt,
				expiresAt: this.computeExpiry(topic.archivedAt),
				context: topic.brand?.name ? `Brand: ${topic.brand.name}` : undefined,
			});
		}

		for (const output of outputs) {
			if (!output.archivedAt) continue;
			const label =
				output.contentTitle ??
				`${(output as any).request?.platform ?? "content"} ${(output as any).request?.contentType ?? ""}`.trim();
			items.push({
				id: output.id,
				type: "content",
				name: label || "Untitled content",
				archivedAt: output.archivedAt,
				expiresAt: this.computeExpiry(output.archivedAt),
				context: (output as any).request?.brand?.name
					? `Brand: ${(output as any).request.brand.name}`
					: undefined,
			});
		}

		// Most recently archived first — people usually want to restore
		// what they just trashed.
		items.sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
		return items;
	}

	private computeExpiry(archivedAt: Date): Date {
		return new Date(archivedAt.getTime() + this.ttlDays * 24 * 60 * 60 * 1000);
	}
```

The diff vs the original: a new project block at the top, a 2-line skip-when-project-archived guard inside the brand loop, and a `Promise.all` that includes the project query. Everything else is identical.

- [ ] **Step 3: Update the composition root**

In `backend/src/index.ts`, find `const trashService = new TrashService(...)` (around line 284). Add `prisma` as the first argument:

```ts
const trashService = new TrashService(
	prisma,
	brandRepository,
	productRepository,
	topicRepository,
	generationRepository,
	env.archiveTtlDays,
);
```

The other args stay in the same order.

- [ ] **Step 4: Type-check + run tests**

```bash
cd backend && set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -E "(trash\.service|index\.ts)" || echo "NO_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_ERRORS` and the same baseline pass count.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/trash.service.ts backend/src/index.ts
git commit -m "feat(trash): include archived projects in Trash list with brand collapse"
```

---

## Task 4: Trash route — handle `project` in restore and permanent-delete

**Files:**
- Modify: `backend/src/routes/trash.route.ts`

Add `case "project":` to both switch statements. Restore clears `archivedAt` on the project AND any archived brand pointing at it (cascade-restore). Permanent-delete uses `prisma.project.delete` — the FK cascade does the rest now that Task 1 flipped `Brand.projectId` to `onDelete: Cascade`.

- [ ] **Step 1: Add the restore case**

In `backend/src/routes/trash.route.ts`, find the `POST /:type/:id/restore` handler (lines 50–75). Inside the `switch (type) { ... }` block, before the `default:` case, add:

```ts
				case "project":
					await prisma.$transaction([
						prisma.project.update({
							where: { id },
							data: { archivedAt: null },
						}),
						prisma.brand.updateMany({
							where: { projectId: id, archivedAt: { not: null } },
							data: { archivedAt: null },
						}),
					]);
					break;
```

- [ ] **Step 2: Add the permanent-delete case**

In the same file, find the `DELETE /:type/:id` handler. Inside its `switch (type) { ... }` block, before the `default:` case, add:

```ts
				case "project": {
					const row = await prisma.project.findUnique({
						where: { id },
						select: { name: true },
					});
					name = row?.name ?? null;
					// FK cascade does the rest: brand, brand brain versions,
					// products, products brain versions, topics, generation
					// requests/outputs, memberships, analysis configs,
					// competitor pipeline runs, creators.
					await prisma.project.delete({ where: { id } });
					break;
				}
```

- [ ] **Step 3: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep "trash\.route" || echo "NO_ERRORS"
```

Expected: `NO_ERRORS`.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/trash.route.ts
git commit -m "feat(trash): handle project in restore and permanent-delete"
```

---

## Task 5: Sweeper — hard-delete archived projects past TTL

**Files:**
- Modify: `backend/src/jobs/archive-sweep.job.ts`

The hourly sweeper currently hard-deletes archived rows for outputs/requests/topics/products/brands. Add a project step at the end. Cascading FKs handle the rest of the subtree.

- [ ] **Step 1: Add the project deleteMany step**

In `backend/src/jobs/archive-sweep.job.ts`, replace the body of `handle()` with:

```ts
	async handle(): Promise<void> {
		const cutoff = new Date(Date.now() - this.ttlDays * 24 * 60 * 60 * 1000);
		this.logger.info("archive-sweep: starting", {
			cutoff: cutoff.toISOString(),
			ttlDays: this.ttlDays,
		});

		const outputResult = await this.prisma.generationOutput.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const requestResult = await this.prisma.generationRequest.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const topicResult = await this.prisma.contentTopic.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const productResult = await this.prisma.product.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		// Brands before projects so brand-cascade doesn't race with the
		// project-cascade (both would touch the same products/topics tree).
		const brandResult = await this.prisma.brand.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		// Projects last. The slug guard is belt-and-suspenders — the
		// archive endpoint already refuses to archive Default, so this
		// branch is unreachable in practice.
		const projectResult = await this.prisma.project.deleteMany({
			where: {
				archivedAt: { lt: cutoff },
				slug: { not: "default" },
			},
		});

		this.logger.info("archive-sweep: done", {
			deletedOutputs: outputResult.count,
			deletedRequests: requestResult.count,
			deletedTopics: topicResult.count,
			deletedProducts: productResult.count,
			deletedBrands: brandResult.count,
			deletedProjects: projectResult.count,
		});
	}
```

The diff: a new `projectResult` step after `brandResult`, and the corresponding `deletedProjects` field added to the done-log.

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep "archive-sweep" || echo "NO_ERRORS"
```

Expected: `NO_ERRORS`.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/jobs/archive-sweep.job.ts
git commit -m "feat(sweeper): hard-delete archived projects past TTL"
```

---

## Task 6: Frontend `TrashTab` — render projects, refresh sidebar

**Files:**
- Modify: `frontend/src/components/workspace-settings/TrashTab.tsx`

Two changes: extend the local `TrashType` union + label/variant maps to include `project`, and call `useProject().refresh()` after every restore/permanent-delete so the sidebar reflects the new state.

- [ ] **Step 1: Read the current TrashTab to anchor exact insertion points**

```bash
sed -n '1,50p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/workspace-settings/TrashTab.tsx
```

You'll see the type union on line 8, the label map starting line 24, the variant map starting line 31, and the filter list around line 139. Match what's there before applying the diffs below.

- [ ] **Step 2: Add the `useProject` import**

At the top of `frontend/src/components/workspace-settings/TrashTab.tsx`, add the import alongside the other hook imports:

```ts
import { useProject } from "../../hooks/useProject";
```

- [ ] **Step 3: Extend the type union and label/variant maps**

```diff
- type TrashType = "brand" | "product" | "topic" | "content";
+ type TrashType = "brand" | "product" | "topic" | "content" | "project";
```

```diff
  const TYPE_LABEL: Record<TrashType, string> = {
    brand: "Brand",
    product: "Product",
    topic: "Topic",
    content: "Content",
+   project: "Project",
  };
```

```diff
  const TYPE_VARIANT: Record<TrashType, "info" | "warning" | "default" | "success"> = {
    brand: "info",
    product: "success",
    topic: "warning",
    content: "default",
+   project: "info",
  };
```

`"info"` reuses the same indigo accent as `brand` — projects sit at the same conceptual tier (containers).

- [ ] **Step 4: Add `project` to the filter pill list**

Find the filter list around line 139:

```diff
- {(["all", "brand", "product", "topic", "content"] as const).map((f) => (
+ {(["all", "brand", "product", "topic", "content", "project"] as const).map((f) => (
```

- [ ] **Step 5: Get `refresh` from useProject and call it after mutations**

Inside the `TrashTab` component body (near the existing `useState`s), add:

```ts
  const { refresh: refreshSidebar } = useProject();
```

Then update the restore handler (around line 80–95) — find the line `onToast(`${TYPE_LABEL[item.type]} restored`, "success")` and the `await load()` call right after. Wrap them so refresh runs alongside:

```ts
      await api(`/api/workspaces/${workspaceId}/trash/${item.type}/${item.id}/restore`, {
        method: "POST",
      });
      onToast(`${TYPE_LABEL[item.type]} restored`, "success");
      await Promise.all([load(), refreshSidebar()]);
```

Same for the permanent-delete handler (around line 100–115):

```ts
      await api(`/api/workspaces/${workspaceId}/trash/${item.type}/${item.id}`, {
        method: "DELETE",
      });
      onToast(`${TYPE_LABEL[item.type]} deleted permanently`, "success");
      await Promise.all([load(), refreshSidebar()]);
```

The sidebar refresh is a no-op for non-project types (the sidebar only renders projects), but calling it unconditionally is simpler than branching on `item.type === "project"`.

- [ ] **Step 6: Update the empty-state copy**

The current empty-state mentions "brands, products, topics, and content". Update it to include projects. Find the line near 132–134:

```diff
-           Soft-deleted brands, products, topics, and content. Items auto-delete after the expiry
+           Soft-deleted projects, brands, products, topics, and content. Items auto-delete after the expiry
```

And update the "restoring a brand" hint:

```diff
-          brand also brings back everything under it.
+          project or brand also brings back everything under it.
```

(Match the actual surrounding sentence; the diff above is intent, not literal lines — adapt to whatever the existing prose reads after Tasks 1–5 land.)

- [ ] **Step 7: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent (no errors).

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/workspace-settings/TrashTab.tsx
git commit -m "feat(trash): render projects in Trash and refresh sidebar after mutations"
```

---

## Task 7: Update project archive confirmation copy

**Files:**
- Modify: `frontend/src/components/workspace-settings/ProjectsTab.tsx`

Surface the cascade so the user isn't surprised that archiving a project also takes its brand.

- [ ] **Step 1: Update the confirm() string**

In `frontend/src/components/workspace-settings/ProjectsTab.tsx`, find the archive handler (around line 49):

```diff
-     if (!confirm(`Archive project "${project.name}"? Members will lose access to it.`)) return;
+     if (!confirm(`Move project "${project.name}" to Trash? Its brand and everything inside (products, topics, content) will move with it. You can restore from Workspace Settings → Trash within 30 days.`)) return;
```

The "30 days" matches the env default for `ARCHIVE_TTL_DAYS`. The frontend doesn't read backend env values today, so hardcoding is acceptable.

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/workspace-settings/ProjectsTab.tsx
git commit -m "feat(project): update archive confirm copy to surface cascade"
```

---

## Task 8: Manual smoke test

**Files:**
- No file changes.

- [ ] **Step 1: Restart the backend**

```bash
kill $(pgrep -f "bun.*src/index" 2>/dev/null) 2>/dev/null
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run --hot src/index.ts &
```

- [ ] **Step 2: Restart the frontend dev server (if not on hot-reload)**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
npm run dev
```

- [ ] **Step 3: Smoke — archive cascades**

In the browser, signed in as a workspace admin or superadmin:
1. Workspace Settings → Projects → click **New Project** → create "Smoke Test Project".
2. Sidebar → switch to "Smoke Test Project".
3. Brands → **Create Brand** → fill in → save.
4. Workspace Settings → Projects → click the archive icon on "Smoke Test Project".
5. **Expected:** confirm dialog shows the new copy ("…Its brand and everything inside…"). Click OK.
6. **Expected:** the project disappears from the sidebar AND the brand list. Workspace Settings → Trash shows ONE row labeled "Project: Smoke Test Project". No separate brand row.

- [ ] **Step 4: Smoke — restore cascades**

Still in the Trash tab from Step 3:
1. Click **Restore** on the project row.
2. **Expected:** the project reappears in the sidebar; the brand reappears in the brand list.

- [ ] **Step 5: Smoke — permanent-delete cascades**

1. Archive the project again (same flow as Step 3).
2. Workspace Settings → Trash → click **Delete forever** on the project row.
3. **Expected:** row disappears from Trash, no FK errors in the backend logs.
4. DB check:
   ```bash
   docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
     "SELECT COUNT(*) FROM projects WHERE name = 'Smoke Test Project';
      SELECT COUNT(*) FROM brands WHERE project_id NOT IN (SELECT id FROM projects);"
   ```
   Expected: both counts = 0. The project is gone; no orphaned brands.

- [ ] **Step 6: No commit (verification only)**

If anything fails any step, return to the relevant task and fix.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Schema: revert Brand.projectId to Cascade | Task 1 |
| Project archive cascades brand | Task 2 |
| TrashService aggregates archived projects | Task 3 |
| TrashService collapse rule (project subsumes brand) | Task 3 |
| Trash route restore handles project | Task 4 |
| Trash route permanent-delete handles project | Task 4 |
| Sweeper handles project | Task 5 |
| Frontend TrashTab renders project type | Task 6 |
| Frontend sidebar refresh after Trash mutations | Task 6 |
| Frontend archive confirm copy | Task 7 |
| Manual smoke | Task 8 |
| `trash.permanent_delete` audit emit (already in place) | Task 4 (uses existing emit; no code change needed beyond the new switch case) |

All spec requirements covered.

**Type / name consistency:**
- `TrashItemType` adds `"project"` in Task 3; frontend `TrashType` adds `"project"` in Task 6. Strings match.
- The action string `"project.archive"` already exists in the audit emit and is preserved in Task 2.
- The Trash route's URL path uses `:type` literal — `"project"` flows through unchanged.

**Placeholder scan:** No "TBD", "TODO", or "implement later". Every code step has full code.

**Scope check:** Single focused work surface; no decomposition needed.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-project-trash.md](2026-04-30-project-trash.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
