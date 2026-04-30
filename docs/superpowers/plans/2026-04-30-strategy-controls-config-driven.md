# Strategy Controls — Config-Driven Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Framework / Hook Type / Tone Preset / Visual Style taxonomies from DB-backed admin-managed tables into a static config module, drop the Prisma models, remove the admin CRUD UI/routes, and fix two latent bugs in `GeneratePage` submission while we're in there.

**Architecture:** New `backend/src/config/strategy-controls.ts` exports four readonly arrays of `{id, name, description}`. The `/api/taxonomy/*` endpoints read directly from those arrays — no service layer. Admin UI loses four tabs; backend loses ~6 routes, an entire service, a repository, two interface files, and four Prisma models. Frontend `GeneratePage` gains correct dropdown labels and stops dropping `tonePreset`/`visualStyle` on submission.

**Tech Stack:** Bun runtime, Hono, Prisma 7 (drop-only), TypeScript strict, React 19 + Vite. Tests via `bun test`.

**Spec:** [docs/superpowers/specs/2026-04-30-strategy-controls-taxonomy-seed-design.md](docs/superpowers/specs/2026-04-30-strategy-controls-taxonomy-seed-design.md)

---

## File Plan

### Backend

- **Create** `backend/src/config/strategy-controls.ts` — four readonly arrays + a `StrategyControlItem` type. The single source of truth.
- **Rewrite** `backend/src/routes/taxonomy.route.ts` — `createTaxonomyRoutes()` takes no args, reads config arrays directly.
- **Modify** `backend/src/index.ts` — drop `TaxonomyRepository` / `TaxonomyService` imports + wiring; call `createTaxonomyRoutes()` with no args.
- **Modify** `backend/src/services/admin.service.ts` — delete `createTaxonomyItem`, `updateTaxonomyItem`, `deleteTaxonomyItem`, `getModel`, `TAXONOMY_ENTITY_TYPE`.
- **Modify** `backend/src/interfaces/services/admin.service.interface.ts` — drop the three taxonomy method signatures.
- **Modify** `backend/src/routes/admin.route.ts` — drop the taxonomy CRUD route block.
- **Modify** `backend/prisma/schema.prisma` — delete the four model declarations.
- **Modify** `backend/prisma/seed.ts` — delete the four taxonomy arrays + their upsert loops; leave a stub `main()`.
- **Delete** `backend/src/services/taxonomy.service.ts`
- **Delete** `backend/src/repositories/taxonomy.repository.ts`
- **Delete** `backend/src/interfaces/services/taxonomy.service.interface.ts`
- **Delete** `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`
- **Delete** `backend/tests/services/taxonomy.service.test.ts`
- **Modify** `backend/tests/services/admin.service.audit.test.ts` — drop the three `taxonomy.create/update/delete` tests.
- **Create** `backend/tests/routes/taxonomy.route.test.ts` — regression test that each endpoint returns the expected count + first-item slug.

### Frontend

- **Modify** `frontend/src/pages/AdminPage.tsx` — drop four tabs, taxonomy state, fetch path, mutation handlers, render block, modal; update subtitle.
- **Modify** `frontend/src/pages/GeneratePage.tsx` — Output Length labels (3), placeholders (3), submission body keys + default fallbacks (4 lines).

---

## Pre-flight

- [ ] **Step 0: Confirm clean working tree on main**

```bash
cd /Users/bellinnn/Documents/projects/fce
git status
```

Expected: working tree may have unrelated modifications to `.claude/settings.local.json`, `backend/Makefile`, `docs/notes.md` (existing pre-session edits) — those are fine. No staged changes pending. Branch is `main`.

If you want isolation, create a worktree per the user's earlier preference; otherwise work on a feature branch:

```bash
git checkout -b feat/strategy-controls-config
```

---

## Task 1: Backend config module + route rewrite + regression test

**Files:**
- Create: `backend/src/config/strategy-controls.ts`
- Modify: `backend/src/routes/taxonomy.route.ts` (full rewrite)
- Modify: `backend/src/index.ts:90` (import — unchanged), `backend/src/index.ts:744-745` (call site — drop arg)
- Create: `backend/tests/routes/taxonomy.route.test.ts`

This task is the additive core: the new code path works end-to-end and returns the canonical lists. The old `TaxonomyService` / `TaxonomyRepository` are now orphaned but still compile; they get deleted in Task 2.

- [ ] **Step 1: Create `backend/src/config/strategy-controls.ts`**

