# Onboarding Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-login welcome modal, an auto-tracked "Getting Started" checklist, and one-time coach marks on 6 target pages (Dashboard, Brands, Products, Generate, Campaigns, Topics) with a Help button to replay them. See the spec at `docs/superpowers/specs/2026-04-24-onboarding-tutorial-design.md`.

**Architecture:** Three new columns on `User` persist onboarding flags. Workspace-scoped checklist progress is derived per-request from existing `brand`/`product`/`generationRequest` counts (no event hooks, no drift). One new backend service + routes; one new React context + four components. Existing users are grandfathered by a one-shot migration script so nobody sees a surprise tutorial on their next login.

**Tech Stack:** Bun, Hono, Prisma 7, PostgreSQL (backend); React 19, Vite 8, Tailwind CSS 4, React Router 7 (frontend).

---

## File Structure

**Backend — create:**
- `backend/src/services/onboarding.service.ts` — service class with `getFlags(userId)`, `patchFlags(userId, patch)`, `getProgress(workspaceId)`.
- `backend/src/interfaces/services/onboarding.service.interface.ts` — `IOnboardingService` + DTO types.
- `backend/src/routes/onboarding.route.ts` — `createOnboardingRoutes(service)` for `/api/users/me/onboarding`.
- `backend/tests/services/onboarding.service.test.ts` — unit tests with mocks.
- `backend/scripts/migrate-onboarding.ts` — one-shot grandfathering script.

**Backend — modify:**
- `backend/prisma/schema.prisma` — add three fields to `User`.
- `backend/src/interfaces/repositories/user.repository.interface.ts` — add `updateOnboarding(userId, patch)`.
- `backend/src/repositories/user.repository.ts` — implement `updateOnboarding`.
- `backend/tests/helpers/mock-user.repository.ts` — add new fields to the user factory + implement `updateOnboarding`.
- `backend/src/routes/workspace.route.ts` — add `GET /:workspaceId/onboarding-progress` (or we add it to the workspace-scoped group — see Task 7).
- `backend/src/index.ts` — wire the service + mount routes.

**Frontend — create:**
- `frontend/src/services/onboarding.api.ts` — API client wrapper.
- `frontend/src/contexts/OnboardingContext.tsx` — context + `OnboardingProvider` + `useOnboarding` hook.
- `frontend/src/components/onboarding/WelcomeModal.tsx`
- `frontend/src/components/onboarding/GettingStartedChecklist.tsx`
- `frontend/src/components/onboarding/CoachMark.tsx`
- `frontend/src/components/onboarding/HelpButton.tsx`

**Frontend — modify:**
- `frontend/src/App.tsx` — wrap routes with `<OnboardingProvider>`.
- `frontend/src/components/layout/AppShell.tsx` — mount `<WelcomeModal />` + `<GettingStartedChecklist />`.
- `frontend/src/pages/DashboardPage.tsx` — add `<CoachMark pageKey="dashboard" ... />` + `<HelpButton pageKey="dashboard" />`.
- `frontend/src/pages/BrandsPage.tsx` — same for `"brands"`.
- `frontend/src/pages/ProductsPage.tsx` — same for `"products"`.
- `frontend/src/pages/GeneratePage.tsx` — same for `"generate"`.
- `frontend/src/pages/CampaignsPage.tsx` — same for `"campaigns"`.
- `frontend/src/pages/TopicsPage.tsx` — same for `"topics"`.

---

## Task 1: Prisma schema — add onboarding fields to User

**Files:**
- Modify: `backend/prisma/schema.prisma` (User model, around line 11-47)

- [ ] **Step 1: Add three fields to `User` model**

Edit `backend/prisma/schema.prisma` — inside `model User { ... }`, after the existing `emailVerifiedAt` line (around line 30), add:

```prisma
  // Onboarding tutorial flags — see docs/superpowers/specs/2026-04-24-onboarding-tutorial-design.md.
  // Null = not yet seen/dismissed. seenCoachMarks holds page keys that have
  // been dismissed. Progress for the Getting Started checklist is derived
  // per-workspace from brand/product/generation counts — not stored here.
  onboardingWelcomeSeenAt        DateTime?  @map("onboarding_welcome_seen_at")
  onboardingChecklistDismissedAt DateTime?  @map("onboarding_checklist_dismissed_at")
  seenCoachMarks                 String[]   @default([]) @map("seen_coach_marks")
```

- [ ] **Step 2: Push the schema to the database**

From `backend/`:

```bash
bunx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema." and a regenerated Prisma Client.

- [ ] **Step 3: Verify the columns exist**

```bash
bunx prisma db execute --stdin <<'SQL'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('onboarding_welcome_seen_at', 'onboarding_checklist_dismissed_at', 'seen_coach_marks');
SQL
```

Expected: three rows, `seen_coach_marks` shows `ARRAY` / `text` with default `'{}'`.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(db): add onboarding tutorial fields to User

Three new columns: onboardingWelcomeSeenAt, onboardingChecklistDismissedAt,
seenCoachMarks. All nullable / default-empty so the migration is additive
and existing users see nothing until the grandfather script runs (see
scripts/migrate-onboarding.ts in a later commit)."
```

---

## Task 2: Add `updateOnboarding` to IUserRepository

**Files:**
- Modify: `backend/src/interfaces/repositories/user.repository.interface.ts`

- [ ] **Step 1: Add the interface method**

Replace the file contents with:

```ts
import type { User } from "@prisma/client";

export interface OnboardingPatch {
	welcomeSeen?: boolean;
	checklistDismissed?: boolean;
	markCoachSeen?: string;
}

export interface IUserRepository {
	findById(id: string): Promise<User | null>;
	findByEmail(email: string): Promise<User | null>;
	create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User>;
	update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User>;
	updateOnboarding(id: string, patch: OnboardingPatch): Promise<User>;
}
```

- [ ] **Step 2: Typecheck**

From `backend/`:

```bash
bunx tsc --noEmit
```

Expected: compile errors pointing at `UserRepository` and `MockUserRepository` for missing `updateOnboarding` — that's intentional; we implement them next.

- [ ] **Step 3: Commit**

```bash
git add backend/src/interfaces/repositories/user.repository.interface.ts
git commit -m "feat(backend): add IUserRepository.updateOnboarding signature"
```

---

## Task 3: Implement `updateOnboarding` on `UserRepository`

**Files:**
- Modify: `backend/src/repositories/user.repository.ts`

- [ ] **Step 1: Implement the method**

Replace the file contents with:

```ts
import type { PrismaClient, User } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../interfaces/repositories/user.repository.interface";

export class UserRepository implements IUserRepository {
	constructor(private prisma: PrismaClient) {}

	async findById(id: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { id } });
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.prisma.user.findUnique({ where: { email } });
	}

	async create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User> {
		return this.prisma.user.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User> {
		return this.prisma.user.update({ where: { id }, data });
	}

	async updateOnboarding(id: string, patch: OnboardingPatch): Promise<User> {
		// Each flag is set-once. We read, compute the delta, and write. Doing
		// this in a single query would require COALESCE + array_append SQL
		// which Prisma doesn't expose cleanly — one extra round-trip keeps the
		// code in the ORM and the behavior observable.
		const user = await this.prisma.user.findUnique({ where: { id } });
		if (!user) throw new Error("User not found");

		const now = new Date();
		const data: Record<string, unknown> = {};

		if (patch.welcomeSeen && user.onboardingWelcomeSeenAt === null) {
			data.onboardingWelcomeSeenAt = now;
		}
		if (patch.checklistDismissed && user.onboardingChecklistDismissedAt === null) {
			data.onboardingChecklistDismissedAt = now;
		}
		if (patch.markCoachSeen && !user.seenCoachMarks.includes(patch.markCoachSeen)) {
			data.seenCoachMarks = [...user.seenCoachMarks, patch.markCoachSeen];
		}

		if (Object.keys(data).length === 0) return user;
		return this.prisma.user.update({ where: { id }, data });
	}
}
```

