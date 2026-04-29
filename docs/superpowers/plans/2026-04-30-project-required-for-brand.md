# Project Required for Brand Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make brand creation require an explicit `projectId` — drop the silent Default-project fallback, enforce 1-brand-per-project at the DB level, backfill legacy null-projectId rows, and gate the "Create Brand" UI on a selected project.

**Architecture:** Five surfaces change in lockstep: a one-shot data backfill, an existing-but-unrun partial-unique migration, a schema change to non-null `Brand.projectId` with `onDelete: Restrict`, a service-layer guard that throws on missing projectId, and a frontend gate that disables "Create Brand" when no project is active.

**Tech Stack:** Bun runtime, Prisma 7, PostgreSQL, Hono, React 19, Vite, `bun:test`.

**Spec:** [docs/superpowers/specs/2026-04-30-project-required-for-brand-design.md](../specs/2026-04-30-project-required-for-brand-design.md)

---

## Task 1: Write the backfill script for legacy null-projectId brands

**Files:**
- Create: `backend/scripts/backfill-brand-default-project.ts`

The DB has 2 brands with `project_id IS NULL` (legacy rows). Move them to their workspace's Default project before the schema goes non-null. Idempotent: zero rows left → no-op. Safe to re-run.

- [ ] **Step 1: Write the script**

`backend/scripts/backfill-brand-default-project.ts`:

```ts
/**
 * One-shot migration: assign every brand with project_id = NULL to its
 * workspace's Default project.
 *
 *   bun run scripts/backfill-brand-default-project.ts [--dry-run]
 *
 * Background: Brand.projectId was nullable for legacy compat. The
 * project-required-for-brand work makes it non-null. Any brand still
 * pointing at NULL needs to land somewhere first; the workspace's
 * Default project is the natural home (every workspace has one per the
 * RBAC migration).
 *
 * Refuses to run if any workspace lacks a Default project — that surfaces
 * "migrate-rbac.ts was never run" loudly instead of silently corrupting.
 *
 * Idempotent. Safe to re-run.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const orphanedBrands = await prisma.brand.findMany({
		where: { projectId: null },
		select: { id: true, name: true, workspaceId: true },
	});

	if (orphanedBrands.length === 0) {
		console.log("✓ No brands with null projectId. Nothing to do.");
		return;
	}

	console.log(`Found ${orphanedBrands.length} brand(s) with project_id = NULL.`);

	// Group by workspace, look up each workspace's Default project, refuse
	// if any workspace is missing one.
	const workspaceIds = [...new Set(orphanedBrands.map((b) => b.workspaceId))];
	const defaults = await prisma.project.findMany({
		where: { workspaceId: { in: workspaceIds }, slug: "default" },
		select: { id: true, workspaceId: true },
	});
	const defaultByWorkspace = new Map(defaults.map((p) => [p.workspaceId, p.id]));

	const missingDefaults = workspaceIds.filter((wsId) => !defaultByWorkspace.has(wsId));
	if (missingDefaults.length > 0) {
		console.error(
			`✗ ${missingDefaults.length} workspace(s) are missing a Default project: ${missingDefaults.join(", ")}`,
		);
		console.error(`  Run 'bun run scripts/migrate-rbac.ts' first, then re-run this script.`);
		process.exit(1);
	}

	if (DRY_RUN) {
		console.log("DRY RUN — would assign:");
		for (const brand of orphanedBrands) {
			console.log(`  ${brand.id} (${brand.name}) → ${defaultByWorkspace.get(brand.workspaceId)}`);
		}
		return;
	}

	let updated = 0;
	for (const brand of orphanedBrands) {
		const projectId = defaultByWorkspace.get(brand.workspaceId)!;
		await prisma.brand.update({
			where: { id: brand.id },
			data: { projectId },
		});
		updated += 1;
	}

	console.log(`✓ Updated ${updated} brand(s).`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
```

- [ ] **Step 2: Type-check**

Run from `/Users/bellinnn/Documents/projects/fce/backend`:

```bash
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep "backfill-brand-default-project" || echo "NO_ERRORS"
```

Expected: `NO_ERRORS`. Pre-existing errors in unrelated files are out of scope.

- [ ] **Step 3: Dry-run against dev DB**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run scripts/backfill-brand-default-project.ts --dry-run
```

Expected output: `Found 2 brand(s) with project_id = NULL.` followed by `DRY RUN — would assign:` and 2 lines mapping each brand id to a project id.

If output instead says any workspace is missing a Default project, STOP — the prerequisite `migrate-rbac.ts` was never run on this DB. Investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/scripts/backfill-brand-default-project.ts
git commit -m "feat(brand): add backfill script for legacy null-projectId brands"
```