```ts
// Centralised taxonomy for Content Generator → Advanced strategy controls.
// Edit this file (not the database) to add, rename, or remove items.

export interface StrategyControlItem {
	id: string;        // stable slug; persisted into GenerationRequest text columns
	name: string;      // display label
	description: string;
}

export const FRAMEWORKS: readonly StrategyControlItem[] = [
	{ id: "aida", name: "AIDA", description: "Attention, Interest, Desire, Action" },
	{ id: "pas", name: "PAS", description: "Problem, Agitate, Solution" },
	{ id: "bab", name: "BAB", description: "Before, After, Bridge" },
	{ id: "4c", name: "4C", description: "Clear, Concise, Compelling, Credible" },
	{ id: "fab", name: "FAB", description: "Features, Advantages, Benefits" },
	{ id: "problem-solution", name: "Problem-Solution", description: "Identify a problem, then present the solution" },
	{ id: "storytelling", name: "Storytelling", description: "Lead with a narrative arc" },
	{ id: "listicle", name: "Listicle", description: "Numbered or bulleted breakdown" },
	{ id: "educational-breakdown", name: "Educational breakdown", description: "Teach a concept step-by-step" },
	{ id: "soft-selling", name: "Soft selling", description: "Indirect, value-led pitch" },
	{ id: "hard-selling", name: "Hard selling", description: "Direct, conversion-focused pitch" },
];

export const HOOK_TYPES: readonly StrategyControlItem[] = [
	{ id: "curiosity-hook", name: "Curiosity hook", description: "Spark curiosity with unexpected questions or facts" },
	{ id: "pain-point-hook", name: "Pain point hook", description: "Address a specific pain point the audience experiences" },
	{ id: "data-stat-hook", name: "Data/stat hook", description: "Open with a striking statistic or data point" },
	{ id: "bold-statement-hook", name: "Bold statement hook", description: "Make a bold, attention-grabbing statement" },
	{ id: "contrarian-hook", name: "Contrarian hook", description: "Take a counter-intuitive or against-the-grain stance" },
	{ id: "trend-culture-hook", name: "Trend/culture hook", description: "Anchor the post to a current trend or cultural moment" },
	{ id: "relatable-insight-hook", name: "Relatable insight hook", description: "Voice a thought the audience already has" },
	{ id: "question-hook", name: "Question hook", description: "Open with a direct question to the reader" },
	{ id: "urgency-hook", name: "Urgency hook", description: "Create time pressure or fear of missing out" },
	{ id: "how-to-hook", name: "How-to hook", description: "Promise a tactical, actionable outcome" },
];

export const TONE_PRESETS: readonly StrategyControlItem[] = [
	{ id: "playful-bold", name: "Playful-Bold", description: "Fun and witty with a confident edge" },
	{ id: "warm-expert", name: "Warm-Expert", description: "Approachable but authoritative" },
	{ id: "direct-urgent", name: "Direct-Urgent", description: "Punchy, action-oriented, time-pressured" },
	{ id: "soft-emphatic", name: "Soft-Emphatic", description: "Gentle, reassuring, emotionally resonant" },
];

export const VISUAL_STYLES: readonly StrategyControlItem[] = [
	{ id: "editorial", name: "Editorial", description: "Magazine-quality, considered composition and typography" },
	{ id: "lifestyle", name: "Lifestyle", description: "Aspirational, real-life scenarios, relatable" },
	{ id: "minimal", name: "Minimal", description: "Clean, simple, lots of white space" },
	{ id: "energetic", name: "Energetic", description: "Strong colors, high contrast, motion-forward" },
	{ id: "luxury", name: "Luxury", description: "Sophisticated, refined, premium feel" },
	{ id: "raw-authentic", name: "Raw/Authentic", description: "Documentary, unpolished, candid" },
];
```

- [ ] **Step 2: Rewrite `backend/src/routes/taxonomy.route.ts`**

Replace the entire file with:

```ts
import { Hono } from "hono";
import {
	FRAMEWORKS,
	HOOK_TYPES,
	TONE_PRESETS,
	VISUAL_STYLES,
} from "../config/strategy-controls";

export function createTaxonomyRoutes() {
	const app = new Hono();

	app.get("/frameworks", (c) => c.json({ data: FRAMEWORKS }));
	app.get("/hook-types", (c) => c.json({ data: HOOK_TYPES }));
	app.get("/tone-presets", (c) => c.json({ data: TONE_PRESETS }));
	app.get("/visual-styles", (c) => c.json({ data: VISUAL_STYLES }));

	return app;
}
```