- [ ] **Step 2: Typecheck**

From `backend/`:

```bash
bunx tsc --noEmit
```

Expected: `MockUserRepository` still errors (next task). `UserRepository` compiles clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/user.repository.ts
git commit -m "feat(backend): implement UserRepository.updateOnboarding"
```

---

## Task 4: Update `MockUserRepository` for onboarding fields

**Files:**
- Modify: `backend/tests/helpers/mock-user.repository.ts`

- [ ] **Step 1: Replace the mock**

Replace the file contents with:

```ts
import type { User } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../../src/interfaces/repositories/user.repository.interface";

export class MockUserRepository implements IUserRepository {
	private users: User[] = [];

	async findById(id: string): Promise<User | null> {
		return this.users.find((u) => u.id === id) ?? null;
	}

	async findByEmail(email: string): Promise<User | null> {
		return this.users.find((u) => u.email === email) ?? null;
	}

	async create(data: {
		email: string;
		passwordHash: string;
		fullName?: string;
		maxWorkspaces?: number;
		maxProjects?: number;
	}): Promise<User> {
		const user: User = {
			id: crypto.randomUUID(),
			email: data.email,
			passwordHash: data.passwordHash,
			fullName: data.fullName ?? null,
			avatarUrl: null,
			isSuperadmin: false,
			status: "active",
			defaultScrapeLanguage: "indonesian",
			maxWorkspaces: data.maxWorkspaces ?? 1,
			maxProjects: data.maxProjects ?? 3,
			emailVerifiedAt: null,
			onboardingWelcomeSeenAt: null,
			onboardingChecklistDismissedAt: null,
			seenCoachMarks: [],
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.users.push(user);
		return user;
	}

	async update(
		id: string,
		data: Partial<
			Pick<User, "fullName" | "avatarUrl" | "status" | "defaultScrapeLanguage" | "emailVerifiedAt">
		>,
	): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
		return this.users[index];
	}

	async updateOnboarding(id: string, patch: OnboardingPatch): Promise<User> {
		const index = this.users.findIndex((u) => u.id === id);
		if (index === -1) throw new Error("User not found");
		const user = this.users[index];
		const now = new Date();
		const next = { ...user };

		if (patch.welcomeSeen && next.onboardingWelcomeSeenAt === null) {
			next.onboardingWelcomeSeenAt = now;
		}
		if (patch.checklistDismissed && next.onboardingChecklistDismissedAt === null) {
			next.onboardingChecklistDismissedAt = now;
		}
		if (patch.markCoachSeen && !next.seenCoachMarks.includes(patch.markCoachSeen)) {
			next.seenCoachMarks = [...next.seenCoachMarks, patch.markCoachSeen];
		}

		next.updatedAt = now;
		this.users[index] = next;
		return next;
	}

	clear(): void {
		this.users = [];
	}
}
```

- [ ] **Step 2: Typecheck and run existing tests**

From `backend/`:

```bash
bunx tsc --noEmit && bun test tests/services/auth.service.test.ts
```

Expected: no type errors; auth tests still pass (they don't depend on the new fields but need the factory to produce a valid `User`).

- [ ] **Step 3: Commit**

```bash
git add backend/tests/helpers/mock-user.repository.ts
git commit -m "test(backend): extend MockUserRepository with onboarding fields"
```

---

## Task 5: Write OnboardingService (TDD)

**Files:**
- Create: `backend/src/interfaces/services/onboarding.service.interface.ts`
- Create: `backend/src/services/onboarding.service.ts`
- Create: `backend/tests/services/onboarding.service.test.ts`

- [ ] **Step 1: Write the service interface**

Create `backend/src/interfaces/services/onboarding.service.interface.ts`:

```ts
import type { OnboardingPatch } from "../repositories/user.repository.interface";

export interface OnboardingFlags {
	welcomeSeenAt: Date | null;
	checklistDismissedAt: Date | null;
	seenCoachMarks: string[];
}

export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}

export interface IOnboardingService {
	getFlags(userId: string): Promise<OnboardingFlags>;
	patchFlags(userId: string, patch: OnboardingPatch): Promise<OnboardingFlags>;
	getProgress(workspaceId: string): Promise<OnboardingProgress>;
}
```

- [ ] **Step 2: Write the failing tests**

Create `backend/tests/services/onboarding.service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "bun:test";
import { OnboardingService } from "../../src/services/onboarding.service";
import { MockUserRepository } from "../helpers/mock-user.repository";