---

## Task 2: Run the backfill + the existing partial-unique migration on the dev DB

**Files:**
- No file changes — this task runs scripts and verifies DB state.

This task is data-only. The two scripts are idempotent; running them advances the DB to the state required by Task 6 (the schema push that makes `projectId` NOT NULL).

- [ ] **Step 1: Run the backfill (real, not dry-run)**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run scripts/backfill-brand-default-project.ts
```

Expected: `✓ Updated 2 brand(s).`

- [ ] **Step 2: Verify zero null project_id rows remain**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT COUNT(*) FROM brands WHERE project_id IS NULL;"
```

Expected: `count = 0`. If non-zero, do NOT proceed — investigate.

- [ ] **Step 3: Run the existing partial-unique migration**

This script (`backend/scripts/migrate-brand-partial-unique.ts`) was written previously but never run on this DB. It creates two partial unique indexes:
- `brands_project_id_active_key` — `UNIQUE(project_id) WHERE archived_at IS NULL` (the "1 brand per project" rule)
- `brands_project_id_slug_active_key` — `UNIQUE(project_id, slug) WHERE archived_at IS NULL` (the slug-uniqueness rule)

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run scripts/migrate-brand-partial-unique.ts
```

Expected output: success messages indicating both indexes were created (and any old non-partial indexes dropped, if they existed). The script is idempotent — re-running is safe.

- [ ] **Step 4: Verify the indexes exist**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'brands' ORDER BY indexname;"
```

Expected: at least `brands_pkey`, `brands_project_id_active_key`, `brands_project_id_slug_active_key`, `brands_workspace_id_archived_at_idx`. The two partial indexes' `indexdef` should contain `WHERE (archived_at IS NULL)`.

- [ ] **Step 5: No commit (this task only runs scripts; no source files changed)**