- [ ] **Step 3: Update the call site in `backend/src/index.ts`**

Find lines 744–745 (currently):

```ts
	// Taxonomy routes (auth protected, no workspace scoping)
	app.route("/api/taxonomy", createTaxonomyRoutes(taxonomyService));
```

Change to:

```ts
	// Taxonomy routes (auth protected, no workspace scoping)
	app.route("/api/taxonomy", createTaxonomyRoutes());
```

Leave the `TaxonomyService` and `TaxonomyRepository` imports + instantiations at lines 64, 121, 164, 270 alone for now — Task 2 deletes them.

- [ ] **Step 4: Create regression test `backend/tests/routes/taxonomy.route.test.ts`**

```ts
import { describe, expect, it } from "bun:test";
import { createTaxonomyRoutes } from "../../src/routes/taxonomy.route";

describe("taxonomy routes", () => {
	const app = createTaxonomyRoutes();

	it("GET /frameworks returns 11 items, first is AIDA", async () => {
		const res = await app.request("/frameworks");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(11);
		expect(body.data[0]).toMatchObject({ id: "aida", name: "AIDA" });
	});

	it("GET /hook-types returns 10 items, first is Curiosity hook", async () => {
		const res = await app.request("/hook-types");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(10);
		expect(body.data[0]).toMatchObject({ id: "curiosity-hook", name: "Curiosity hook" });
	});

	it("GET /tone-presets returns 4 items, first is Playful-Bold", async () => {
		const res = await app.request("/tone-presets");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(4);
		expect(body.data[0]).toMatchObject({ id: "playful-bold", name: "Playful-Bold" });
	});

	it("GET /visual-styles returns 6 items, first is Editorial", async () => {
		const res = await app.request("/visual-styles");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(6);
		expect(body.data[0]).toMatchObject({ id: "editorial", name: "Editorial" });
	});
});
```

- [ ] **Step 5: Typecheck the backend**

```bash
cd backend
bunx tsc --noEmit
```