describe("OnboardingService", () => {
	const userRepo = new MockUserRepository();

	// Minimal Prisma stub: only the three count methods are exercised. Each
	// stub's filter argument is captured so we can assert the archivedAt
	// filters match what dashboard.service.ts already uses.
	type CountArgs = { where?: Record<string, unknown> };
	const counts = {
		brand: 0,
		product: 0,
		generationRequest: 0,
	};
	const lastWhere = {
		brand: null as Record<string, unknown> | null,
		product: null as Record<string, unknown> | null,
		generationRequest: null as Record<string, unknown> | null,
	};
	const prismaStub = {
		brand: {
			count: async (args: CountArgs) => {
				lastWhere.brand = args.where ?? null;
				return counts.brand;
			},
		},
		product: {
			count: async (args: CountArgs) => {
				lastWhere.product = args.where ?? null;
				return counts.product;
			},
		},
		generationRequest: {
			count: async (args: CountArgs) => {
				lastWhere.generationRequest = args.where ?? null;
				return counts.generationRequest;
			},
		},
	} as any;

	const service = new OnboardingService(userRepo, prismaStub);

	async function freshUser() {
		userRepo.clear();
		return userRepo.create({ email: `u+${crypto.randomUUID()}@x.com`, passwordHash: "h" });
	}

	beforeEach(() => {
		counts.brand = 0;
		counts.product = 0;
		counts.generationRequest = 0;
		lastWhere.brand = null;
		lastWhere.product = null;
		lastWhere.generationRequest = null;
	});

	describe("getFlags", () => {
		it("returns null flags and empty array for a new user", async () => {
			const user = await freshUser();
			const flags = await service.getFlags(user.id);
			expect(flags.welcomeSeenAt).toBeNull();
			expect(flags.checklistDismissedAt).toBeNull();
			expect(flags.seenCoachMarks).toEqual([]);
		});

		it("throws when user does not exist", async () => {
			userRepo.clear();
			await expect(service.getFlags("missing-id")).rejects.toThrow();
		});
	});

	describe("patchFlags", () => {
		it("sets welcomeSeenAt when welcomeSeen=true on a fresh user", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { welcomeSeen: true });
			expect(flags.welcomeSeenAt).toBeInstanceOf(Date);
		});

		it("is idempotent — re-calling welcomeSeen=true leaves the timestamp unchanged", async () => {
			const user = await freshUser();
			const first = await service.patchFlags(user.id, { welcomeSeen: true });
			const firstStamp = first.welcomeSeenAt;
			const second = await service.patchFlags(user.id, { welcomeSeen: true });
			expect(second.welcomeSeenAt).toEqual(firstStamp);
		});

		it("sets checklistDismissedAt when checklistDismissed=true", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { checklistDismissed: true });
			expect(flags.checklistDismissedAt).toBeInstanceOf(Date);
		});

		it("appends to seenCoachMarks on markCoachSeen", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { markCoachSeen: "brands" });
			expect(flags.seenCoachMarks).toEqual(["brands"]);
		});

		it("dedupes seenCoachMarks — marking the same key twice keeps one entry", async () => {
			const user = await freshUser();
			await service.patchFlags(user.id, { markCoachSeen: "brands" });
			const flags = await service.patchFlags(user.id, { markCoachSeen: "brands" });
			expect(flags.seenCoachMarks).toEqual(["brands"]);
		});

		it("accumulates multiple distinct coach-mark keys", async () => {
			const user = await freshUser();
			await service.patchFlags(user.id, { markCoachSeen: "brands" });
			await service.patchFlags(user.id, { markCoachSeen: "products" });
			const flags = await service.patchFlags(user.id, { markCoachSeen: "generate" });
			expect(flags.seenCoachMarks.sort()).toEqual(["brands", "generate", "products"]);
		});
	});

	describe("getProgress", () => {
		it("returns all false when workspace is empty", async () => {
			const progress = await service.getProgress("ws-1");
			expect(progress).toEqual({ hasBrand: false, hasProduct: false, hasGenerated: false });
		});

		it("reflects counts > 0 as true", async () => {
			counts.brand = 2;
			counts.product = 0;
			counts.generationRequest = 5;
			const progress = await service.getProgress("ws-1");
			expect(progress).toEqual({ hasBrand: true, hasProduct: false, hasGenerated: true });
		});

		it("filters out archived rows — brand.archivedAt: null must be in the where clause", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.brand).toEqual({ workspaceId: "ws-1", archivedAt: null });
		});

		it("product filter respects both product and parent brand archive state", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.product).toEqual({
				workspaceId: "ws-1",
				archivedAt: null,
				brand: { archivedAt: null },
			});
		});

		it("generation filter scopes by workspace and excludes archived rows", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.generationRequest).toEqual({
				workspaceId: "ws-1",
				archivedAt: null,
				brand: { archivedAt: null },
			});
		});
	});
});
```

- [ ] **Step 3: Run the tests — confirm they fail**

From `backend/`:

```bash
bun test tests/services/onboarding.service.test.ts
```

Expected: FAIL with `Cannot find module '../../src/services/onboarding.service'`.

- [ ] **Step 4: Implement `OnboardingService`**

Create `backend/src/services/onboarding.service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type {
	IUserRepository,
	OnboardingPatch,
} from "../interfaces/repositories/user.repository.interface";
import type {
	IOnboardingService,
	OnboardingFlags,
	OnboardingProgress,
} from "../interfaces/services/onboarding.service.interface";

export class OnboardingService implements IOnboardingService {
	constructor(
		private userRepository: IUserRepository,
		private prisma: PrismaClient,
	) {}

	async getFlags(userId: string): Promise<OnboardingFlags> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new Error("User not found");
		return {
			welcomeSeenAt: user.onboardingWelcomeSeenAt,
			checklistDismissedAt: user.onboardingChecklistDismissedAt,
			seenCoachMarks: user.seenCoachMarks,
		};
	}

	async patchFlags(userId: string, patch: OnboardingPatch): Promise<OnboardingFlags> {
		const user = await this.userRepository.updateOnboarding(userId, patch);
		return {
			welcomeSeenAt: user.onboardingWelcomeSeenAt,
			checklistDismissedAt: user.onboardingChecklistDismissedAt,
			seenCoachMarks: user.seenCoachMarks,
		};
	}

	async getProgress(workspaceId: string): Promise<OnboardingProgress> {
		// Filters mirror dashboard.service.ts so "progress" matches what the
		// user actually sees in the lists — archived brands/products/generations
		// are hidden there, so they must not count toward checklist completion.
		// Queries are sequential (not Promise.all) to avoid the Prisma 7 WASM
		// "Out of bounds memory access" bug the dashboard service flagged.
		const brandCount = await this.prisma.brand.count({
			where: { workspaceId, archivedAt: null },
		});
		const productCount = await this.prisma.product.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});
		const generationCount = await this.prisma.generationRequest.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});

		return {
			hasBrand: brandCount > 0,
			hasProduct: productCount > 0,
			hasGenerated: generationCount > 0,
		};
	}
}
```

- [ ] **Step 5: Run the tests — confirm they pass**

```bash
bun test tests/services/onboarding.service.test.ts
```

Expected: all 12 tests pass.

- [ ] **Step 6: Run the full backend test suite**

```bash
bun test
```

Expected: everything green (including existing auth / workspace tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/interfaces/services/onboarding.service.interface.ts \
        backend/src/services/onboarding.service.ts \
        backend/tests/services/onboarding.service.test.ts
git commit -m "feat(backend): add OnboardingService with TDD tests

Flags (welcome, checklist, coach marks) persist on User. Progress
(hasBrand/hasProduct/hasGenerated) is derived per-workspace from
existing counts so it stays in sync without event hooks. Filters mirror
dashboard.service.ts — archived rows don't count."
```

---

## Task 6: Create user-level onboarding routes

**Files:**
- Create: `backend/src/routes/onboarding.route.ts`

- [ ] **Step 1: Write the route file**

Create `backend/src/routes/onboarding.route.ts`:

```ts
import { Hono } from "hono";
import type { IOnboardingService } from "../interfaces/services/onboarding.service.interface";

type Variables = {
	userId: string;
};

export function createOnboardingRoutes(service: IOnboardingService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /api/users/me/onboarding — returns the current flag state.
	app.get("/", async (c) => {
		const userId = c.get("userId");
		const flags = await service.getFlags(userId);
		return c.json({ data: flags });
	});

	// PATCH /api/users/me/onboarding — partial, additive, idempotent.
	// Body fields (all optional):
	//   welcomeSeen?: true           // first dismissal wins; later calls no-op
	//   checklistDismissed?: true    // same
	//   markCoachSeen?: string       // page key — append if not present
	app.patch("/", async (c) => {
		const userId = c.get("userId");
		const body = (await c.req.json().catch(() => ({}))) as {
			welcomeSeen?: boolean;
			checklistDismissed?: boolean;
			markCoachSeen?: string;
		};
		const flags = await service.patchFlags(userId, {
			welcomeSeen: body.welcomeSeen === true ? true : undefined,
			checklistDismissed: body.checklistDismissed === true ? true : undefined,
			markCoachSeen: typeof body.markCoachSeen === "string" ? body.markCoachSeen : undefined,
		});
		return c.json({ data: flags });
	});

	return app;
}
```

- [ ] **Step 2: Typecheck**