If any source file changed (it shouldn't), do NOT commit it as part of this task — investigate why.

---

## Task 3: Update existing BrandService tests + add failing tests for new contract

**Files:**
- Modify: `backend/tests/services/brand.service.test.ts`

The existing 8 tests in `brand.service.test.ts` call `brandService.create(workspaceId, { name, slug })` without a `projectId`. After Task 4 adds the explicit-projectId guard, all 8 fail. Update them to pass a fake projectId, AND add new tests asserting the guard fires.

- [ ] **Step 1: Update existing tests to pass projectId**

Replace the relevant sections of `backend/tests/services/brand.service.test.ts`. The minimal change: every existing call to `brandService.create(workspaceId, { name, slug, ... })` gets a `projectId: crypto.randomUUID()` field. Also: when two brands are created in the SAME workspace (the `list` test does this), they need DIFFERENT projectIds (because of the 1-brand-per-project rule the service already enforces via `projectHasBrand`).

Concretely:

```ts
describe("list", () => {
    it("should return brands for a workspace", async () => {
        const workspaceId = crypto.randomUUID();
        const otherWorkspaceId = crypto.randomUUID();

        await brandService.create(workspaceId, {
            name: "Brand A",
            slug: "brand-a",
            projectId: crypto.randomUUID(),
        });
        await brandService.create(workspaceId, {
            name: "Brand B",
            slug: "brand-b",
            projectId: crypto.randomUUID(),
        });
        await brandService.create(otherWorkspaceId, {
            name: "Other Brand",
            slug: "other-brand",
            projectId: crypto.randomUUID(),
        });

        const brands = await brandService.list(workspaceId);
        expect(brands).toHaveLength(2);
        const slugs = brands.map((b) => b.slug);
        expect(slugs).toContain("brand-a");
        expect(slugs).toContain("brand-b");
    });
});

describe("create", () => {
    it("should create a brand", async () => {
        const workspaceId = crypto.randomUUID();
        const brand = await brandService.create(workspaceId, {
            name: "My Brand",
            slug: "my-brand",
            category: "tech",
            websiteUrl: "https://mybrand.com",
            projectId: crypto.randomUUID(),
        });

        expect(brand.workspaceId).toBe(workspaceId);
        expect(brand.name).toBe("My Brand");
        expect(brand.slug).toBe("my-brand");
        expect(brand.category).toBe("tech");
        expect(brand.websiteUrl).toBe("https://mybrand.com");
        expect(brand.status).toBe("draft");
    });
});

describe("getById", () => {
    it("should return brand with brain versions", async () => {
        const workspaceId = crypto.randomUUID();
        const created = await brandService.create(workspaceId, {
            name: "Brain Brand",
            slug: "brain-brand",
            projectId: crypto.randomUUID(),
        });
        await brandService.createBrainVersion(created.id, { personality: "Bold" });

        const brand = await brandService.getById(created.id);
        expect(brand.id).toBe(created.id);
        expect(brand.name).toBe("Brain Brand");
        expect(brand.brainVersions).toHaveLength(1);
        expect(brand.brainVersions[0].personality).toBe("Bold");
    });

    it("should throw 'Brand not found' when not found", async () => {
        await expect(brandService.getById("nonexistent-id")).rejects.toThrow("Brand not found");
    });
});

describe("createBrainVersion", () => {
    it("should create version with correct version number", async () => {
        const workspaceId = crypto.randomUUID();
        const brand = await brandService.create(workspaceId, {
            name: "Version Brand",
            slug: "version-brand",
            projectId: crypto.randomUUID(),
        });

        const v1 = await brandService.createBrainVersion(brand.id, {
            personality: "Friendly",
            tone: "Casual",
        });
        expect(v1.version).toBe(1);
        expect(v1.brandId).toBe(brand.id);
        expect(v1.personality).toBe("Friendly");
        expect(v1.tone).toBe("Casual");

        const v2 = await brandService.createBrainVersion(brand.id, {
            personality: "Bold",
            tone: "Confident",
        });
        expect(v2.version).toBe(2);

        const v3 = await brandService.createBrainVersion(brand.id, { personality: "Playful" });
        expect(v3.version).toBe(3);
    });
});
```

- [ ] **Step 2: Add new tests for the explicit-projectId contract**

Append a new `describe` block at the end of the existing top-level `describe("BrandService", ...)`:

```ts
describe("create — projectId is required", () => {
    it("throws when projectId is missing", async () => {
        const workspaceId = crypto.randomUUID();
        await expect(
            brandService.create(workspaceId, { name: "No Project Brand", slug: "no-project" }),
        ).rejects.toThrow(
            "projectId is required — pick or create a project before creating a brand",
        );
    });

    it("throws even when input.projectId is an empty string", async () => {
        const workspaceId = crypto.randomUUID();
        await expect(
            brandService.create(workspaceId, {
                name: "Empty Project Brand",
                slug: "empty-project",
                projectId: "",
            }),
        ).rejects.toThrow(
            "projectId is required — pick or create a project before creating a brand",
        );
    });

    it("throws the 1-per-project error when a brand already exists in the project", async () => {
        const workspaceId = crypto.randomUUID();
        const projectId = crypto.randomUUID();
        await brandService.create(workspaceId, {
            name: "First Brand",
            slug: "first-brand",
            projectId,
        });
        await expect(
            brandService.create(workspaceId, {
                name: "Second Brand",
                slug: "second-brand",
                projectId,
            }),
        ).rejects.toThrow(
            "This project already has a brand. Each project can contain only one brand — create a new project to add another.",
        );
    });
});
```

- [ ] **Step 3: Run tests, expect failure on the new ones**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun test tests/services/brand.service.test.ts 2>&1 | tail -10
```

Expected: 8 existing pass (now using projectId), 2 new fail (the throw assertions). The "1-per-project" test should already pass because the existing service code already throws that exact error. So expected: `9 pass, 2 fail` — verify which ones fail before proceeding.

The 2 failing should be:
- "throws when projectId is missing"
- "throws even when input.projectId is an empty string"

If a different test fails, investigate.

- [ ] **Step 4: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/tests/services/brand.service.test.ts
git commit -m "test(brand): require projectId in service tests + add failing contract tests"
```

---

## Task 4: Implement the BrandService change — drop fallback, add guard

**Files:**
- Modify: `backend/src/services/brand.service.ts:26-65`

- [ ] **Step 1: Replace the `create` method**

Replace the existing `create` method in `backend/src/services/brand.service.ts` with:

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
        // P2002 on (project_id, slug) fires when an archived brand with the
        // same slug still sits in this project (archivedAt doesn't nullify
        // the unique constraint), or when a rapid double-submit races past
        // projectHasBrand. Surface a clear 400 so the UI can show a useful
        // message instead of a generic 500.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
            throw new Error(
                "A brand with this name is already in this project — possibly in Workspace Settings → Trash. Restore it, permanently delete it from Trash, or pick a different name.",
            );
        }
        throw e;
    }
}
```

The `findDefaultProjectId` repository method becomes unused by this service. Leave it in place — it's defined in the interface and removing it is out of scope per the spec.

- [ ] **Step 2: Run tests, expect all pass**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun test tests/services/brand.service.test.ts 2>&1 | tail -5
```