Expected: 0 errors. (TaxonomyService still compiles because we haven't deleted it yet.)

- [ ] **Step 6: Run the new test**

```bash
cd backend
bun test tests/routes/taxonomy.route.test.ts
```

Expected: 4 pass, 0 fail.

- [ ] **Step 7: Run the full backend test suite**

```bash
cd backend
bun test
```

Expected: all tests pass. The existing `tests/services/taxonomy.service.test.ts` should still pass — it's testing the orphaned service, not the route.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/config/strategy-controls.ts \
        backend/src/routes/taxonomy.route.ts \
        backend/src/index.ts \
        backend/tests/routes/taxonomy.route.test.ts
git commit -m "feat(backend): source strategy taxonomy from config

Move framework/hook-type/tone-preset/visual-style values into
src/config/strategy-controls.ts and have the existing /api/taxonomy/*
routes read directly from it. The TaxonomyService + repository are
now orphaned and deleted in a follow-up commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Delete orphaned taxonomy service / repository / interfaces / test

**Files:**
- Delete: `backend/src/services/taxonomy.service.ts`
- Delete: `backend/src/repositories/taxonomy.repository.ts`
- Delete: `backend/src/interfaces/services/taxonomy.service.interface.ts`
- Delete: `backend/src/interfaces/repositories/taxonomy.repository.interface.ts`
- Delete: `backend/tests/services/taxonomy.service.test.ts`
- Modify: `backend/src/index.ts` (lines 64, 121, 164, 270 — drop imports + wiring)

- [ ] **Step 1: Delete the four backend source files**

```bash
cd /Users/bellinnn/Documents/projects/fce
rm backend/src/services/taxonomy.service.ts
rm backend/src/repositories/taxonomy.repository.ts
rm backend/src/interfaces/services/taxonomy.service.interface.ts
rm backend/src/interfaces/repositories/taxonomy.repository.interface.ts
rm backend/tests/services/taxonomy.service.test.ts
```

- [ ] **Step 2: Edit `backend/src/index.ts` — remove the 4 affected lines**

Remove these specific lines:

- Line ~64: `import { TaxonomyRepository } from "./repositories/taxonomy.repository";`
- Line ~121: `import { TaxonomyService } from "./services/taxonomy.service";`
- Line ~164: `const taxonomyRepository = new TaxonomyRepository(prisma);`
- Line ~270: `const taxonomyService = new TaxonomyService(taxonomyRepository);`

(Use the `Edit` tool with each line as the `old_string` to be deleted. Line numbers may have shifted slightly after Task 1 — re-read to confirm before editing.)

- [ ] **Step 3: Typecheck**

```bash
cd backend
bunx tsc --noEmit
```

Expected: 0 errors. No remaining references to `TaxonomyService` or `TaxonomyRepository`.

- [ ] **Step 4: Sanity-check no lingering references**

```bash
cd /Users/bellinnn/Documents/projects/fce
grep -rn "TaxonomyService\|TaxonomyRepository\|taxonomy.service\|taxonomy.repository" backend/src backend/tests
```

Expected: no matches.

- [ ] **Step 5: Run the full backend test suite**

```bash
cd backend
bun test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add -A backend/src/services/taxonomy.service.ts \
           backend/src/repositories/taxonomy.repository.ts \
           backend/src/interfaces/services/taxonomy.service.interface.ts \
           backend/src/interfaces/repositories/taxonomy.repository.interface.ts \
           backend/tests/services/taxonomy.service.test.ts \
           backend/src/index.ts
git commit -m "refactor(backend): delete orphaned taxonomy service/repository

Now that /api/taxonomy/* reads from config, the service+repo+interfaces
have no callers. Drop them and their service test.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Strip taxonomy CRUD from admin

**Files:**
- Modify: `backend/src/services/admin.service.ts:265-357` (delete the three CRUD methods + `getModel` + `TAXONOMY_ENTITY_TYPE`)
- Modify: `backend/src/interfaces/services/admin.service.interface.ts:29-44` (delete the three signatures)
- Modify: `backend/src/routes/admin.route.ts:105-134` (delete the CRUD route block)
- Modify: `backend/tests/services/admin.service.audit.test.ts:230-296` (delete the three taxonomy.* test blocks)

- [ ] **Step 1: Edit `backend/src/services/admin.service.ts`**

Delete the block from `async createTaxonomyItem(` through the end of `getModel(...)` — that's roughly lines 265–357 (the three async methods, the `TAXONOMY_ENTITY_TYPE` static field, and the `getModel` private method). The closing `}` of the `AdminService` class should remain.

After removal, the tail of the class should look like (ending after `listAuditLogs`):

```ts
	async listAuditLogs(workspaceId?: string, limit?: number) {
		return this.prisma.auditLog.findMany({
			// ...existing body...
		});
	}
}
```

(Re-read lines around the area before editing to confirm exact boundaries.)

- [ ] **Step 2: Edit `backend/src/interfaces/services/admin.service.interface.ts`**

Delete lines 29–44, leaving the interface as:

```ts
export interface IAdminService {
	listUsers(): Promise<any[]>;
	createUser(
		actingUserId: string,
		input: { email: string; password: string; fullName?: string; isSuperadmin?: boolean },
	): Promise<any>;
	updateUser(
		actingUserId: string,
		userId: string,
		data: { fullName?: string; status?: string; isSuperadmin?: boolean; email?: string },
	): Promise<any>;
	deleteUser(actingUserId: string, userId: string): Promise<void>;
	resetPassword(actingUserId: string, userId: string, newPassword: string): Promise<void>;
	listUserWorkspaces(userId: string): Promise<
		Array<{ workspaceId: string; workspaceName: string; workspaceSlug: string; role: string }>
	>;
	setUserWorkspaceRole(
		actingUserId: string,
		userId: string,
		workspaceId: string,
		role: "admin" | "member",
	): Promise<void>;
	removeUserFromWorkspace(
		actingUserId: string,
		userId: string,
		workspaceId: string,
	): Promise<void>;
	listAuditLogs(workspaceId?: string, limit?: number): Promise<any[]>;
}
```

- [ ] **Step 3: Edit `backend/src/routes/admin.route.ts`**

Delete lines 105–134 (the `taxonomyTypes` array, the `typeMap`, and the `for` loop with three `app.post` / `app.patch` / `app.delete` registrations).

After the edit, the section that previously held audit-logs + taxonomy should end with:

```ts
	app.get("/audit-logs", async (c) => {
		const workspaceId = c.req.query("workspaceId");
		const limit = parseInt(c.req.query("limit") || "50");
		const logs = await adminService.listAuditLogs(workspaceId || undefined, limit);
		return c.json({ data: logs });
	});

	return app;
}
```

- [ ] **Step 4: Edit `backend/tests/services/admin.service.audit.test.ts`**

Delete the three `it("emits taxonomy.create…")`, `it("emits taxonomy.update…")`, `it("emits taxonomy.delete…")` blocks at lines 230–296. The test file structure (imports, `createMockAudit`, the surrounding `describe` block) stays.

- [ ] **Step 5: Typecheck**

```bash
cd backend
bunx tsc --noEmit
```

Expected: 0 errors. (`AdminService` no longer references the four Prisma models.)

- [ ] **Step 6: Run admin audit tests**

```bash
cd backend
bun test tests/services/admin.service.audit.test.ts
```

Expected: pass — the three taxonomy tests are gone; the rest still pass.

- [ ] **Step 7: Run full backend tests**

```bash
cd backend
bun test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/src/services/admin.service.ts \
        backend/src/interfaces/services/admin.service.interface.ts \
        backend/src/routes/admin.route.ts \
        backend/tests/services/admin.service.audit.test.ts
git commit -m "refactor(backend): drop admin CRUD for taxonomy types

Framework/hook-type/tone-preset/visual-style are now config-driven, so
the admin service methods, interface signatures, route handlers, and
audit-emit tests for them go away.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Drop Prisma taxonomy models + clean seed

**Files:**
- Modify: `backend/prisma/schema.prisma:340-374` (delete the four models)
- Modify: `backend/prisma/seed.ts` (delete the four taxonomy arrays + their loops)
- Run: `bunx prisma db push` to drop the underlying tables, then `bunx prisma generate`

- [ ] **Step 1: Edit `backend/prisma/schema.prisma`**

Delete lines 338–374, which is the `// ─── Taxonomy ────…` comment header through the closing brace of `model VisualStyle`. The next section header (`// ─── Campaign System ───…`) starts immediately after — leave it.

- [ ] **Step 2: Rewrite `backend/prisma/seed.ts` to a stub**

Replace the entire file with:

```ts
// Database seed entrypoint. Strategy taxonomies (framework/hook-type/
// tone-preset/visual-style) used to live here but moved to
// src/config/strategy-controls.ts. Currently nothing to seed; keep
// the file as the entrypoint for future seed work.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
	console.log("Seed: nothing to do.");
}

main()
	.catch((e) => {
		console.error("Seed failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
```

- [ ] **Step 3: Push the schema change to the database**

```bash
cd backend
set -a && source .env && set +a
bunx prisma db push
```

Expected output: includes lines like

```
- Drop the table `frameworks`
- Drop the table `hook_types`
- Drop the table `tone_presets`
- Drop the table `visual_styles`
```

Confirm with `y` if Prisma prompts ("Yes" to drop the tables — they have 0 rows in this env).

- [ ] **Step 4: Regenerate Prisma client**

```bash
cd backend
bunx prisma generate
```

Expected: "Generated Prisma Client … in N ms".

- [ ] **Step 5: Verify nothing references the removed Prisma models**

```bash
cd /Users/bellinnn/Documents/projects/fce
grep -rn "prisma\.framework\b\|prisma\.hookType\b\|prisma\.tonePreset\b\|prisma\.visualStyle\b" backend/src backend/tests
```

Expected: no matches.

- [ ] **Step 6: Typecheck**

```bash
cd backend
bunx tsc --noEmit
```

Expected: 0 errors. (Prisma client no longer exports `Framework` / `HookType` / `TonePreset` / `VisualStyle` types — anything that imported them would now fail. The earlier tasks already removed those imports.)

- [ ] **Step 7: Run full backend tests**

```bash
cd backend
bun test
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add backend/prisma/schema.prisma backend/prisma/seed.ts
git commit -m "feat(backend): drop framework/hook_type/tone_preset/visual_style tables

These taxonomies now live in src/config/strategy-controls.ts. Drop the
Prisma models so the schema reflects reality. \`prisma db push\` drops
the four DB tables (zero rows in any environment that reaches here).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Remove taxonomy tabs from Admin Panel

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`

After this task the Admin Panel renders only the Users and Audit Logs tabs.

- [ ] **Step 1: Edit `frontend/src/pages/AdminPage.tsx` — drop the tab definitions**

Replace lines 45–54 (`TABS` and `TAXONOMY_TABS`) with just:

```tsx
const TABS = [
  { key: "users", label: "Users" },
  { key: "audit-logs", label: "Audit Logs" },
];
```

- [ ] **Step 2: Drop taxonomy state, fetch logic, mutation handlers, and the unused `TaxonomyItem` interface**

Replace lines 28–33 (the `interface TaxonomyItem { … }` block) — delete the entire block.

In the component body, delete:
- Line 60: `const [taxonomyItems, setTaxonomyItems] = useState<TaxonomyItem[]>([]);`
- Lines 63–65: `showAddModal`, `newName`, `newDescription` state.
- Lines 98–101: the `} else if (TAXONOMY_TABS.includes(tab)) { … }` branch in `fetchData`.
- Lines 113–136: `handleAddTaxonomy` and `handleDeleteTaxonomy`.

After cleanup, `fetchData` should look like:

```tsx
const fetchData = async (tab: string) => {
  setLoading(true);
  try {
    if (tab === "users") {
      const data = await api<AdminUser[]>("/api/admin/users");
      setUsers(data);
    } else if (tab === "audit-logs") {
      const data = await api<AuditLogEntry[]>("/api/admin/audit-logs");
      setAuditLogs(data);
    }
  } catch {
    // Silent fail - empty state will show
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 3: Drop the taxonomy render block + the Modal**

In `renderContent`, delete the `if (TAXONOMY_TABS.includes(activeTab)) { … }` block (lines 236–270).

In the JSX returned by the component, delete the entire `<Modal isOpen={showAddModal} … />` block (lines ~313–336). The closing `</div>` at line 337 stays.

- [ ] **Step 4: Drop unused imports**

After Steps 2–3, these imports are no longer used:
- `Plus`, `Trash2` (from `lucide-react`) — used only by taxonomy UI.
- `Modal` (from `../components/ui/Modal`) — only the taxonomy add-item modal used it.
- `Input` (from `../components/ui/Input`) — only used in the add-item modal.

Update line 2 to: `import { ShieldOff, UserPlus } from "lucide-react";` and delete the `Modal` and `Input` import lines.

- [ ] **Step 5: Update the page subtitle**

Change line ~281 from:

```tsx
            Manage users, taxonomy data, and view audit logs.
```

to:

```tsx
            Manage users and view audit logs.
```

- [ ] **Step 6: Frontend typecheck**

```bash
cd frontend
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Frontend lint**

```bash
cd frontend
npm run lint
```

Expected: 0 errors. (No-unused-vars on `Plus` / `Trash2` / `Modal` / `Input` / `TaxonomyItem` would catch a missed cleanup — fix any flagged.)

- [ ] **Step 8: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/AdminPage.tsx
git commit -m "feat(frontend): remove taxonomy tabs from Admin Panel

Frameworks/Hook Types/Tone Presets/Visual Styles tabs and their
add-item modal are gone — those taxonomies are config-driven now.
Admin Panel keeps only Users and Audit Logs.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Generate page — Output Length labels, placeholders, body keys, defaults

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx:316-321` (Output Length labels)
- Modify: `frontend/src/pages/GeneratePage.tsx:679-686` (submission body keys + default fallbacks)
- Modify: `frontend/src/pages/GeneratePage.tsx:719-722` (dropdown placeholders)

This task ships the cosmetic polish + the silent-drop bug fix for `tonePreset`/`visualStyle`.

- [ ] **Step 1: Update `OUTPUT_LENGTH_OPTIONS` (lines 316–321)**

Replace:

```tsx
const OUTPUT_LENGTH_OPTIONS = [
  { value: "", label: "Select Output Length" },
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];
```

with:

```tsx
const OUTPUT_LENGTH_OPTIONS = [
  { value: "", label: "Select Output Length" },
  { value: "short", label: "Short (caption)" },
  { value: "medium", label: "Medium (Post)" },
  { value: "long", label: "Long (Thread/Script)" },
];
```

- [ ] **Step 2: Fix submission body (lines 679–686)**

Replace:

```tsx
            framework: frameworkId || "PAS",
            hookType: hookTypeId || "curiosity",
            customPrompt: customPrompt.trim() || undefined,
            referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
              ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
              : undefined,
            tonePresetId: tonePresetId || undefined,
            visualStyleId: visualStyleId || undefined,
```

with:

```tsx
            framework: frameworkId || "aida",
            hookType: hookTypeId || "curiosity-hook",
            customPrompt: customPrompt.trim() || undefined,
            referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
              ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
              : undefined,
            tonePreset: tonePresetId || undefined,
            visualStyle: visualStyleId || undefined,
```

Two changes:
1. Default fallback strings are now slugs (`"aida"`, `"curiosity-hook"`) — consistent with the config and the placeholder labels ("Default (AIDA)", "Default (Curiosity)").
2. Body keys renamed `tonePresetId` → `tonePreset`, `visualStyleId` → `visualStyle` to match what [generation.route.ts:35-36](backend/src/routes/generation.route.ts#L35-L36) reads. Before this fix, those two fields silently never reached the AI prompt.

- [ ] **Step 3: Update placeholders (lines 719–722)**

Replace:

```tsx
const frameworkOptions = [{ value: "", label: "PAS (recommended)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
  const hookTypeOptions = [{ value: "", label: "Curiosity (recommended)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];
  const tonePresetOptions = [{ value: "", label: "Select Tone Variation" }, ...tonePresets.map((t) => ({ value: t.id, label: t.name }))];
  const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map((v) => ({ value: v.id, label: v.name }))];
```

with:

```tsx
const frameworkOptions = [{ value: "", label: "Default (AIDA)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
  const hookTypeOptions = [{ value: "", label: "Default (Curiosity)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];
  const tonePresetOptions = [{ value: "", label: "Default Brand Tone" }, ...tonePresets.map((t) => ({ value: t.id, label: t.name }))];
  const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map((v) => ({ value: v.id, label: v.name }))];
```

(The Visual Style placeholder is unchanged — there's no implicit brand-level default to call out.)

- [ ] **Step 4: Frontend typecheck**

```bash
cd frontend
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Frontend lint**

```bash
cd frontend
npm run lint
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/pages/GeneratePage.tsx
git commit -m "fix(frontend): polish strategy controls + restore tone/visual-style submission

- Output Length dropdown now shows 'Short (caption)' / 'Medium (Post)' /
  'Long (Thread/Script)' so users can map labels to formats.
- Framework/Hook Type empty-state placeholders read 'Default (AIDA)' and
  'Default (Curiosity)' instead of singling out one option as 'recommended'.
- Tone Variation placeholder reads 'Default Brand Tone' to make the
  brand-level fallback discoverable.
- Submission body keys for tonePreset/visualStyle were 'tonePresetId' /
  'visualStyleId' — but the backend reads 'tonePreset' / 'visualStyle'.
  Rename the body fields so user selections actually reach the AI prompt.
- Default fallbacks for framework/hookType are now slugs ('aida' /
  'curiosity-hook') consistent with src/config/strategy-controls.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: End-to-end verification

**No new files — manual smoke + cross-cutting checks.**

- [ ] **Step 1: Restart backend**

```bash
cd backend
bun run --hot src/index.ts
```

Expected: server starts on :3001, no errors. Leave it running in another terminal.

- [ ] **Step 2: Restart frontend**

```bash
cd frontend
npm run dev
```

Expected: Vite serves on :5173.

- [ ] **Step 3: Smoke — Admin Panel**

Open `http://localhost:5173/admin` as a superadmin. Confirm:
- Only **Users** and **Audit Logs** tabs visible. No Frameworks / Hook Types / Tone Presets / Visual Styles.
- Subtitle reads "Manage users and view audit logs."

- [ ] **Step 4: Smoke — Strategy controls dropdowns**

Open Content Generator → Advanced. Confirm:
- **Framework** placeholder reads `Default (AIDA)`; clicking the dropdown shows 11 items (AIDA, PAS, BAB, 4C, FAB, Problem-Solution, Storytelling, Listicle, Educational breakdown, Soft selling, Hard selling).
- **Hook Type** placeholder reads `Default (Curiosity)`; dropdown shows 10 items including "Curiosity hook", "Pain point hook", "Data/stat hook", "Bold statement hook", "Contrarian hook", "Trend/culture hook", "Relatable insight hook", "Question hook", "Urgency hook", "How-to hook".
- **Tone Variation** placeholder reads `Default Brand Tone`; dropdown shows 4 items: Playful-Bold, Warm-Expert, Direct-Urgent, Soft-Emphatic.
- **Visual Style** placeholder reads `Select Visual Style`; dropdown shows 6 items: Editorial, Lifestyle, Minimal, Energetic, Luxury, Raw/Authentic.
- **Output Length** dropdown shows: Short (caption), Medium (Post), Long (Thread/Script).

- [ ] **Step 5: Smoke — Tone & Visual Style actually reach the backend**

Pick an explicit Tone Variation (e.g. "Direct-Urgent") and Visual Style (e.g. "Editorial"). Submit a generation. Then:

```bash
cd backend
set -a && source .env && set +a
psql "$DATABASE_URL" -c "select tone_preset, visual_style from generation_requests order by created_at desc limit 1;"
```

Expected: `tone_preset` = `direct-urgent`, `visual_style` = `editorial`. (Before this PR, both columns would have been NULL because the frontend was sending `tonePresetId` / `visualStyleId`.)

- [ ] **Step 6: Smoke — defaults**

Submit another generation with all four strategy controls left at their default (empty) options. Check the row:

```bash
psql "$DATABASE_URL" -c "select framework, hook_type, tone_preset, visual_style from generation_requests order by created_at desc limit 1;"
```

Expected: `framework` = `aida`, `hook_type` = `curiosity-hook`, `tone_preset` = NULL, `visual_style` = NULL.

- [ ] **Step 7: Smoke — `/api/taxonomy/*` returns config data**

```bash
TOKEN=...  # paste a fresh access token from devtools or login flow
for path in frameworks hook-types tone-presets visual-styles; do
  echo "== $path =="
  curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3001/api/taxonomy/$path" | head -c 400
  echo
done
```

Expected: each response is `{"data":[...]}` with the canonical lists.

- [ ] **Step 8: Final lint & test gate**

```bash
cd /Users/bellinnn/Documents/projects/fce
( cd backend && bunx biome check --write . && bunx tsc --noEmit && bun test )
( cd frontend && npm run lint && npm run typecheck )
```

Expected: all green.

- [ ] **Step 9: Push + open PR**

```bash
cd /Users/bellinnn/Documents/projects/fce
git push -u origin feat/strategy-controls-config
gh pr create --title "Move strategy taxonomy from DB to config" --body "$(cat <<'EOF'
## Summary
- Move framework / hook type / tone preset / visual style values into `backend/src/config/strategy-controls.ts` (single source of truth).
- Drop the four Prisma models, the admin CRUD UI tabs, the admin routes, the orphaned service + repository.
- Fix `GeneratePage` so `tonePreset` and `visualStyle` selections actually reach the backend (body keys were `tonePresetId` / `visualStyleId` but the route reads `tonePreset` / `visualStyle`).
- Polish: Output Length labels, Framework/Hook Type/Tone Variation placeholder labels.

## Test plan
- [ ] `bun test` (backend) — green
- [ ] `bunx tsc --noEmit` (backend) — clean
- [ ] `npm run lint` + `npm run typecheck` (frontend) — clean
- [ ] Admin Panel renders Users + Audit Logs tabs only
- [ ] Content Generator → Advanced dropdowns render canonical lists
- [ ] Picking explicit Tone + Visual Style → values land in `generation_requests`
- [ ] Default selections → `framework=aida`, `hook_type=curiosity-hook`, others NULL

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Skip `gh pr create` if not pushing remote — local feature branch is fine for this work cycle.)

---

## Self-Review

**Spec coverage:**
- ✅ New `backend/src/config/strategy-controls.ts` — Task 1 Step 1.
- ✅ Rewrite `taxonomy.route.ts` — Task 1 Step 2.
- ✅ Composition root update — Task 1 Step 3, Task 2 Step 2.
- ✅ Delete service / repository / interfaces / service test — Task 2 Step 1.
- ✅ Strip admin CRUD methods + interface entries + admin routes + audit tests — Task 3.
- ✅ Drop Prisma models + db push + seed cleanup — Task 4.
- ✅ Frontend admin tab removal + subtitle update — Task 5.
- ✅ Output Length labels, placeholders, body-key bug fix, default fallbacks — Task 6.
- ✅ Manual smoke — Task 7.
- ✅ Optional regression test for taxonomy route — Task 1 Step 4.

**Type / property consistency:**
- Slug ids `aida`, `curiosity-hook`, `playful-bold`, `editorial` are used identically in the config (Task 1 Step 1) and the regression test (Task 1 Step 4) and the frontend submission defaults (Task 6 Step 2) and the smoke verification (Task 7 Step 6).
- Body field names `tonePreset` / `visualStyle` (Task 6 Step 2) match what [generation.route.ts:35-36](backend/src/routes/generation.route.ts#L35-L36) reads — verified against the source before plan was written.
- `createTaxonomyRoutes()` has the same no-arg signature in Task 1 Step 2 (route file), Task 1 Step 3 (call site), and Task 1 Step 4 (test invocation).

**Placeholder scan:** No "TBD", "TODO", "etc.", "implement later", or unbacked descriptions. Each task either shows the new code in full or names exact lines to delete with surrounding context.