From `backend/`:

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/onboarding.route.ts
git commit -m "feat(backend): add user-level onboarding routes (GET + PATCH)"
```

---

## Task 7: Add workspace-scoped progress route

The workspace-scoped group in `backend/src/index.ts` already applies auth + workspace membership middleware. We mount the progress endpoint inline in `index.ts` (next task) rather than growing `workspace.route.ts`, because the progress handler only needs the `OnboardingService` that's constructed in the composition root. This avoids threading the service into `createWorkspaceRoutes`.

Concretely, we'll create a small route factory so the composition stays clean.

**Files:**
- Create: `backend/src/routes/onboarding-progress.route.ts`

- [ ] **Step 1: Write the route factory**

Create `backend/src/routes/onboarding-progress.route.ts`:

```ts
import { Hono } from "hono";
import type { IOnboardingService } from "../interfaces/services/onboarding.service.interface";

type Variables = {
	userId: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createOnboardingProgressRoutes(service: IOnboardingService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /api/workspaces/:workspaceId/onboarding-progress
	//   { hasBrand, hasProduct, hasGenerated }
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const progress = await service.getProgress(workspaceId);
		return c.json({ data: progress });
	});

	return app;
}
```

- [ ] **Step 2: Typecheck**

From `backend/`:

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/onboarding-progress.route.ts
git commit -m "feat(backend): add workspace-scoped onboarding-progress route"
```

---

## Task 8: Wire OnboardingService and routes into the composition root

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Import the new service and routes**

At the top of `backend/src/index.ts`, add these imports alongside the existing service/route imports (keep alphabetical ordering within each group):

```ts
import { OnboardingService } from "./services/onboarding.service";
import { createOnboardingRoutes } from "./routes/onboarding.route";
import { createOnboardingProgressRoutes } from "./routes/onboarding-progress.route";
```

- [ ] **Step 2: Instantiate the service in the Services section**

Find the `// ─── Services ───` section (around line 181). After the existing service instantiations (after `researchService` around line 282), add:

```ts
	const onboardingService = new OnboardingService(userRepository, prisma);
```

- [ ] **Step 3: Mount the user-level route**

Find the line that registers `/api/me` invitation routes (around line 691):

```ts
app.route("/api/me", createMeInvitationRoutes(workspaceService));
```

Immediately after it, add:

```ts
app.route("/api/users/me/onboarding", createOnboardingRoutes(onboardingService));
```

The route is inside the `app.use("/api/*", authMiddleware)` block (added around line 681), so it's auto-protected. `userId` is injected into the context by `authMiddleware`.

- [ ] **Step 4: Mount the workspace-scoped progress route**

Find the workspace-scoped group (around line 703-750). Inside the block that registers workspace sub-routes, add (e.g., after the `projects` line around line 722):

```ts
	workspaceScoped.route(
		"/onboarding-progress",
		createOnboardingProgressRoutes(onboardingService),
	);
```

- [ ] **Step 5: Start the backend and smoke-test**

From `backend/`:

```bash
bun run --hot src/index.ts
```

In another terminal, log in (or use an existing access token) and hit:

```bash
# Replace <TOKEN> with a real access token from the frontend's devtools.
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/users/me/onboarding | jq
```

Expected output:
```json
{ "data": { "welcomeSeenAt": null, "checklistDismissedAt": null, "seenCoachMarks": [] } }
```

Then hit the workspace progress endpoint (replace `<WORKSPACE_ID>`):

```bash
curl -s -H "Authorization: Bearer <TOKEN>" http://localhost:3001/api/workspaces/<WORKSPACE_ID>/onboarding-progress | jq
```

Expected: `{ "data": { "hasBrand": true|false, "hasProduct": ..., "hasGenerated": ... } }` reflecting that workspace's current state.