Expected: `11 pass, 0 fail`.

- [ ] **Step 3: Run the full test suite for regression**

```bash
bun test 2>&1 | tail -5
```

Expected: similar to baseline (~212 pass / 1 fail; the 1 fail is the pre-existing `chat.service.test.ts apply_plan_edit` test, unrelated). Other tests that consumed `brandService.create` MAY need updating if any pass workspaceId-only without projectId. If new failures appear, surface them — most likely a job test or an integration test that sets up a brand. Investigate before proceeding.

- [ ] **Step 4: Type-check**

```bash
bunx tsc --noEmit 2>&1 | grep -E "brand\.service" || echo "NO_BRAND_SERVICE_ERRORS"
```

Expected: `NO_BRAND_SERVICE_ERRORS`.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/brand.service.ts
git commit -m "feat(brand): require explicit projectId on create (no Default fallback)"
```

---

## Task 5: Add route-level projectId validation

**Files:**
- Modify: `backend/src/routes/brand.route.ts:29-44`

Defense-in-depth: the route returns 400 before invoking the service. The service throw is the second line of defense; the route check is the first and gives a clean 400 response shape that the frontend already handles.

- [ ] **Step 1: Update the POST handler**

In `backend/src/routes/brand.route.ts`, replace the POST `/` handler with:

```ts
// POST / — create brand
app.post("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const body = await c.req.json();
    const { name, slug, category, websiteUrl, projectId, language } = body;
    if (!name || !slug) {
        return c.json({ error: "Name and slug are required" }, 400);
    }
    if (!projectId || typeof projectId !== "string") {
        return c.json(
            {
                error:
                    "projectId is required — pick or create a project before creating a brand",
            },
            400,
        );
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

- [ ] **Step 2: Type-check + run tests**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -E "brand\.route" || echo "NO_BRAND_ROUTE_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_BRAND_ROUTE_ERRORS` and the same test pass count as before.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/routes/brand.route.ts
git commit -m "feat(brand): return 400 from create endpoint when projectId is missing"
```

---

## Task 6: Schema change — non-null projectId + Restrict cascade

**Files:**
- Modify: `backend/prisma/schema.prisma:127-156`

After Tasks 1–2 backfilled the data, the DB column has zero nulls. Now make the schema match.

- [ ] **Step 1: Edit the schema**

In `backend/prisma/schema.prisma`, find the `Brand` model (around line 127). Change:

```diff
   id                   String    @id @default(uuid())
   workspaceId          String    @map("workspace_id")
-  // Nullable until the RBAC migration backfills every brand into the
-  // workspace's default project. Code paths treat `null` = "default project".
-  projectId            String?   @map("project_id")
+  projectId            String    @map("project_id")
   name                 String
   ...
   workspace          Workspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
-  project            Project?             @relation(fields: [projectId], references: [id], onDelete: SetNull)
+  project            Project              @relation(fields: [projectId], references: [id], onDelete: Restrict)
```

`onDelete: Restrict` blocks deleting a project while it owns a live brand. This matches the "1 brand per project, project is the container" mental model. The current `SetNull` was a leftover from the nullable era.

- [ ] **Step 2: Push the schema and regenerate the Prisma client**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma db push
bunx prisma generate
```

Expected from `prisma db push`: `🚀  Your database is now in sync with your Prisma schema.` No data loss warnings — Tasks 1–2 already backfilled. If you see "All non-null violations" or a confirmation prompt about losing data, STOP — the data state is wrong; investigate.

Expected from `prisma generate`: `✔ Generated Prisma Client (v7.8.0) ...`.

- [ ] **Step 3: Verify the column is NOT NULL in Postgres**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "\d brands" | grep project_id
```

Expected: `project_id | text | not null` (or similar with the `not null` constraint visible).

- [ ] **Step 4: Verify the FK action is RESTRICT**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT conname, confdeltype FROM pg_constraint WHERE conname LIKE 'brands_project_id_fkey%';"
```

Expected: `confdeltype = r` (Restrict). Codes: `a` = NoAction, `r` = Restrict, `c` = Cascade, `n` = SetNull, `d` = SetDefault.

- [ ] **Step 5: Type-check + tests**

```bash
cd backend && set -a && source .env && set +a
bunx tsc --noEmit 2>&1 | grep -E "brand" || echo "NO_BRAND_ERRORS"
bun test 2>&1 | tail -5
```

Expected: `NO_BRAND_ERRORS` and the test pass count unchanged.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma
git commit -m "feat(brand): make Brand.projectId non-null with Restrict cascade"
```

---

## Task 7: Frontend — disable "Create Brand" button + update copy

**Files:**
- Modify: `frontend/src/pages/BrandsPage.tsx:308-336`

- [ ] **Step 1: Locate the empty-state block**

```bash
grep -n "Create Brand\|navigate(\"/brands/new\")" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/BrandsPage.tsx
```

Expected hits: line 328 (the navigate call inside the empty-state's button), and possibly other "+ New Brand" affordances elsewhere on the page.

- [ ] **Step 2: Update the empty state**

In `frontend/src/pages/BrandsPage.tsx`, replace the empty-state copy + button (lines 313–332) with:

```tsx
<div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-10 text-center mt-12">
  <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
    <Palette size={24} />
  </div>
  <div className="flex items-center justify-center gap-2 mb-2">
    <h1 className="text-2xl font-semibold text-gray-900">
      {activeProject ? "Set up this project's brand" : "Pick a project first"}
    </h1>
    <HelpButton pageKey="brands" />
  </div>
  <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
    {activeProject
      ? `Your brand brain powers every generated topic and post. ${activeProject.name} doesn't have a brand yet — create one to get started.`
      : "Pick a project from the sidebar (or create a new one) to add a brand."}
  </p>
  <Button
    onClick={() => navigate("/brands/new")}
    disabled={!activeProject}
    title={!activeProject ? "Select or create a project from the sidebar first" : undefined}
  >
    <Sparkles size={14} className="mr-1.5" />
    Create Brand
  </Button>
</div>
```

The `Button` component supports `disabled` (verify by looking at `frontend/src/components/ui/Button.tsx` if unsure — it's a standard HTML button wrapper).

- [ ] **Step 3: Find any other "+ New Brand" entry points on the page and gate them**

```bash
grep -n "/brands/new\|New Brand\|Create Brand" /Users/bellinnn/Documents/projects/fce/frontend/src/pages/BrandsPage.tsx
```

If any additional buttons or links exist beyond the one updated above, gate them the same way (`disabled={!activeProject}` + `title` tooltip).

- [ ] **Step 4: Type-check + lint**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
npm run typecheck 2>&1 | tail -5
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/BrandsPage.tsx
git commit -m "feat(brand): disable Create Brand button when no project is selected"
```

---

## Task 8: Frontend — guard `NewBrandPage` against direct-URL access without an active project

**Files:**
- Modify: `frontend/src/pages/NewBrandPage.tsx`

If a user types `/brands/new` directly in the URL (or follows a stale link) with no `activeProject` in context, the form previously rendered with a `projectId` of `undefined` and the user's submit went to the backend with no projectId → backend silently used Default. Now, redirect to `/brands` so the user sees the "pick a project first" empty state from Task 7.

- [ ] **Step 1: Add the redirect guard**

Edit `frontend/src/pages/NewBrandPage.tsx`. Add a `useEffect` import and a redirect effect after the `activeProject` is read.

Replace the imports block at the top:

```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
import {
  BrandBrainForm,
  type BrandBrainFormHandle,
} from "../components/brands/BrandBrainForm";
```

Then, inside the `NewBrandPage` component, after the `useProject()` line, add the guard. The full component head becomes:

```tsx
export function NewBrandPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();

  const formRef = useRef<BrandBrainFormHandle>(null);
  const [saving, setSaving] = useState(false);
  const [scrapingBanner, setScrapingBanner] = useState<ReactNode>(null);

  // Redirect: this page requires a selected project. The Create Brand
  // button on /brands is disabled when activeProject is null, but the
  // user can still arrive here via direct URL or a stale browser tab.
  useEffect(() => {
    if (!activeProject) {
      navigate("/brands", { replace: true });
    }
  }, [activeProject, navigate]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Pick a workspace to create a brand.</p>
      </div>
    );
  }

  if (!activeProject) {
    // The effect above will redirect on next tick. Render nothing in
    // the meantime to avoid flashing the form with no project.
    return null;
  }

  return (
    // ... existing JSX, unchanged ...
  );
}
```

The rest of the JSX (lines 37–95 in the original) stays exactly the same — `projectId={activeProject?.id}` works because we've now guaranteed `activeProject` is non-null when the form renders. (You can leave the `?.` in place; it's redundant now but harmless.)

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
npm run typecheck 2>&1 | tail -5
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/NewBrandPage.tsx
git commit -m "feat(brand): redirect /brands/new to /brands when no project is active"
```

---

## Task 9: Manual smoke test

**Files:**
- No file changes — this task is verification only.

- [ ] **Step 1: Restart the backend so all the changes are live**

If a backend dev server is running, kill it. Then:

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bun run --hot src/index.ts
```

Watch for clean startup logs. No "uncaught" errors related to brand or project.

- [ ] **Step 2: Restart the frontend dev server**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
npm run dev
```

- [ ] **Step 3: Smoke — disabled button when no project**

In the browser:
1. Open the app, sign in.
2. From the sidebar's project switcher, pick "No project" (or whatever the equivalent unselected state is — if the switcher always has SOMETHING selected, you may need to add a way to clear or simply test by joining a workspace where you have no project membership).
3. Navigate to `/brands`.
4. **Expected:** the empty state reads "Pick a project first" and the Create Brand button is disabled. Hovering the button shows the tooltip "Select or create a project from the sidebar first".

- [ ] **Step 4: Smoke — direct URL redirect**

While still in the no-project state:
1. Type `http://localhost:5173/brands/new` directly into the URL bar and press Enter.
2. **Expected:** the URL bounces back to `/brands` and the empty state from Step 3 is shown.

- [ ] **Step 5: Smoke — happy path (project selected)**

1. Pick a project from the sidebar.
2. Navigate to `/brands`. The empty state now reads "Set up this project's brand" and the Create Brand button is enabled.
3. Click Create Brand → fill in name + slug → save.
4. **Expected:** brand created, navigated back to `/brands` showing the new brand.

- [ ] **Step 6: Smoke — 1-per-project enforcement**

Still in the same project where you just created a brand:
1. Try to create another brand (the UI may not surface this naturally if it knows the project is full; in that case skip and rely on the `projectHasBrand` test from Task 3).
2. **Expected:** error message "This project already has a brand. Each project can contain only one brand — create a new project to add another."

- [ ] **Step 7: Smoke — `onDelete: Restrict` (manual via Prisma Studio)**

```bash
cd /Users/bellinnn/Documents/projects/fce/backend
set -a && source .env && set +a
bunx prisma studio
```

In Prisma Studio:
1. Open the `Project` table.
2. Pick a project that has a live brand (the one you just created in Step 5).
3. Try to delete it.
4. **Expected:** Prisma surfaces an FK violation referencing `Brand`. The project is NOT deleted.

This confirms the schema-level Restrict is in place. Acceptable to skip if Prisma Studio isn't installed locally — the partial unique index check in Task 2 is a separate guarantee.

- [ ] **Step 8: No commit (verification only)**

If anything fails any step, return to the relevant task and fix.

---

## Self-Review

**Spec coverage check:**

| Spec section | Task |
|---|---|
| Schema change (non-null + Restrict) | Task 6 |
| Service drops Default fallback + adds guard | Task 4 |
| Route projectId validation | Task 5 |
| Backfill script for null-projectId brands | Task 1 |
| Existing partial-unique migration runs | Task 2 |
| Service tests updated to provide projectId | Task 3 |
| New tests for "throws when projectId missing" | Task 3 |
| Frontend BrandsPage gate + copy | Task 7 |
| Frontend NewBrandPage redirect guard | Task 8 |
| Manual smoke test | Task 9 |
| Default project stays as auto-created starter | Implicit (no task removes it; Task 4 removes only the *fallback* in the service) |

All spec sections covered.

**Type / name consistency check:**
- `projectId` is the field name everywhere (DB column `project_id`, TS field `projectId`).
- The error string "projectId is required — pick or create a project before creating a brand" appears identically in: Task 3 tests (asserted), Task 4 service (thrown), Task 5 route (returned in 400 body). Verified consistent.
- The 1-per-project error string is the same across the existing service code (which the spec already preserves), Task 3 tests, and Task 4's replacement (which keeps the same message). Verified consistent.

**Placeholder scan:** No "TBD", "TODO", or "implement later" in any task. Every code step has full code.

**Scope check:** Single focused work surface (Brand creation requires Project). No subsystem decomposition needed.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-project-required-for-brand.md](2026-04-30-project-required-for-brand.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