- [ ] **Step 6: Stop the dev server and commit**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): wire OnboardingService into composition root"
```

---

## Task 9: Migration script to grandfather existing users

**Files:**
- Create: `backend/scripts/migrate-onboarding.ts`

- [ ] **Step 1: Write the script**

Create `backend/scripts/migrate-onboarding.ts`:

```ts
/**
 * One-shot migration for the onboarding tutorial rollout.
 *
 *   bun run scripts/migrate-onboarding.ts [--dry-run]
 *
 * Grandfathers every existing user so they never see a surprise tutorial:
 *   - onboardingWelcomeSeenAt:        null → now()
 *   - onboardingChecklistDismissedAt: null → now()
 *   - seenCoachMarks (if []):                 →
 *     ["dashboard","brands","products","generate","campaigns","topics"]
 *
 * Only affects users created BEFORE the script runs (bounded by createdAt <= now).
 * Users created after this run (i.e. real new signups) go through the full
 * tutorial flow.
 *
 * Safe to re-run. Idempotent: users already flagged as "welcome seen" are
 * skipped for that flag; coach marks merge by union.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const COACH_MARK_KEYS = ["dashboard", "brands", "products", "generate", "campaigns", "topics"];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const cutoff = new Date();
	const total = await prisma.user.count({ where: { createdAt: { lte: cutoff } } });
	const needsWelcome = await prisma.user.count({
		where: { createdAt: { lte: cutoff }, onboardingWelcomeSeenAt: null },
	});
	const needsChecklist = await prisma.user.count({
		where: { createdAt: { lte: cutoff }, onboardingChecklistDismissedAt: null },
	});

	console.log(`Users existing at cutoff ${cutoff.toISOString()}: ${total}`);
	console.log(`  needs welcomeSeenAt backfill:        ${needsWelcome}`);
	console.log(`  needs checklistDismissedAt backfill: ${needsChecklist}`);

	if (DRY_RUN) {
		console.log("[dry-run] no writes performed");
		return;
	}

	if (needsWelcome > 0) {
		const r = await prisma.user.updateMany({
			where: { createdAt: { lte: cutoff }, onboardingWelcomeSeenAt: null },
			data: { onboardingWelcomeSeenAt: cutoff },
		});
		console.log(`Backfilled onboardingWelcomeSeenAt for ${r.count} user(s)`);
	}

	if (needsChecklist > 0) {
		const r = await prisma.user.updateMany({
			where: { createdAt: { lte: cutoff }, onboardingChecklistDismissedAt: null },
			data: { onboardingChecklistDismissedAt: cutoff },
		});
		console.log(`Backfilled onboardingChecklistDismissedAt for ${r.count} user(s)`);
	}

	// Merge-by-union for coach marks. updateMany can't express array
	// concat-with-dedupe, so iterate.
	const users = await prisma.user.findMany({
		where: { createdAt: { lte: cutoff } },
		select: { id: true, seenCoachMarks: true },
	});
	let coachUpdated = 0;
	for (const u of users) {
		const set = new Set<string>(u.seenCoachMarks);
		let changed = false;
		for (const k of COACH_MARK_KEYS) {
			if (!set.has(k)) {
				set.add(k);
				changed = true;
			}
		}
		if (changed) {
			await prisma.user.update({
				where: { id: u.id },
				data: { seenCoachMarks: Array.from(set) },
			});
			coachUpdated++;
		}
	}
	console.log(`Merged coach-mark keys into ${coachUpdated} user(s)`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Run the script in dry-run mode against local dev DB**

From `backend/`:

```bash
bun run scripts/migrate-onboarding.ts --dry-run
```

Expected output shows counts but "no writes performed".

- [ ] **Step 3: Run the script for real against local dev DB**

```bash
bun run scripts/migrate-onboarding.ts
```

Expected: prints how many users were backfilled. Re-running should report `needs welcomeSeenAt backfill: 0` (idempotent).

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/migrate-onboarding.ts
git commit -m "feat(backend): add migrate-onboarding.ts grandfathering script

Backfills onboardingWelcomeSeenAt + onboardingChecklistDismissedAt
+ all six coach-mark keys for every user created before the script
runs, so nobody sees a surprise tutorial on their next login. Safe to
re-run; idempotent."
```

---

## Task 10: Frontend API client — `onboarding.api.ts`

**Files:**
- Create: `frontend/src/services/onboarding.api.ts`

- [ ] **Step 1: Write the API wrapper**

Create `frontend/src/services/onboarding.api.ts`:

```ts
import { api } from "./api";

export interface OnboardingFlags {
	welcomeSeenAt: string | null;
	checklistDismissedAt: string | null;
	seenCoachMarks: string[];
}

export interface OnboardingProgress {
	hasBrand: boolean;
	hasProduct: boolean;
	hasGenerated: boolean;
}

export interface OnboardingPatch {
	welcomeSeen?: boolean;
	checklistDismissed?: boolean;
	markCoachSeen?: string;
}

export function getOnboardingFlags(): Promise<OnboardingFlags> {
	return api<OnboardingFlags>("/api/users/me/onboarding");
}

export function patchOnboardingFlags(patch: OnboardingPatch): Promise<OnboardingFlags> {
	return api<OnboardingFlags>("/api/users/me/onboarding", {
		method: "PATCH",
		body: JSON.stringify(patch),
	});
}

export function getOnboardingProgress(workspaceId: string): Promise<OnboardingProgress> {
	return api<OnboardingProgress>(`/api/workspaces/${workspaceId}/onboarding-progress`);
}
```

- [ ] **Step 2: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/onboarding.api.ts
git commit -m "feat(frontend): add onboarding API client"
```

---

## Task 11: Frontend context — `OnboardingContext.tsx`

**Files:**
- Create: `frontend/src/contexts/OnboardingContext.tsx`
- Create: `frontend/src/hooks/useOnboarding.ts`

- [ ] **Step 1: Write the context**

Create `frontend/src/contexts/OnboardingContext.tsx`:

```tsx
import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";
import {
	getOnboardingFlags,
	patchOnboardingFlags,
	getOnboardingProgress,
	type OnboardingFlags,
	type OnboardingProgress,
} from "../services/onboarding.api";

interface OnboardingContextValue {
	welcomeSeenAt: Date | null;
	checklistDismissedAt: Date | null;
	seenCoachMarks: string[];
	progress: OnboardingProgress | null; // null while loading
	dismissWelcome: () => Promise<void>;
	dismissChecklist: () => Promise<void>;
	markCoachSeen: (pageKey: string) => Promise<void>;
	hasSeenCoach: (pageKey: string) => boolean;
	refreshProgress: () => Promise<void>;
}

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function parseFlags(raw: OnboardingFlags | null) {
	return {
		welcomeSeenAt: raw?.welcomeSeenAt ? new Date(raw.welcomeSeenAt) : null,
		checklistDismissedAt: raw?.checklistDismissedAt ? new Date(raw.checklistDismissedAt) : null,
		seenCoachMarks: raw?.seenCoachMarks ?? [],
	};
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
	const { user, isLoading: authLoading } = useAuth();
	const { activeWorkspace } = useWorkspace();

	const [flags, setFlags] = useState(() => parseFlags(null));
	const [progress, setProgress] = useState<OnboardingProgress | null>(null);

	// Load flags when auth resolves. Silently ignore errors — a failed load
	// just means the welcome modal won't appear until the next successful
	// fetch, which is better than crashing the app.
	useEffect(() => {
		if (authLoading) return;
		if (!user) {
			setFlags(parseFlags(null));
			setProgress(null);
			return;
		}
		getOnboardingFlags()
			.then((raw) => setFlags(parseFlags(raw)))
			.catch(() => {
				// swallow — see comment above
			});
	}, [authLoading, user]);

	const refreshProgress = useCallback(async () => {
		if (!activeWorkspace) return;
		try {
			const p = await getOnboardingProgress(activeWorkspace.id);
			setProgress(p);
		} catch {
			// ignore — stale progress is acceptable
		}
	}, [activeWorkspace]);

	// Refresh progress when the active workspace changes.
	useEffect(() => {
		if (!user) return;
		refreshProgress();
	}, [user, activeWorkspace?.id, refreshProgress]);

	const dismissWelcome = useCallback(async () => {
		// Optimistic update — snap the flag so the modal closes immediately,
		// then confirm server-side. Roll back on failure.
		const prev = flags.welcomeSeenAt;
		setFlags((f) => ({ ...f, welcomeSeenAt: new Date() }));
		try {
			const raw = await patchOnboardingFlags({ welcomeSeen: true });
			setFlags(parseFlags(raw));
		} catch {
			setFlags((f) => ({ ...f, welcomeSeenAt: prev }));
		}
	}, [flags.welcomeSeenAt]);

	const dismissChecklist = useCallback(async () => {
		const prev = flags.checklistDismissedAt;
		setFlags((f) => ({ ...f, checklistDismissedAt: new Date() }));
		try {
			const raw = await patchOnboardingFlags({ checklistDismissed: true });
			setFlags(parseFlags(raw));
		} catch {
			setFlags((f) => ({ ...f, checklistDismissedAt: prev }));
		}
	}, [flags.checklistDismissedAt]);

	const markCoachSeen = useCallback(
		async (pageKey: string) => {
			if (flags.seenCoachMarks.includes(pageKey)) return;
			const prev = flags.seenCoachMarks;
			setFlags((f) => ({ ...f, seenCoachMarks: [...f.seenCoachMarks, pageKey] }));
			try {
				const raw = await patchOnboardingFlags({ markCoachSeen: pageKey });
				setFlags(parseFlags(raw));
			} catch {
				setFlags((f) => ({ ...f, seenCoachMarks: prev }));
			}
		},
		[flags.seenCoachMarks],
	);

	const hasSeenCoach = useCallback(
		(pageKey: string) => flags.seenCoachMarks.includes(pageKey),
		[flags.seenCoachMarks],
	);

	return (
		<OnboardingContext.Provider
			value={{
				welcomeSeenAt: flags.welcomeSeenAt,
				checklistDismissedAt: flags.checklistDismissedAt,
				seenCoachMarks: flags.seenCoachMarks,
				progress,
				dismissWelcome,
				dismissChecklist,
				markCoachSeen,
				hasSeenCoach,
				refreshProgress,
			}}
		>
			{children}
		</OnboardingContext.Provider>
	);
}
```

- [ ] **Step 2: Write the hook**

Create `frontend/src/hooks/useOnboarding.ts`:

```ts
import { useContext } from "react";
import { OnboardingContext } from "../contexts/OnboardingContext";

export function useOnboarding() {
	const ctx = useContext(OnboardingContext);
	if (!ctx) {
		throw new Error("useOnboarding must be used inside an OnboardingProvider");
	}
	return ctx;
}
```

- [ ] **Step 3: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/contexts/OnboardingContext.tsx frontend/src/hooks/useOnboarding.ts
git commit -m "feat(frontend): add OnboardingContext + useOnboarding hook"
```

---

## Task 12: Mount `OnboardingProvider` in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the import and wrap the routes**

Edit `frontend/src/App.tsx`:

1. Near the top with the other context imports (around line 4), add:
   ```tsx
   import { OnboardingProvider } from "./contexts/OnboardingContext";
   ```

2. Inside `export default function App()`, wrap `<Routes>` with `<OnboardingProvider>` *inside* `<ProjectProvider>` so it can read workspace state. The provider structure becomes:

   ```tsx
   <AuthProvider>
     <WorkspaceProvider>
       <ProjectProvider>
         <OnboardingProvider>
           <Routes>
             {/* ...unchanged... */}
           </Routes>
         </OnboardingProvider>
       </ProjectProvider>
     </WorkspaceProvider>
   </AuthProvider>
   ```

   Concretely, change lines 48-84 from:

   ```tsx
   <BrowserRouter>
     <AuthProvider>
       <WorkspaceProvider>
         <ProjectProvider>
         <Routes>
           ...
         </Routes>
         </ProjectProvider>
       </WorkspaceProvider>
     </AuthProvider>
   </BrowserRouter>
   ```

   to:

   ```tsx
   <BrowserRouter>
     <AuthProvider>
       <WorkspaceProvider>
         <ProjectProvider>
           <OnboardingProvider>
             <Routes>
               ...
             </Routes>
           </OnboardingProvider>
         </ProjectProvider>
       </WorkspaceProvider>
     </AuthProvider>
   </BrowserRouter>
   ```

   (Keep all the existing `<Route>` children unchanged.)

- [ ] **Step 2: Typecheck and run the dev server**

From `frontend/`:

```bash
npm run typecheck && npm run dev
```

Expected: typecheck passes, dev server boots on port 5173, page loads normally (no UI changes yet — only a provider was added). In devtools Network tab, a request to `/api/users/me/onboarding` should appear after login and return 200.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(frontend): mount OnboardingProvider in App.tsx"
```

---

## Task 13: `WelcomeModal` component

**Files:**
- Create: `frontend/src/components/onboarding/WelcomeModal.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/onboarding/WelcomeModal.tsx`:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOnboarding } from "../../hooks/useOnboarding";
import { useWorkspace } from "../../hooks/useWorkspace";

export function WelcomeModal() {
	const { welcomeSeenAt, dismissWelcome } = useOnboarding();
	const { activeWorkspace } = useWorkspace();
	const navigate = useNavigate();
	const [slide, setSlide] = useState(0);

	// Guard: don't render until we know the user is genuinely new AND has a
	// workspace to route into on slide 3.
	if (welcomeSeenAt !== null) return null;
	if (!activeWorkspace) return null;

	const totalSlides = 3;

	async function handleSkip() {
		await dismissWelcome();
	}

	async function handleCreateBrand() {
		await dismissWelcome();
		navigate("/brands/new");
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
			<div className="w-[min(560px,90vw)] rounded-2xl bg-white p-8 shadow-2xl">
				{slide === 0 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Welcome to FCE 👋</h2>
						<p className="mt-3 text-gray-600">
							You're set up and ready to go. In the next 30 seconds, we'll show you how FCE
							helps you turn your brand into ready-to-post content.
						</p>
					</div>
				)}
				{slide === 1 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Three steps from idea to post</h2>
						<ol className="mt-4 space-y-3 text-gray-700">
							<li>
								<strong>1. Brand</strong> — the voice, audience, and messaging rules your content
								follows.
							</li>
							<li>
								<strong>2. Product</strong> — a specific thing you want to talk about, inheriting
								the brand.
							</li>
							<li>
								<strong>3. Generate</strong> — pick a product, describe the angle, let AI write +
								design it.
							</li>
						</ol>
					</div>
				)}
				{slide === 2 && (
					<div>
						<h2 className="text-2xl font-semibold text-gray-900">Let's set up your first brand</h2>
						<p className="mt-3 text-gray-600">
							You'll give it a name, describe your audience, and paste any reference links you
							have. Takes about 2 minutes.
						</p>
					</div>
				)}

				<div className="mt-8 flex items-center justify-between">
					<div className="flex gap-1">
						{Array.from({ length: totalSlides }).map((_, i) => (
							<span
								key={i}
								className={`h-1.5 w-6 rounded-full ${
									i === slide ? "bg-indigo-600" : "bg-gray-200"
								}`}
							/>
						))}
					</div>

					<div className="flex items-center gap-2">
						{slide > 0 && (
							<button
								type="button"
								onClick={() => setSlide((s) => Math.max(0, s - 1))}
								className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
							>
								← Back
							</button>
						)}
						<button
							type="button"
							onClick={handleSkip}
							className="rounded-md px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
						>
							{slide === totalSlides - 1 ? "Skip for now" : "Skip"}
						</button>
						{slide < totalSlides - 1 ? (
							<button
								type="button"
								onClick={() => setSlide((s) => s + 1)}
								className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
							>
								Next →
							</button>
						) : (
							<button
								type="button"
								onClick={handleCreateBrand}
								className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
							>
								Create my first brand →
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/WelcomeModal.tsx
git commit -m "feat(frontend): add WelcomeModal onboarding component"
```

---

## Task 14: `GettingStartedChecklist` component

**Files:**
- Create: `frontend/src/components/onboarding/GettingStartedChecklist.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/onboarding/GettingStartedChecklist.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface Item {
	key: "hasBrand" | "hasProduct" | "hasGenerated";
	label: string;
	to: string;
}

const ITEMS: Item[] = [
	{ key: "hasBrand", label: "Create your first brand", to: "/brands/new" },
	{ key: "hasProduct", label: "Add a product to your brand", to: "/products" },
	{ key: "hasGenerated", label: "Generate your first content", to: "/generate" },
];

export function GettingStartedChecklist() {
	const { welcomeSeenAt, checklistDismissedAt, progress, dismissChecklist } = useOnboarding();
	const [celebrating, setCelebrating] = useState(false);

	// Auto-dismiss ~2 seconds after all three items complete — gives the user
	// a moment to see the 🎉 state before the card disappears forever.
	useEffect(() => {
		if (!progress) return;
		if (progress.hasBrand && progress.hasProduct && progress.hasGenerated && !celebrating) {
			setCelebrating(true);
			const t = setTimeout(() => {
				dismissChecklist();
			}, 2000);
			return () => clearTimeout(t);
		}
	}, [progress, celebrating, dismissChecklist]);

	// Guard: wait for the welcome modal to be handled first, and don't show if
	// already dismissed or while progress is still loading.
	if (welcomeSeenAt === null) return null;
	if (checklistDismissedAt !== null) return null;
	if (!progress) return null;

	const allDone = progress.hasBrand && progress.hasProduct && progress.hasGenerated;

	return (
		<div className="fixed bottom-6 right-6 z-40 w-80 rounded-xl border border-gray-200 bg-white p-5 shadow-lg">
			<div className="flex items-start justify-between">
				<h3 className="text-sm font-semibold text-gray-900">
					{allDone ? "🎉 You're all set — great work." : "Getting started"}
				</h3>
				<button
					type="button"
					onClick={() => dismissChecklist()}
					aria-label="Dismiss"
					className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
				>
					<X size={16} />
				</button>
			</div>

			{!allDone && (
				<ul className="mt-4 space-y-3">
					{ITEMS.map((item) => {
						const done = Boolean(progress[item.key]);
						return (
							<li key={item.key} className="flex items-center gap-3">
								<span
									className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
										done
											? "border-green-600 bg-green-600 text-white"
											: "border-gray-300 bg-white"
									}`}
								>
									{done && <Check size={12} />}
								</span>
								{done ? (
									<span className="text-sm text-gray-500 line-through">{item.label}</span>
								) : (
									<Link
										to={item.to}
										className="text-sm text-gray-800 hover:text-indigo-700 hover:underline"
									>
										{item.label}
									</Link>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/GettingStartedChecklist.tsx
git commit -m "feat(frontend): add GettingStartedChecklist with auto-tracking"
```

---

## Task 15: `CoachMark` component

**Files:**
- Create: `frontend/src/components/onboarding/CoachMark.tsx`

This component has to handle two show-states: auto-shown on first visit (driven by `seenCoachMarks`) and force-shown by the Help button (driven by URL query param `?help=1` — simplest cross-component signal without adding a new state bucket to the context).

- [ ] **Step 1: Write the component**

Create `frontend/src/components/onboarding/CoachMark.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HelpCircle, X } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";

interface CoachMarkProps {
	pageKey: string;
	title: string;
	body: string;
}

export function CoachMark({ pageKey, title, body }: CoachMarkProps) {
	const { hasSeenCoach, markCoachSeen } = useOnboarding();
	const [searchParams, setSearchParams] = useSearchParams();
	const forceShow = searchParams.get("help") === "1";

	// Auto-show exactly once per page. Local state controls visibility so
	// closing the card doesn't require a context refetch.
	const [visible, setVisible] = useState(() => !hasSeenCoach(pageKey));

	// If the Help button flips ?help=1 onto the URL, re-open the card even if
	// it was previously dismissed. Then strip the param so refresh doesn't
	// re-trigger it.
	useEffect(() => {
		if (forceShow) {
			setVisible(true);
			searchParams.delete("help");
			setSearchParams(searchParams, { replace: true });
		}
	}, [forceShow, searchParams, setSearchParams]);

	if (!visible) return null;

	async function handleClose() {
		setVisible(false);
		// Only persist if this was an auto-show, not a forced re-show. Either
		// way, calling markCoachSeen is safe — the backend dedupes.
		await markCoachSeen(pageKey);
	}

	return (
		<div className="mb-4 flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
			<HelpCircle className="mt-0.5 shrink-0 text-indigo-600" size={20} />
			<div className="flex-1">
				<h4 className="text-sm font-semibold text-indigo-900">{title}</h4>
				<p className="mt-1 text-sm text-indigo-800">{body}</p>
			</div>
			<button
				type="button"
				onClick={handleClose}
				aria-label="Dismiss tip"
				className="rounded p-1 text-indigo-600 hover:bg-indigo-100"
			>
				<X size={16} />
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/CoachMark.tsx
git commit -m "feat(frontend): add CoachMark component with URL-driven force-show"
```

---

## Task 16: `HelpButton` component

**Files:**
- Create: `frontend/src/components/onboarding/HelpButton.tsx`

- [ ] **Step 1: Write the component**

Create `frontend/src/components/onboarding/HelpButton.tsx`:

```tsx
import { useSearchParams } from "react-router-dom";
import { HelpCircle } from "lucide-react";

interface HelpButtonProps {
	/** Reserved for future page-specific routing; currently the signal is a URL flag. */
	pageKey: string;
}

export function HelpButton({ pageKey: _pageKey }: HelpButtonProps) {
	const [searchParams, setSearchParams] = useSearchParams();

	function show() {
		searchParams.set("help", "1");
		setSearchParams(searchParams, { replace: true });
	}

	return (
		<button
			type="button"
			onClick={show}
			aria-label="Show tip for this page"
			title="Show tip"
			className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
		>
			<HelpCircle size={18} />
		</button>
	);
}
```

- [ ] **Step 2: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/onboarding/HelpButton.tsx
git commit -m "feat(frontend): add HelpButton component"
```

---

## Task 17: Mount `WelcomeModal` + `GettingStartedChecklist` in AppShell

**Files:**
- Modify: `frontend/src/components/layout/AppShell.tsx`

Both components are fixed-positioned overlays, so we render them once at the shell level — they appear on every authenticated page without each page having to mount them.

- [ ] **Step 1: Add imports**

At the top of `frontend/src/components/layout/AppShell.tsx` (near the other imports), add:

```tsx
import { WelcomeModal } from "../onboarding/WelcomeModal";
import { GettingStartedChecklist } from "../onboarding/GettingStartedChecklist";
```

- [ ] **Step 2: Mount them inside the shell's render tree**

Find the main return statement of `AppShell` (the JSX that contains `<Outlet />`). Just before the closing tag of the outermost wrapper, add:

```tsx
<WelcomeModal />
<GettingStartedChecklist />
```

Exact placement: as siblings of the top-level layout wrapper's children, so they render as fixed overlays on top of the current route's `<Outlet />` content. If the shell's root is a `<div>` that contains sidebar + `<main><Outlet /></main>`, place them right before the closing `</div>` of that root.

- [ ] **Step 3: Typecheck and run the dev server**

From `frontend/`:

```bash
npm run typecheck && npm run dev
```

In the browser (after logging in as a test user who has `onboardingWelcomeSeenAt = null`):
- Expected: the Welcome modal appears over the dashboard.
- Click Skip or complete the flow — modal disappears.
- Expected: the Getting Started checklist appears bottom-right.

(If your current user was grandfathered by the migration script, test this by manually resetting one user's flags via the SQL below, or by signing up a fresh user:)

```sql
-- Run via `bunx prisma db execute --stdin` or `psql`
UPDATE users
SET onboarding_welcome_seen_at = NULL,
    onboarding_checklist_dismissed_at = NULL,
    seen_coach_marks = '{}'
WHERE email = 'your-test-email@example.com';
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.tsx
git commit -m "feat(frontend): mount welcome modal + checklist in AppShell"
```

---

## Task 18: Add `CoachMark` + `HelpButton` to the six target pages

For each of the six pages below, import both components, render `<CoachMark />` near the top of the page content, and place `<HelpButton />` near the page title in the header.

The page keys used must match the ones grandfathered in the migration script: `"dashboard"`, `"brands"`, `"products"`, `"generate"`, `"campaigns"`, `"topics"`.

### Sub-task 18.1: DashboardPage

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add imports**

At the top of `frontend/src/pages/DashboardPage.tsx`, add:

```tsx
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
```

- [ ] **Step 2: Render them**

Find the page header / title area of the Dashboard. Place `<HelpButton pageKey="dashboard" />` inline with the page title (e.g., as a sibling of the `<h1>`). Place `<CoachMark />` as the first child of the main content area (above the dashboard cards/stats):

```tsx
<CoachMark
	pageKey="dashboard"
	title="Dashboard"
	body="This is your dashboard. Generation jobs, recent content, and workspace activity show up here as they happen."
/>
```

If the page does not currently have an `<h1>`, wrap the existing top-of-page block in a flex container with the title on the left and `<HelpButton />` on the right.

- [ ] **Step 3: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(frontend): add coach mark + help button to DashboardPage"
```

### Sub-task 18.2: BrandsPage

**Files:**
- Modify: `frontend/src/pages/BrandsPage.tsx`

- [ ] **Step 1: Add imports + render**

Same pattern as 18.1, but with:

```tsx
<CoachMark
	pageKey="brands"
	title="Brands"
	body="Brands hold the voice, audience, and messaging rules that all your content follows. Create one brand per business or sub-brand you manage."
/>
<HelpButton pageKey="brands" />
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck && git add frontend/src/pages/BrandsPage.tsx && \
  git commit -m "feat(frontend): add coach mark + help button to BrandsPage"
```

### Sub-task 18.3: ProductsPage

**Files:**
- Modify: `frontend/src/pages/ProductsPage.tsx`

- [ ] **Step 1: Add imports + render**

```tsx
<CoachMark
	pageKey="products"
	title="Products"
	body="Products live inside a brand and represent what you're talking about — a service, a launch, a feature. Content is generated against a product, not a brand."
/>
<HelpButton pageKey="products" />
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck && git add frontend/src/pages/ProductsPage.tsx && \
  git commit -m "feat(frontend): add coach mark + help button to ProductsPage"
```

### Sub-task 18.4: GeneratePage

**Files:**
- Modify: `frontend/src/pages/GeneratePage.tsx`

- [ ] **Step 1: Add imports + render**

```tsx
<CoachMark
	pageKey="generate"
	title="Generate content"
	body="Generate content by picking a product and describing the angle. FCE runs the job in the background — you can keep working, and we'll notify you when it's done."
/>
<HelpButton pageKey="generate" />
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck && git add frontend/src/pages/GeneratePage.tsx && \
  git commit -m "feat(frontend): add coach mark + help button to GeneratePage"
```

### Sub-task 18.5: CampaignsPage

**Files:**
- Modify: `frontend/src/pages/CampaignsPage.tsx`

- [ ] **Step 1: Add imports + render**

```tsx
<CoachMark
	pageKey="campaigns"
	title="Campaigns"
	body="Campaigns group related content under one goal or launch — e.g., a product launch with posts, stories, and a long-form piece."
/>
<HelpButton pageKey="campaigns" />
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck && git add frontend/src/pages/CampaignsPage.tsx && \
  git commit -m "feat(frontend): add coach mark + help button to CampaignsPage"
```

### Sub-task 18.6: TopicsPage

**Files:**
- Modify: `frontend/src/pages/TopicsPage.tsx`

- [ ] **Step 1: Add imports + render**

```tsx
<CoachMark
	pageKey="topics"
	title="Topics"
	body="Topics are content ideas you can save, refine, and turn into posts later. Useful for capturing ideas you're not ready to generate yet."
/>
<HelpButton pageKey="topics" />
```

- [ ] **Step 2: Typecheck and commit**

```bash
npm run typecheck && git add frontend/src/pages/TopicsPage.tsx && \
  git commit -m "feat(frontend): add coach mark + help button to TopicsPage"
```

---

## Task 19: Trigger `refreshProgress()` after brand / product / generation creation

The checklist ticks items based on workspace counts. On navigation to a page or workspace switch the progress refreshes automatically (from Task 11's `useEffect`), but a user who creates a brand and stays on the Brands page won't see the checkmark flip until they switch pages. Fix by calling `refreshProgress()` after each creation succeeds.

**Files:**
- Modify: `frontend/src/pages/NewBrandPage.tsx` (or wherever the `POST /api/.../brands` succeeds)
- Modify: the product creation flow (form or page — grep for the POST)
- Modify: the generation-run flow (where `POST /generations` fires or where the SSE "generation complete" event is handled)

- [ ] **Step 1: Find the creation call sites**

From the repo root:

```bash
grep -rn "POST" frontend/src/pages/NewBrandPage.tsx
grep -rn 'api<.*>("/api/workspaces/.*/brands"' frontend/src/
grep -rn 'api<.*>("/api/workspaces/.*/products"' frontend/src/
grep -rn 'api<.*>("/api/workspaces/.*/generations"' frontend/src/
```

Note the exact files and lines where each successful creation resolves.

- [ ] **Step 2: Import `useOnboarding` and call `refreshProgress()`**

In each of those files, after the successful `api(...)` call that creates a brand / product / generation, call:

```tsx
const { refreshProgress } = useOnboarding();
// ...inside the success handler, after the await:
refreshProgress();
```

Wrap with try/catch-style caller style already used in those files. `refreshProgress()` already swallows its own errors, so no extra guard is needed.

- [ ] **Step 3: Typecheck**

From `frontend/`:

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/NewBrandPage.tsx frontend/src/<other-touched-files>
git commit -m "feat(frontend): refresh onboarding progress after brand/product/generation create"
```

---

## Task 20: End-to-end manual verification

No E2E framework is set up (per the spec). Verify the golden path by hand.

- [ ] **Step 1: Start the stack**

From the repo root:

```bash
docker-compose up -d
cd backend && bun run --hot src/index.ts &
cd frontend && npm run dev
```

- [ ] **Step 2: Sign up a brand-new test user via the UI**

Go to `http://localhost:5173/signup`, sign up a new account, click the verification link in the backend logs (`EMAIL_PROVIDER=noop`), log in.

Expected:
- Welcome modal appears over the dashboard.
- Complete the flow ("Create my first brand →") or click Skip.
- After dismissing, the Getting Started checklist appears bottom-right with three unchecked items.

- [ ] **Step 3: Tick each checklist item**

- Create a brand via `/brands/new` → checklist item 1 flips to ✓ within a second of success.
- Create a product → item 2 flips.
- Run a generation → item 3 flips.
- Once all three are done, the card switches to "🎉 You're all set — great work." and fades out ~2s later. Refresh the page — the card stays gone.

- [ ] **Step 4: Verify coach marks**

Navigate to each of the six target pages for the first time. Expected: a dismissible indigo card appears at the top with the copy from the spec.

- Click `×` on each card → refresh the page → card does not reappear.
- Click the `?` icon in the header → the card reappears.
- Click `×` again → refresh → stays dismissed.

- [ ] **Step 5: Cross-session persistence**

Log out. Log back in with the same user.

Expected:
- Welcome modal does NOT appear (flag persisted).
- Checklist does NOT appear if dismissed.
- Coach marks do NOT auto-show on pages already dismissed.

- [ ] **Step 6: Verify grandfathered users see nothing**

Log in as an existing user that was grandfathered by `migrate-onboarding.ts`. Expected: no welcome modal, no checklist, no coach marks on any of the six pages. The `?` icon is still present and re-shows coach marks on demand.

- [ ] **Step 7: Typecheck + tests + lint one last time**

From the repo root:

```bash
cd backend && bunx tsc --noEmit && bun test && bunx biome check --write .
cd ../frontend && npm run typecheck && npm run lint && npm run build
```

Expected: all green.

- [ ] **Step 8: Final commit (only if Biome or the frontend formatter touched anything)**

```bash
git status
# If there are formatting-only diffs:
git add -u && git commit -m "chore: format"
```

---

## Summary

- 20 tasks, ~60-70 steps.
- Backend: 3 new columns on `User`, 1 service, 2 routes, 1 migration script, ~450 lines including tests.
- Frontend: 1 context, 4 components, page wiring on 6 existing pages, ~650 lines.
- No new dependencies on either side.
- Full TDD coverage on `OnboardingService`; manual verification for the UI (no frontend E2E infra in this repo).
