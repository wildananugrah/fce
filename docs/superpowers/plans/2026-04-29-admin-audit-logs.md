# Admin Audit Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the empty `audit_logs` table by instrumenting the handful of admin / sensitive actions a superadmin would care to review (user CRUD, taxonomy, workspace membership, invitations, AI settings, project lifecycle, trash hard-deletes).

**Architecture:** New `AuditService` (constructor-injected) provides a single `log(input)` entry point. Service methods (and a few routes that don't have services) call `audit.log(...)` after the change persists, awaited, soft-fail (errors logged via Winston, never blocking the user request). `AuditLog.workspaceId` becomes nullable to allow superadmin-global actions.

**Tech Stack:** Bun runtime, Hono, Prisma 7, PostgreSQL, `bun:test` runner, Winston (via `ILogger`).

**Spec:** [docs/superpowers/specs/2026-04-29-admin-audit-logs-design.md](../specs/2026-04-29-admin-audit-logs-design.md)

---

## Task 1: Make `AuditLog.workspaceId` nullable

**Files:**
- Modify: `backend/prisma/schema.prisma:661-676`

- [ ] **Step 1: Edit the schema**

Change the field and relation to be optional:

```prisma
model AuditLog {
  id          String   @id @default(uuid())
  workspaceId String?  @map("workspace_id")
  userId      String   @map("user_id")
  action      String
  entityType  String   @map("entity_type")
  entityId    String?  @map("entity_id")
  metadata    Json?
  createdAt   DateTime @default(now()) @map("created_at")

  workspace Workspace? @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id])

  @@index([workspaceId])
  @@index([userId])
  @@map("audit_logs")
}
```

Only two characters change: `String` → `String?` on `workspaceId`, and `Workspace` → `Workspace?` on the relation.

- [ ] **Step 2: Push the schema and regenerate the Prisma client**

Run from the `backend` directory:

```bash
cd backend
bunx prisma db push
```

Expected: "🚀  Your database is now in sync with your Prisma schema." and the generated client is updated. The table is empty so no data warning appears.

- [ ] **Step 3: Verify in the DB**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c "\d audit_logs" | grep workspace_id
```

Expected output line:

```
 workspace_id | text                     |           |          |
```

(No `not null` after the `|` — the column is now nullable.)

- [ ] **Step 4: Type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS. (No code references `auditLog` writes yet, so no signature changes propagate.)

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma
git commit -m "feat(audit): make AuditLog.workspaceId nullable"
```

---

## Task 2: Create `IAuditService` interface and `AuditService` implementation

**Files:**
- Create: `backend/src/interfaces/services/audit.service.interface.ts`
- Create: `backend/src/services/audit.service.ts`
- Create: `backend/tests/services/audit.service.test.ts`

- [ ] **Step 1: Create the interface file**

`backend/src/interfaces/services/audit.service.interface.ts`:

```ts
export interface AuditLogInput {
	workspaceId: string | null;
	userId: string;
	action: string;
	entityType: string;
	entityId: string | null;
	metadata?: Record<string, unknown>;
}

export interface IAuditService {
	log(input: AuditLogInput): Promise<void>;
}
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/services/audit.service.test.ts`:

```ts
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ILogger } from "../../src/interfaces/providers/logger.provider.interface";
import { AuditService } from "../../src/services/audit.service";

class MockLogger implements ILogger {
	warn = mock(() => {});
	info = mock(() => {});
	error = mock(() => {});
	debug = mock(() => {});
	child(): ILogger {
		return this;
	}
}

function createMockPrisma(opts: { throwOnCreate?: boolean } = {}) {
	const created: any[] = [];
	return {
		created,
		client: {
			auditLog: {
				create: async ({ data }: { data: any }) => {
					if (opts.throwOnCreate) throw new Error("simulated DB failure");
					created.push(data);
					return { id: "audit-1", ...data };
				},
			},
		} as any,
	};
}

describe("AuditService", () => {
	it("writes the row with all provided fields", async () => {
		const { client, created } = createMockPrisma();
		const logger = new MockLogger();
		const service = new AuditService(client, logger);

		await service.log({
			workspaceId: "ws-1",
			userId: "user-1",
			action: "workspace.member_role_change",
			entityType: "workspace_member",
			entityId: "user-2",
			metadata: { targetEmail: "x@y.com", fromRole: "member", toRole: "admin" },
		});

		expect(created).toHaveLength(1);
		expect(created[0]).toMatchObject({
			workspaceId: "ws-1",
			userId: "user-1",
			action: "workspace.member_role_change",
			entityType: "workspace_member",
			entityId: "user-2",
			metadata: { targetEmail: "x@y.com", fromRole: "member", toRole: "admin" },
		});
	});

	it("accepts null workspaceId for superadmin-global actions", async () => {
		const { client, created } = createMockPrisma();
		const service = new AuditService(client, new MockLogger());

		await service.log({
			workspaceId: null,
			userId: "user-1",
			action: "user.create",
			entityType: "user",
			entityId: "user-2",
			metadata: { email: "new@user.com" },
		});

		expect(created[0].workspaceId).toBeNull();
	});

	it("stores null metadata when omitted", async () => {
		const { client, created } = createMockPrisma();
		const service = new AuditService(client, new MockLogger());

		await service.log({
			workspaceId: "ws-1",
			userId: "user-1",
			action: "user.password_reset",
			entityType: "user",
			entityId: "user-2",
		});

		expect(created[0].metadata).toBeNull();
	});

	it("soft-fails on DB error: does not throw, logs via Winston", async () => {
		const { client } = createMockPrisma({ throwOnCreate: true });
		const logger = new MockLogger();
		const service = new AuditService(client, logger);

		// Must NOT throw — the user-facing operation must continue.
		await service.log({
			workspaceId: null,
			userId: "user-1",
			action: "user.create",
			entityType: "user",
			entityId: "user-2",
		});

		expect(logger.error).toHaveBeenCalledTimes(1);
		const [msg, meta] = (logger.error as any).mock.calls[0];
		expect(msg).toBe("audit.log failed");
		expect(meta.action).toBe("user.create");
	});
});
```

- [ ] **Step 3: Run the tests, expect failure**

```bash
cd backend && bun test tests/services/audit.service.test.ts
```

Expected: FAIL — `Cannot find module '../../src/services/audit.service'`.

- [ ] **Step 4: Implement `AuditService`**

`backend/src/services/audit.service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { AuditLogInput, IAuditService } from "../interfaces/services/audit.service.interface";

export class AuditService implements IAuditService {
	constructor(
		private prisma: PrismaClient,
		private logger: ILogger,
	) {}

	async log(input: AuditLogInput): Promise<void> {
		try {
			await this.prisma.auditLog.create({
				data: {
					workspaceId: input.workspaceId,
					userId: input.userId,
					action: input.action,
					entityType: input.entityType,
					entityId: input.entityId,
					metadata: (input.metadata ?? null) as any,
				},
			});
		} catch (err) {
			this.logger.error("audit.log failed", {
				action: input.action,
				entityType: input.entityType,
				entityId: input.entityId,
				err: err instanceof Error ? err.message : String(err),
			});
		}
	}
}
```

- [ ] **Step 5: Run tests, expect pass**

```bash
cd backend && bun test tests/services/audit.service.test.ts
```

Expected: 4 pass, 0 fail.

- [ ] **Step 6: Type-check + commit**

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS.

```bash
git add backend/src/interfaces/services/audit.service.interface.ts \
        backend/src/services/audit.service.ts \
        backend/tests/services/audit.service.test.ts
git commit -m "feat(audit): add AuditService with soft-fail logging"
```

---

## Task 3: Wire `AuditService` into the composition root

**Files:**
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Find the right insertion point**

Search for the AdminService construction line (around `:296` per current main):

```bash
grep -n "new AdminService" backend/src/index.ts
```

Expected: one hit. Insert the `AuditService` construction immediately above it, so `auditService` is available to inject everywhere.

- [ ] **Step 2: Add the import**

In `backend/src/index.ts`, add to the existing service imports block:

```ts
import { AuditService } from "./services/audit.service";
```

- [ ] **Step 3: Construct `auditService` before `adminService`**

Above the `const adminService = new AdminService(...)` line, add:

```ts
const auditService = new AuditService(prisma, logger);
```

(`prisma` and `logger` are already in scope at that point — the same variables every other service uses.)

- [ ] **Step 4: Type-check + commit**

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS — no other code consumes `auditService` yet.

```bash
git add backend/src/index.ts
git commit -m "feat(audit): wire AuditService in composition root"
```

---

## Task 4: Inject `auditService` into `AdminService` and thread `actingUserId`

This task is a pure refactor — no audit emits yet. We add the constructor dependency and the `actingUserId` parameter to every method whose action will be audited. Splitting the refactor from the emits keeps each later task small.

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/src/interfaces/services/admin.service.interface.ts`
- Modify: `backend/src/routes/admin.route.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update the interface signatures**

In `backend/src/interfaces/services/admin.service.interface.ts`, add an `actingUserId: string` parameter as the **first** argument of every audited method:

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
	createTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		data: { name: string; description?: string },
	): Promise<any>;
	updateTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
		data: { name?: string; description?: string },
	): Promise<any>;
	deleteTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
	): Promise<void>;
}
```

- [ ] **Step 2: Update `AdminService` constructor and method signatures**

In `backend/src/services/admin.service.ts`:

```ts
import type { PrismaClient } from "@prisma/client";
import { WORKSPACE_ROLES } from "../constants/roles";
import type { IAdminService } from "../interfaces/services/admin.service.interface";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
import { hashPassword } from "../utils/password";

interface AdminConfig {
	userDefaultMaxWorkspaces: number;
	userDefaultMaxProjects: number;
}

export class AdminService implements IAdminService {
	constructor(
		private prisma: PrismaClient,
		private audit: IAuditService,
		private config: AdminConfig,
	) {}
	// ...
}
```

Then update each method signature to accept `actingUserId` as the first parameter. **Do not add audit calls yet.** Method bodies stay the same; only the parameter list changes. Example:

```ts
async createUser(
	_actingUserId: string,
	input: { email: string; password: string; fullName?: string; isSuperadmin?: boolean },
) {
	// existing body unchanged
}

async deleteUser(_actingUserId: string, userId: string) {
	await this.prisma.user.delete({ where: { id: userId } });
}
```

Apply the same `_actingUserId` prefix (so TS doesn't complain about unused parameters) to: `updateUser`, `resetPassword`, `setUserWorkspaceRole`, `removeUserFromWorkspace`, `createTaxonomyItem`, `updateTaxonomyItem`, `deleteTaxonomyItem`. Each subsequent task drops the underscore as it adds the actual audit call.

- [ ] **Step 3: Update `backend/src/routes/admin.route.ts` call sites**

Inside the route handlers, route calls now look like:

```ts
// POST /users
const user = await adminService.createUser(c.get("userId"), {
	email: body.email,
	password: body.password,
	fullName: typeof body.fullName === "string" ? body.fullName : undefined,
	isSuperadmin: body.isSuperadmin === true,
});

// PATCH /users/:id
const user = await adminService.updateUser(c.get("userId"), userId, body);

// DELETE /users/:id
await adminService.deleteUser(c.get("userId"), userId);

// POST /users/:id/password
await adminService.resetPassword(c.get("userId"), userId, body.password);

// PUT /users/:id/workspaces/:workspaceId
await adminService.setUserWorkspaceRole(c.get("userId"), userId, workspaceId, role);

// DELETE /users/:id/workspaces/:workspaceId
await adminService.removeUserFromWorkspace(c.get("userId"), userId, workspaceId);

// POST /taxonomy/<type>
const item = await adminService.createTaxonomyItem(c.get("userId"), type as any, body);

// PATCH /taxonomy/<type>/:id
const item = await adminService.updateTaxonomyItem(c.get("userId"), type as any, id, body);

// DELETE /taxonomy/<type>/:id
await adminService.deleteTaxonomyItem(c.get("userId"), type as any, id);
```

Add no other behavior changes. The `actingUserId` value comes from the JWT auth middleware, which already populates `c.get("userId")`.

- [ ] **Step 4: Update the composition root**

In `backend/src/index.ts`, the `AdminService` instantiation now takes `auditService` as the second arg:

```ts
const adminService = new AdminService(prisma, auditService, {
	userDefaultMaxWorkspaces: env.userDefaultMaxWorkspaces,
	userDefaultMaxProjects: env.userDefaultMaxProjects,
});
```

- [ ] **Step 5: Type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS. If it fails, the most likely cause is a missed call site in the route file. Fix and re-run.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/admin.service.ts \
        backend/src/interfaces/services/admin.service.interface.ts \
        backend/src/routes/admin.route.ts \
        backend/src/index.ts
git commit -m "refactor(audit): inject AuditService into AdminService and thread actingUserId"
```

---

## Task 5: Emit `user.create`, `user.delete`, `user.password_reset`

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Create: `backend/tests/services/admin.service.audit.test.ts`

- [ ] **Step 1: Write the failing tests**

`backend/tests/services/admin.service.audit.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import type { IAuditService } from "../../src/interfaces/services/audit.service.interface";
import { AdminService } from "../../src/services/admin.service";

function createMockAudit(): { spy: any; service: IAuditService } {
	const spy = mock(async (_input: any) => {});
	return {
		spy,
		service: { log: spy as any },
	};
}

function createMockPrismaForUserCreate() {
	return {
		user: {
			findUnique: async () => null,
			create: async ({ data }: { data: any }) => ({
				id: "new-user-id",
				email: data.email,
				fullName: data.fullName,
				status: "active",
				isSuperadmin: data.isSuperadmin,
				createdAt: new Date(),
			}),
			delete: async () => ({}),
			update: async () => ({}),
		},
	} as any;
}

const config = { userDefaultMaxWorkspaces: 3, userDefaultMaxProjects: 5 };

describe("AdminService audit emits", () => {
	it("emits user.create with email and fullName in metadata", async () => {
		const { service: audit, spy } = createMockAudit();
		const svc = new AdminService(createMockPrismaForUserCreate(), audit, config);

		await svc.createUser("admin-1", {
			email: "new@user.com",
			password: "password123",
			fullName: "New User",
			isSuperadmin: false,
		});

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).toMatchObject({
			workspaceId: null,
			userId: "admin-1",
			action: "user.create",
			entityType: "user",
			entityId: "new-user-id",
			metadata: { email: "new@user.com", fullName: "New User", isSuperadmin: false },
		});
	});

	it("emits user.delete with target email preserved", async () => {
		const { service: audit, spy } = createMockAudit();
		const prisma = {
			user: {
				findUnique: async () => ({
					id: "target-user",
					email: "deleted@user.com",
					fullName: "Deleted Person",
				}),
				delete: async () => ({}),
			},
		} as any;
		const svc = new AdminService(prisma, audit, config);

		await svc.deleteUser("admin-1", "target-user");

		expect(spy.mock.calls[0][0]).toMatchObject({
			workspaceId: null,
			userId: "admin-1",
			action: "user.delete",
			entityType: "user",
			entityId: "target-user",
			metadata: { email: "deleted@user.com", fullName: "Deleted Person" },
		});
	});

	it("emits user.password_reset with target email", async () => {
		const { service: audit, spy } = createMockAudit();
		const prisma = {
			user: {
				findUnique: async () => ({ id: "target-user", email: "target@user.com" }),
				update: async () => ({}),
			},
		} as any;
		const svc = new AdminService(prisma, audit, config);

		await svc.resetPassword("admin-1", "target-user", "newpassword123");

		expect(spy.mock.calls[0][0]).toMatchObject({
			workspaceId: null,
			userId: "admin-1",
			action: "user.password_reset",
			entityType: "user",
			entityId: "target-user",
			metadata: { targetEmail: "target@user.com" },
		});
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: 3 fail (the audit spy is never called).

- [ ] **Step 3: Add the audit emits**

In `backend/src/services/admin.service.ts`, update the three methods. **Note**: `deleteUser` and `resetPassword` need to look up the target's email *before* mutating, so we read first, then write, then audit.

```ts
async createUser(
	actingUserId: string,
	input: { email: string; password: string; fullName?: string; isSuperadmin?: boolean },
) {
	const email = input.email.trim().toLowerCase();
	if (!email) throw new Error("Email is required");
	if (!input.password || input.password.length < 8) {
		throw new Error("Password must be at least 8 characters");
	}
	const existing = await this.prisma.user.findUnique({ where: { email } });
	if (existing) throw new Error("Email already registered");
	const passwordHash = await hashPassword(input.password);
	const user = await this.prisma.user.create({
		data: {
			email,
			passwordHash,
			fullName: input.fullName ?? null,
			isSuperadmin: input.isSuperadmin ?? false,
			maxWorkspaces: this.config.userDefaultMaxWorkspaces,
			maxProjects: this.config.userDefaultMaxProjects,
		},
		select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true, createdAt: true },
	});
	await this.audit.log({
		workspaceId: null,
		userId: actingUserId,
		action: "user.create",
		entityType: "user",
		entityId: user.id,
		metadata: {
			email: user.email,
			fullName: user.fullName,
			isSuperadmin: user.isSuperadmin,
		},
	});
	return user;
}

async deleteUser(actingUserId: string, userId: string) {
	const target = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { email: true, fullName: true },
	});
	await this.prisma.user.delete({ where: { id: userId } });
	await this.audit.log({
		workspaceId: null,
		userId: actingUserId,
		action: "user.delete",
		entityType: "user",
		entityId: userId,
		metadata: target ? { email: target.email, fullName: target.fullName } : {},
	});
}

async resetPassword(actingUserId: string, userId: string, newPassword: string) {
	if (!newPassword || newPassword.length < 8) {
		throw new Error("Password must be at least 8 characters");
	}
	const target = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});
	const passwordHash = await hashPassword(newPassword);
	await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
	await this.audit.log({
		workspaceId: null,
		userId: actingUserId,
		action: "user.password_reset",
		entityType: "user",
		entityId: userId,
		metadata: { targetEmail: target?.email ?? null },
	});
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/admin.service.ts \
        backend/tests/services/admin.service.audit.test.ts
git commit -m "feat(audit): emit user.create, user.delete, user.password_reset"
```

---

## Task 6: Emit `user.update`, `user.superadmin_grant`, `user.superadmin_revoke` with field-diff

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/tests/services/admin.service.audit.test.ts`

The `updateUser` method needs to compute a diff so we can split actions: `isSuperadmin` flips emit `user.superadmin_grant` / `user.superadmin_revoke`, and `email` / `status` changes emit `user.update`. Pure `fullName` edits emit nothing.

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/services/admin.service.audit.test.ts` (inside the same `describe`):

```ts
it("emits user.update only when email or status changes", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		user: {
			findUnique: async () => ({
				id: "u1",
				email: "old@x.com",
				status: "active",
				isSuperadmin: false,
			}),
			update: async ({ data }: { data: any }) => ({
				id: "u1",
				email: data.email ?? "old@x.com",
				status: data.status ?? "active",
				isSuperadmin: false,
			}),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateUser("admin-1", "u1", { email: "new@x.com", status: "suspended" });

	expect(spy).toHaveBeenCalledTimes(1);
	expect(spy.mock.calls[0][0]).toMatchObject({
		action: "user.update",
		entityType: "user",
		entityId: "u1",
		metadata: {
			targetEmail: "old@x.com",
			changes: {
				email: { from: "old@x.com", to: "new@x.com" },
				status: { from: "active", to: "suspended" },
			},
		},
	});
});

it("does NOT emit anything for a pure fullName update", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		user: {
			findUnique: async () => ({
				id: "u1",
				email: "x@y.com",
				status: "active",
				isSuperadmin: false,
			}),
			update: async () => ({ id: "u1", email: "x@y.com", status: "active", isSuperadmin: false }),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateUser("admin-1", "u1", { fullName: "Anything" });

	expect(spy).not.toHaveBeenCalled();
});

it("emits user.superadmin_grant when isSuperadmin flips false→true", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		user: {
			findUnique: async () => ({
				id: "u1",
				email: "x@y.com",
				status: "active",
				isSuperadmin: false,
			}),
			update: async () => ({ id: "u1", email: "x@y.com", status: "active", isSuperadmin: true }),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateUser("admin-1", "u1", { isSuperadmin: true });

	expect(spy).toHaveBeenCalledTimes(1);
	expect(spy.mock.calls[0][0].action).toBe("user.superadmin_grant");
	expect(spy.mock.calls[0][0].metadata).toMatchObject({ targetEmail: "x@y.com" });
});

it("emits user.superadmin_revoke when isSuperadmin flips true→false", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		user: {
			findUnique: async () => ({
				id: "u1",
				email: "x@y.com",
				status: "active",
				isSuperadmin: true,
			}),
			update: async () => ({ id: "u1", email: "x@y.com", status: "active", isSuperadmin: false }),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateUser("admin-1", "u1", { isSuperadmin: false });

	expect(spy.mock.calls[0][0].action).toBe("user.superadmin_revoke");
});

it("emits both user.update AND user.superadmin_grant when both change in one call", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		user: {
			findUnique: async () => ({
				id: "u1",
				email: "old@x.com",
				status: "active",
				isSuperadmin: false,
			}),
			update: async () => ({
				id: "u1",
				email: "new@x.com",
				status: "active",
				isSuperadmin: true,
			}),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateUser("admin-1", "u1", { email: "new@x.com", isSuperadmin: true });

	expect(spy).toHaveBeenCalledTimes(2);
	const actions = spy.mock.calls.map((c: any) => c[0].action).sort();
	expect(actions).toEqual(["user.superadmin_grant", "user.update"]);
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: 5 new tests fail.

- [ ] **Step 3: Implement `updateUser` with diff logic**

Replace `updateUser` in `backend/src/services/admin.service.ts`:

```ts
async updateUser(
	actingUserId: string,
	userId: string,
	data: { fullName?: string | null; status?: string; isSuperadmin?: boolean; email?: string },
) {
	const before = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { email: true, status: true, isSuperadmin: true },
	});

	const patch: Record<string, unknown> = {};
	if (typeof data.fullName === "string" || data.fullName === null) patch.fullName = data.fullName;
	if (typeof data.status === "string") patch.status = data.status;
	if (typeof data.isSuperadmin === "boolean") patch.isSuperadmin = data.isSuperadmin;
	if (typeof data.email === "string" && data.email.trim()) {
		patch.email = data.email.trim().toLowerCase();
	}

	const updated = await this.prisma.user.update({
		where: { id: userId },
		data: patch,
		select: { id: true, email: true, fullName: true, status: true, isSuperadmin: true },
	});

	if (before) {
		// Build the audit-worthy diff. fullName changes are intentionally not audited.
		const changes: Record<string, { from: unknown; to: unknown }> = {};
		if (typeof patch.email === "string" && patch.email !== before.email) {
			changes.email = { from: before.email, to: patch.email };
		}
		if (typeof patch.status === "string" && patch.status !== before.status) {
			changes.status = { from: before.status, to: patch.status };
		}

		if (Object.keys(changes).length > 0) {
			await this.audit.log({
				workspaceId: null,
				userId: actingUserId,
				action: "user.update",
				entityType: "user",
				entityId: userId,
				metadata: { targetEmail: before.email, changes },
			});
		}

		if (typeof patch.isSuperadmin === "boolean" && patch.isSuperadmin !== before.isSuperadmin) {
			await this.audit.log({
				workspaceId: null,
				userId: actingUserId,
				action: patch.isSuperadmin ? "user.superadmin_grant" : "user.superadmin_revoke",
				entityType: "user",
				entityId: userId,
				metadata: { targetEmail: before.email },
			});
		}
	}

	return updated;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: all 8 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/admin.service.ts \
        backend/tests/services/admin.service.audit.test.ts
git commit -m "feat(audit): emit user.update with diff and superadmin grant/revoke"
```

---

## Task 7: Emit `taxonomy.create`, `taxonomy.update`, `taxonomy.delete`

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/tests/services/admin.service.audit.test.ts`

The four taxonomy types (`framework`, `hookType`, `tonePreset`, `visualStyle`) map to `entityType` strings using `snake_case` per the spec:

```ts
const TAXONOMY_ENTITY_TYPE: Record<string, string> = {
	framework: "framework",
	hookType: "hook_type",
	tonePreset: "tone_preset",
	visualStyle: "visual_style",
};
```

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/services/admin.service.audit.test.ts`:

```ts
it("emits taxonomy.create with name and description", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		framework: {
			create: async ({ data }: { data: any }) => ({ id: "fw-1", ...data }),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.createTaxonomyItem("admin-1", "framework", { name: "AIDA", description: "..." });

	expect(spy.mock.calls[0][0]).toMatchObject({
		workspaceId: null,
		userId: "admin-1",
		action: "taxonomy.create",
		entityType: "framework",
		entityId: "fw-1",
		metadata: { name: "AIDA", description: "..." },
	});
});

it("emits taxonomy.update with diff over name and description", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		hookType: {
			findUnique: async () => ({ id: "h1", name: "Curiosity", description: "old" }),
			update: async ({ data }: { data: any }) => ({ id: "h1", name: data.name ?? "Curiosity", description: data.description ?? "old" }),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.updateTaxonomyItem("admin-1", "hookType", "h1", { description: "new" });

	expect(spy.mock.calls[0][0]).toMatchObject({
		action: "taxonomy.update",
		entityType: "hook_type",
		entityId: "h1",
		metadata: {
			name: "Curiosity",
			changes: { description: { from: "old", to: "new" } },
		},
	});
});

it("emits taxonomy.delete with the deleted name", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		tonePreset: {
			findUnique: async () => ({ id: "t1", name: "Casual" }),
			delete: async () => ({}),
		},
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.deleteTaxonomyItem("admin-1", "tonePreset", "t1");

	expect(spy.mock.calls[0][0]).toMatchObject({
		action: "taxonomy.delete",
		entityType: "tone_preset",
		entityId: "t1",
		metadata: { name: "Casual" },
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the three taxonomy methods**

In `backend/src/services/admin.service.ts`, near the bottom of the class, add the entity-type map and replace the three methods:

```ts
// Maps the camelCase taxonomy keys used internally to the snake_case entityType
// strings stored in audit_logs (so the values are stable, log-readable strings).
private static readonly TAXONOMY_ENTITY_TYPE: Record<string, string> = {
	framework: "framework",
	hookType: "hook_type",
	tonePreset: "tone_preset",
	visualStyle: "visual_style",
};

async createTaxonomyItem(
	actingUserId: string,
	type: "framework" | "hookType" | "tonePreset" | "visualStyle",
	data: { name: string; description?: string },
) {
	const model = this.getModel(type);
	const item = await (model as any).create({ data });
	await this.audit.log({
		workspaceId: null,
		userId: actingUserId,
		action: "taxonomy.create",
		entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
		entityId: item.id,
		metadata: { name: data.name, description: data.description ?? null },
	});
	return item;
}

async updateTaxonomyItem(
	actingUserId: string,
	type: "framework" | "hookType" | "tonePreset" | "visualStyle",
	id: string,
	data: { name?: string; description?: string },
) {
	const model = this.getModel(type);
	const before = await (model as any).findUnique({ where: { id } });
	const item = await (model as any).update({ where: { id }, data });

	const changes: Record<string, { from: unknown; to: unknown }> = {};
	if (before) {
		if (typeof data.name === "string" && data.name !== before.name) {
			changes.name = { from: before.name, to: data.name };
		}
		if (typeof data.description === "string" && data.description !== before.description) {
			changes.description = { from: before.description, to: data.description };
		}
	}

	if (Object.keys(changes).length > 0) {
		await this.audit.log({
			workspaceId: null,
			userId: actingUserId,
			action: "taxonomy.update",
			entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
			entityId: id,
			metadata: { name: before?.name ?? null, changes },
		});
	}
	return item;
}

async deleteTaxonomyItem(
	actingUserId: string,
	type: "framework" | "hookType" | "tonePreset" | "visualStyle",
	id: string,
) {
	const model = this.getModel(type);
	const before = await (model as any).findUnique({ where: { id } });
	await (model as any).delete({ where: { id } });
	await this.audit.log({
		workspaceId: null,
		userId: actingUserId,
		action: "taxonomy.delete",
		entityType: AdminService.TAXONOMY_ENTITY_TYPE[type],
		entityId: id,
		metadata: { name: before?.name ?? null },
	});
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: all 11 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/admin.service.ts \
        backend/tests/services/admin.service.audit.test.ts
git commit -m "feat(audit): emit taxonomy.create, taxonomy.update (diff), taxonomy.delete"
```

---

## Task 8: Emit `workspace.member_role_change` and `workspace.member_remove` (admin path)

**Files:**
- Modify: `backend/src/services/admin.service.ts`
- Modify: `backend/tests/services/admin.service.audit.test.ts`

These two events come from the global admin panel path (`AdminService.setUserWorkspaceRole`, `AdminService.removeUserFromWorkspace`). The duplicate path through `WorkspaceService.removeMember` (workspace settings UI) is handled in Task 10.

- [ ] **Step 1: Append failing tests**

Append to `backend/tests/services/admin.service.audit.test.ts`:

```ts
it("emits workspace.member_role_change with from/to roles", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		userWorkspaceRole: {
			findUnique: async () => ({ role: "member" }),
			upsert: async () => ({}),
		},
		user: { findUnique: async () => ({ email: "target@x.com" }) },
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.setUserWorkspaceRole("admin-1", "target-user", "ws-1", "admin");

	expect(spy.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		userId: "admin-1",
		action: "workspace.member_role_change",
		entityType: "workspace_member",
		entityId: "target-user",
		metadata: { targetEmail: "target@x.com", fromRole: "member", toRole: "admin" },
	});
});

it("emits workspace.member_remove with priorRole when target was a member", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		userWorkspaceRole: {
			findUnique: async () => ({ role: "admin" }),
			delete: async () => ({}),
		},
		userProjectMembership: { deleteMany: async () => ({ count: 0 }) },
		user: { findUnique: async () => ({ email: "kicked@x.com" }) },
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.removeUserFromWorkspace("admin-1", "target-user", "ws-1");

	expect(spy.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		action: "workspace.member_remove",
		entityType: "workspace_member",
		entityId: "target-user",
		metadata: { targetEmail: "kicked@x.com", priorRole: "admin" },
	});
});

it("emits workspace.member_remove even if target had no prior role (priorRole: null)", async () => {
	const { service: audit, spy } = createMockAudit();
	const prisma = {
		userWorkspaceRole: {
			findUnique: async () => null,
			delete: async () => {
				throw new Error("not a member");
			},
		},
		userProjectMembership: { deleteMany: async () => ({ count: 0 }) },
		user: { findUnique: async () => ({ email: "kicked@x.com" }) },
	} as any;
	const svc = new AdminService(prisma, audit, config);

	await svc.removeUserFromWorkspace("admin-1", "target-user", "ws-1");

	expect(spy.mock.calls[0][0].metadata).toMatchObject({
		targetEmail: "kicked@x.com",
		priorRole: null,
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the emits**

Replace both methods in `backend/src/services/admin.service.ts`:

```ts
async setUserWorkspaceRole(
	actingUserId: string,
	userId: string,
	workspaceId: string,
	role: "admin" | "member",
) {
	if (role !== WORKSPACE_ROLES.ADMIN && role !== WORKSPACE_ROLES.MEMBER) {
		throw new Error(`Unknown role: ${role}`);
	}
	const before = await this.prisma.userWorkspaceRole.findUnique({
		where: { userId_workspaceId: { userId, workspaceId } },
	});
	await this.prisma.userWorkspaceRole.upsert({
		where: { userId_workspaceId: { userId, workspaceId } },
		update: { role },
		create: { userId, workspaceId, role },
	});

	if (before?.role === role) return; // no-op change, don't audit

	const target = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});

	await this.audit.log({
		workspaceId,
		userId: actingUserId,
		action: "workspace.member_role_change",
		entityType: "workspace_member",
		entityId: userId,
		metadata: {
			targetEmail: target?.email ?? null,
			fromRole: before?.role ?? null,
			toRole: role,
		},
	});
}

async removeUserFromWorkspace(actingUserId: string, userId: string, workspaceId: string) {
	const before = await this.prisma.userWorkspaceRole.findUnique({
		where: { userId_workspaceId: { userId, workspaceId } },
	});
	await this.prisma.userWorkspaceRole
		.delete({ where: { userId_workspaceId: { userId, workspaceId } } })
		.catch(() => {
			// Not a member — no-op
		});
	await this.prisma.userProjectMembership.deleteMany({
		where: { userId, project: { workspaceId } },
	});

	const target = await this.prisma.user.findUnique({
		where: { id: userId },
		select: { email: true },
	});

	await this.audit.log({
		workspaceId,
		userId: actingUserId,
		action: "workspace.member_remove",
		entityType: "workspace_member",
		entityId: userId,
		metadata: {
			targetEmail: target?.email ?? null,
			priorRole: before?.role ?? null,
		},
	});
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/admin.service.audit.test.ts
```

Expected: all 14 pass.

- [ ] **Step 5: Run the full test suite**

```bash
cd backend && bun test
```

Expected: PASS. (Catches any unexpected impact on other tests.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/admin.service.ts \
        backend/tests/services/admin.service.audit.test.ts
git commit -m "feat(audit): emit workspace.member_role_change and workspace.member_remove (admin path)"
```

---

## Task 9: Inject `auditService` into `WorkspaceService` and thread `actingUserId`

Like Task 4, this is a pure refactor — no audit emits yet. Adds the constructor dependency and the `actingUserId` parameter to the methods that will emit events.

**Files:**
- Modify: `backend/src/interfaces/services/workspace.service.interface.ts`
- Modify: `backend/src/services/workspace.service.ts`
- Modify: `backend/src/routes/workspace.route.ts`
- Modify: `backend/src/index.ts`

- [ ] **Step 1: Update the interface**

In `backend/src/interfaces/services/workspace.service.interface.ts`, add `actingUserId: string` as the first parameter on the four methods we'll audit:

```ts
// (existing methods that already take a "user did this" id keep their signatures —
// invite already takes invitedBy, acceptInvitation already takes userId, etc.)

removeMember(actingUserId: string, workspaceId: string, userId: string): Promise<void>;
updateInvitation(
	actingUserId: string,
	invitationId: string,
	data: { status: string },
): Promise<WorkspaceInvitation>;
```

(The `invite` method already has `invitedBy` and `acceptInvitation` already has `userId` — those play the role of `actingUserId` already, so they don't need new parameters.)

- [ ] **Step 2: Update `WorkspaceService` constructor**

In `backend/src/services/workspace.service.ts`:

```ts
import type { IAuditService } from "../interfaces/services/audit.service.interface";

export class WorkspaceService implements IWorkspaceService {
	constructor(
		private workspaceRepository: IWorkspaceRepository,
		private emailProvider: IEmailProvider,
		private userRepository: IUserRepository,
		private invitationConfig: InvitationConfig,
		private audit: IAuditService,
	) {}
	// ...
}
```

Update the two method signatures to take `actingUserId`:

```ts
async removeMember(_actingUserId: string, workspaceId: string, userId: string): Promise<void> {
	// existing body unchanged
}

async updateInvitation(
	_actingUserId: string,
	invitationId: string,
	data: { status: string },
): Promise<WorkspaceInvitation> {
	return this.workspaceRepository.updateInvitation(invitationId, data);
}
```

(Underscore prefix avoids unused-parameter complaints; later tasks drop the underscore.)

- [ ] **Step 3: Update route call sites**

In `backend/src/routes/workspace.route.ts`, update the call sites:

```ts
// PATCH /:id/invitations/:invId
const invitation = await workspaceService.updateInvitation(
	c.get("userId"),
	c.req.param("invId"),
	body,
);

// DELETE /:id/members/:memberId
await workspaceService.removeMember(c.get("userId"), workspaceId, memberId);
```

- [ ] **Step 4: Update the composition root**

In `backend/src/index.ts`, find the `WorkspaceService` instantiation and append `auditService`:

```ts
const workspaceService = new WorkspaceService(
	workspaceRepository,
	emailProvider,
	userRepository,
	{ appUrl: env.appUrl, tokenExpiry: env.invitationTokenExpiry },
	auditService,
);
```

(Adjust to match the actual existing constructor invocation; the new arg is appended last.)

- [ ] **Step 5: Type-check**

```bash
cd backend && bunx tsc --noEmit
```

Expected: PASS. If a workspace service test mock now has the wrong constructor arity, fix the mock to pass a no-op `audit: { log: async () => {} }` as the new arg. The existing `workspace.service.test.ts` may need this update.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/workspace.service.ts \
        backend/src/interfaces/services/workspace.service.interface.ts \
        backend/src/routes/workspace.route.ts \
        backend/src/index.ts \
        backend/tests/services/workspace.service.test.ts
git commit -m "refactor(audit): inject AuditService into WorkspaceService and thread actingUserId"
```

---

## Task 10: Emit `workspace.member_remove` and `workspace.invitation_create` in `WorkspaceService`

**Files:**
- Modify: `backend/src/services/workspace.service.ts`
- Create: `backend/tests/services/workspace.service.audit.test.ts`

`workspace.member_remove` was already emitted from `AdminService` in Task 8. We emit it again here because the workspace settings UI uses a different code path (`WorkspaceService.removeMember`) — both paths need coverage. Action name + metadata stay identical.

- [ ] **Step 1: Write the failing tests**

`backend/tests/services/workspace.service.audit.test.ts`:

```ts
import { describe, expect, it, mock } from "bun:test";
import type { IAuditService } from "../../src/interfaces/services/audit.service.interface";
import { WorkspaceService } from "../../src/services/workspace.service";

function createMockAudit() {
	const spy = mock(async (_input: any) => {});
	return { spy, service: { log: spy as any } as IAuditService };
}

const invitationConfig = { appUrl: "http://localhost:5173", tokenExpiry: "7d" };

const baseEmailProvider = {
	sendInvitation: async () => {},
	sendVerification: async () => {},
	sendPasswordReset: async () => {},
} as any;

const baseUserRepo = {
	findById: async (id: string) => ({ id, fullName: "Tester", email: "tester@x.com" }),
} as any;

describe("WorkspaceService audit emits", () => {
	it("emits workspace.member_remove via the workspace settings path", async () => {
		const { spy, service: audit } = createMockAudit();
		const workspaceRepo = {
			findMembers: async () => [
				{ userId: "target", role: "member", user: { email: "kicked@x.com" } },
				{ userId: "a1", role: "admin", user: { email: "admin@x.com" } },
				{ userId: "a2", role: "admin", user: { email: "admin2@x.com" } },
			],
			removeMember: async () => {},
		} as any;
		const svc = new WorkspaceService(
			workspaceRepo,
			baseEmailProvider,
			baseUserRepo,
			invitationConfig,
			audit,
		);

		await svc.removeMember("actor-1", "ws-1", "target");

		expect(spy.mock.calls[0][0]).toMatchObject({
			workspaceId: "ws-1",
			userId: "actor-1",
			action: "workspace.member_remove",
			entityType: "workspace_member",
			entityId: "target",
			metadata: { targetEmail: "kicked@x.com", priorRole: "member" },
		});
	});

	it("emits workspace.invitation_create with invited email and role", async () => {
		const { spy, service: audit } = createMockAudit();
		const workspaceRepo = {
			findMembers: async () => [],
			createInvitation: async (data: any) => ({
				id: "inv-1",
				workspaceId: data.workspaceId,
				email: data.email,
				role: data.role,
				invitedBy: data.invitedBy,
				createdAt: new Date(),
				status: "pending",
			}),
			findById: async () => ({ id: "ws-1", name: "Acme" }),
		} as any;
		const svc = new WorkspaceService(
			workspaceRepo,
			baseEmailProvider,
			baseUserRepo,
			invitationConfig,
			audit,
		);

		await svc.invite("ws-1", "actor-1", { email: "invitee@x.com", role: "editor" });

		expect(spy.mock.calls[0][0]).toMatchObject({
			workspaceId: "ws-1",
			userId: "actor-1",
			action: "workspace.invitation_create",
			entityType: "invitation",
			entityId: "inv-1",
			metadata: { invitedEmail: "invitee@x.com", role: "editor" },
		});
		// expiresAt should be present and a parseable date string
		expect(typeof spy.mock.calls[0][0].metadata.expiresAt).toBe("string");
	});
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/workspace.service.audit.test.ts
```

Expected: 2 fail.

- [ ] **Step 3: Implement the emits**

Update `removeMember` and `invite` in `backend/src/services/workspace.service.ts`:

```ts
async removeMember(actingUserId: string, workspaceId: string, userId: string): Promise<void> {
	const members = await this.workspaceRepository.findMembers(workspaceId);
	const target = members.find((m) => m.userId === userId);
	const admins = members.filter((m) => m.role === "admin");
	const isTargetAdmin = admins.some((m) => m.userId === userId);

	if (isTargetAdmin && admins.length <= 1) {
		throw new Error("Cannot remove the last admin from the workspace");
	}

	await this.workspaceRepository.removeMember(workspaceId, userId);

	await this.audit.log({
		workspaceId,
		userId: actingUserId,
		action: "workspace.member_remove",
		entityType: "workspace_member",
		entityId: userId,
		metadata: {
			targetEmail: target?.user.email ?? null,
			priorRole: target?.role ?? null,
		},
	});
}

async invite(
	workspaceId: string,
	invitedBy: string,
	input: InviteMemberInput,
): Promise<WorkspaceInvitation> {
	const members = await this.workspaceRepository.findMembers(workspaceId);
	const alreadyMember = members.some((m) => m.user.email === input.email);
	if (alreadyMember) {
		throw new Error("User is already a member of this workspace");
	}

	const invitation = await this.workspaceRepository.createInvitation({
		workspaceId,
		email: input.email,
		role: input.role ?? "editor",
		invitedBy,
	});

	try {
		const workspace = await this.workspaceRepository.findById(workspaceId);
		const inviter = await this.userRepository.findById(invitedBy);
		if (workspace) {
			await this.emailProvider.sendInvitation({
				to: invitation.email,
				workspaceName: workspace.name,
				inviterName: inviter?.fullName ?? "",
				inviterEmail: inviter?.email ?? "",
				role: invitation.role,
				acceptUrl: `${this.invitationConfig.appUrl}/accept-invitation?token=${invitation.id}`,
				expiryHuman: this.humanExpiry(),
			});
		}
	} catch {
		// Email failure doesn't roll back — admin can resend via the UI.
	}

	const ttlMs = parseDuration(this.invitationConfig.tokenExpiry);
	const expiresAt = new Date(invitation.createdAt.getTime() + ttlMs).toISOString();

	await this.audit.log({
		workspaceId,
		userId: invitedBy,
		action: "workspace.invitation_create",
		entityType: "invitation",
		entityId: invitation.id,
		metadata: {
			invitedEmail: invitation.email,
			role: invitation.role,
			expiresAt,
		},
	});

	return invitation;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/workspace.service.audit.test.ts
```

Expected: 2 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/workspace.service.ts \
        backend/tests/services/workspace.service.audit.test.ts
git commit -m "feat(audit): emit workspace.member_remove and workspace.invitation_create"
```

---

## Task 11: Emit `workspace.invitation_accept` and `workspace.invitation_revoke`

**Files:**
- Modify: `backend/src/services/workspace.service.ts`
- Modify: `backend/tests/services/workspace.service.audit.test.ts`

`acceptInvitation` is the moment a workspace gains a new member. `updateInvitation` is the revoke path — only emit when status flips to a terminal cancelled/revoked state.

- [ ] **Step 1: Append failing tests**

In `backend/tests/services/workspace.service.audit.test.ts`, append:

```ts
it("emits workspace.invitation_accept when an invitation is accepted", async () => {
	const { spy, service: audit } = createMockAudit();
	const recentDate = new Date();
	const workspaceRepo = {
		findInvitationById: async () => ({
			id: "inv-1",
			workspaceId: "ws-1",
			email: "invitee@x.com",
			role: "editor",
			status: "pending",
			createdAt: recentDate,
		}),
		updateInvitation: async () => ({}),
		addMember: async () => ({}),
	} as any;
	const svc = new WorkspaceService(
		workspaceRepo,
		baseEmailProvider,
		baseUserRepo,
		invitationConfig,
		audit,
	);

	await svc.acceptInvitation("inv-1", "user-1", "invitee@x.com");

	expect(spy.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		userId: "user-1",
		action: "workspace.invitation_accept",
		entityType: "workspace_member",
		entityId: "user-1",
		metadata: { invitationId: "inv-1", role: "editor" },
	});
});

it("emits workspace.invitation_revoke when status flips to cancelled", async () => {
	const { spy, service: audit } = createMockAudit();
	const workspaceRepo = {
		findInvitationById: async () => ({
			id: "inv-1",
			workspaceId: "ws-1",
			email: "invitee@x.com",
			status: "pending",
		}),
		updateInvitation: async (id: string, data: any) => ({
			id,
			workspaceId: "ws-1",
			email: "invitee@x.com",
			status: data.status,
		}),
	} as any;
	const svc = new WorkspaceService(
		workspaceRepo,
		baseEmailProvider,
		baseUserRepo,
		invitationConfig,
		audit,
	);

	await svc.updateInvitation("actor-1", "inv-1", { status: "cancelled" });

	expect(spy.mock.calls[0][0]).toMatchObject({
		workspaceId: "ws-1",
		userId: "actor-1",
		action: "workspace.invitation_revoke",
		entityType: "invitation",
		entityId: "inv-1",
		metadata: { invitedEmail: "invitee@x.com" },
	});
});

it("does NOT emit invitation_revoke for non-cancellation status changes", async () => {
	const { spy, service: audit } = createMockAudit();
	const workspaceRepo = {
		findInvitationById: async () => ({
			id: "inv-1",
			workspaceId: "ws-1",
			email: "invitee@x.com",
			status: "pending",
		}),
		updateInvitation: async (id: string, data: any) => ({
			id,
			workspaceId: "ws-1",
			email: "invitee@x.com",
			status: data.status,
		}),
	} as any;
	const svc = new WorkspaceService(
		workspaceRepo,
		baseEmailProvider,
		baseUserRepo,
		invitationConfig,
		audit,
	);

	await svc.updateInvitation("actor-1", "inv-1", { status: "expired" });

	expect(spy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests, expect failure**

```bash
cd backend && bun test tests/services/workspace.service.audit.test.ts
```

Expected: 3 new tests fail.

- [ ] **Step 3: Implement the emits**

Replace `acceptInvitation` and `updateInvitation` in `backend/src/services/workspace.service.ts`:

```ts
async acceptInvitation(invitationId: string, userId: string, userEmail: string): Promise<void> {
	const invitation = await this.workspaceRepository.findInvitationById(invitationId);
	if (!invitation) {
		throw new Error("Invitation not found");
	}
	if (invitation.email !== userEmail) {
		throw new Error("Invitation email does not match");
	}
	if (invitation.status !== "pending") {
		throw new Error("Invitation is no longer pending");
	}
	if (this.isExpired(invitation.createdAt)) {
		await this.workspaceRepository.updateInvitation(invitationId, { status: "expired" });
		throw new Error("Invitation has expired");
	}

	await this.workspaceRepository.updateInvitation(invitationId, { status: "accepted" });
	await this.workspaceRepository.addMember(invitation.workspaceId, userId, invitation.role);

	await this.audit.log({
		workspaceId: invitation.workspaceId,
		userId,
		action: "workspace.invitation_accept",
		entityType: "workspace_member",
		entityId: userId,
		metadata: { invitationId, role: invitation.role },
	});
}

async updateInvitation(
	actingUserId: string,
	invitationId: string,
	data: { status: string },
): Promise<WorkspaceInvitation> {
	const before = await this.workspaceRepository.findInvitationById(invitationId);
	const updated = await this.workspaceRepository.updateInvitation(invitationId, data);

	// Only audit human revocations. "expired" is set by acceptInvitation when the
	// TTL has lapsed — that's policy, not a user decision.
	if (data.status === "cancelled" && before) {
		await this.audit.log({
			workspaceId: before.workspaceId,
			userId: actingUserId,
			action: "workspace.invitation_revoke",
			entityType: "invitation",
			entityId: invitationId,
			metadata: { invitedEmail: before.email },
		});
	}

	return updated;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
cd backend && bun test tests/services/workspace.service.audit.test.ts
```

Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/workspace.service.ts \
        backend/tests/services/workspace.service.audit.test.ts
git commit -m "feat(audit): emit workspace.invitation_accept and workspace.invitation_revoke"
```

---

## Task 12: Emit `workspace.ai_settings_update` from the AI settings route

**Files:**
- Modify: `backend/src/routes/workspace-ai-settings.route.ts`
- Modify: `backend/src/index.ts`

This route does not go through a service — the `PUT` handler calls `settingRepo.upsertAiSettings` directly. We emit the audit event in the route handler.

- [ ] **Step 1: Add `auditService` to the route factory signature**

In `backend/src/routes/workspace-ai-settings.route.ts`:

```ts
import type { IAuditService } from "../interfaces/services/audit.service.interface";

export function createWorkspaceAiSettingsRoutes(
	settingRepo: WorkspaceSettingRepository,
	aiFactory: AiProviderFactory,
	auditService: IAuditService,
) {
	const app = new Hono<{ Variables: Variables }>();
	// ...
}
```

- [ ] **Step 2: Emit after the upsert**

Inside the `PUT /` handler, after the `aiFactory.invalidate(workspaceId)` call:

```ts
await settingRepo.upsertAiSettings(workspaceId, patch);
aiFactory.invalidate(workspaceId);

// Audit: record only the field NAMES that changed. API keys and other
// secret values must never enter audit metadata.
await auditService.log({
	workspaceId,
	userId: c.get("userId"),
	action: "workspace.ai_settings_update",
	entityType: "workspace_ai_settings",
	entityId: workspaceId,
	metadata: { changedFields: Object.keys(patch) },
});

return c.json({ data: { updated: true } });
```

- [ ] **Step 3: Pass `auditService` from the composition root**

In `backend/src/index.ts`, find the `createWorkspaceAiSettingsRoutes` call and add `auditService` as the third argument:

```ts
createWorkspaceAiSettingsRoutes(workspaceSettingRepository, aiProviderFactory, auditService);
```

(Find the existing call with `grep -n "createWorkspaceAiSettingsRoutes" backend/src/index.ts`.)

- [ ] **Step 4: Type-check + run all tests**

```bash
cd backend && bunx tsc --noEmit && bun test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/workspace-ai-settings.route.ts backend/src/index.ts
git commit -m "feat(audit): emit workspace.ai_settings_update with masked field names"
```

---

## Task 13: Emit `project.*` events from the project route

**Files:**
- Modify: `backend/src/routes/project.route.ts`
- Modify: `backend/src/index.ts`

The project lifecycle and membership endpoints live in route handlers, not a service. Emit audit calls inline. The handlers we need to instrument are at the lines from `grep "app\." backend/src/routes/project.route.ts`:

- `POST /` → `project.create`
- `PATCH /:projectId` → `project.update` (when name changes — skip pure description edits if any; emit the diff)
- `DELETE /:projectId` → `project.archive` (per CLAUDE.md, this archives rather than hard-deletes — confirm during implementation; if it hard-deletes, name the action `project.delete` instead)
- `POST /:projectId/members` → `project.member_add`
- `PATCH /:projectId/members/:userId` → `project.member_update` (with diff over `isApprover`/`menuAccess`)
- `DELETE /:projectId/members/:userId` → `project.member_remove`

There's no `project.restore` route today — if/when a restore endpoint is added, instrument it to emit `project.restore` using the same shape as `archive`.

- [ ] **Step 1: Add `auditService` to the route factory signature**

In `backend/src/routes/project.route.ts`, add to the imports and to the factory signature:

```ts
import type { IAuditService } from "../interfaces/services/audit.service.interface";

export function createProjectRoutes(
	prisma: PrismaClient,
	auditService: IAuditService,
	// ... existing params
) {
	// ...
}
```

(Adjust to match the actual existing factory signature — append `auditService` last if it's simpler.)

- [ ] **Step 2: Add the audit calls**

For each handler, add the audit emit immediately after the DB write succeeds. Patterns:

```ts
// POST / — project.create
const project = await prisma.project.create({ data: { ... } });
await auditService.log({
	workspaceId: c.get("workspaceId"),
	userId: c.get("userId"),
	action: "project.create",
	entityType: "project",
	entityId: project.id,
	metadata: { name: project.name, slug: project.slug },
});
return c.json({ data: project }, 201);

// PATCH /:projectId — project.update
const before = await prisma.project.findUnique({ where: { id: projectId } });
const updated = await prisma.project.update({ where: { id: projectId }, data });
const changes: Record<string, { from: unknown; to: unknown }> = {};
if (typeof data.name === "string" && before && data.name !== before.name) {
	changes.name = { from: before.name, to: data.name };
}
if (Object.keys(changes).length > 0) {
	await auditService.log({
		workspaceId: c.get("workspaceId"),
		userId: c.get("userId"),
		action: "project.update",
		entityType: "project",
		entityId: projectId,
		metadata: { name: before?.name ?? null, changes },
	});
}
return c.json({ data: updated });

// DELETE /:projectId — project.archive (or project.delete if hard-delete)
const before = await prisma.project.findUnique({ where: { id: projectId } });
await prisma.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
// ↑ inspect the existing handler — if it actually calls .delete(...) instead of an
// archive update, change the action below to "project.delete".
await auditService.log({
	workspaceId: c.get("workspaceId"),
	userId: c.get("userId"),
	action: "project.archive",
	entityType: "project",
	entityId: projectId,
	metadata: { name: before?.name ?? null },
});

// POST /:projectId/members — project.member_add
const membership = await prisma.userProjectMembership.upsert({ ... });
const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
await auditService.log({
	workspaceId: c.get("workspaceId"),
	userId: c.get("userId"),
	action: "project.member_add",
	entityType: "project_member",
	entityId: targetUserId,
	metadata: {
		projectId,
		projectName: project?.name ?? null,
		targetEmail: target?.email ?? null,
		isApprover: membership.isApprover,
		menuAccess: membership.menuAccess,
	},
});

// PATCH /:projectId/members/:userId — project.member_update
const before = await prisma.userProjectMembership.findUnique({
	where: { userId_projectId: { userId: targetUserId, projectId } },
});
const updated = await prisma.userProjectMembership.update({ ... });
const changes: Record<string, { from: unknown; to: unknown }> = {};
if (before && typeof body.isApprover === "boolean" && body.isApprover !== before.isApprover) {
	changes.isApprover = { from: before.isApprover, to: body.isApprover };
}
if (
	before &&
	Array.isArray(body.menuAccess) &&
	JSON.stringify(body.menuAccess) !== JSON.stringify(before.menuAccess)
) {
	changes.menuAccess = { from: before.menuAccess, to: body.menuAccess };
}
if (Object.keys(changes).length > 0) {
	const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
	const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
	await auditService.log({
		workspaceId: c.get("workspaceId"),
		userId: c.get("userId"),
		action: "project.member_update",
		entityType: "project_member",
		entityId: targetUserId,
		metadata: {
			projectId,
			projectName: project?.name ?? null,
			targetEmail: target?.email ?? null,
			changes,
		},
	});
}

// DELETE /:projectId/members/:userId — project.member_remove
await prisma.userProjectMembership.delete({ ... });
const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { email: true } });
await auditService.log({
	workspaceId: c.get("workspaceId"),
	userId: c.get("userId"),
	action: "project.member_remove",
	entityType: "project_member",
	entityId: targetUserId,
	metadata: {
		projectId,
		projectName: project?.name ?? null,
		targetEmail: target?.email ?? null,
	},
});
```

The exact variable names in the route file may differ from the snippets above — adapt naming, but keep the audit-call shape identical.

- [ ] **Step 3: Pass `auditService` from the composition root**

In `backend/src/index.ts`, locate the `createProjectRoutes` call and add `auditService`:

```bash
grep -n "createProjectRoutes" backend/src/index.ts
```

Pass `auditService` in the position matching Step 1 (typically the second argument after `prisma`).

- [ ] **Step 4: Type-check + run all tests**

```bash
cd backend && bunx tsc --noEmit && bun test
```

Expected: PASS. (No new tests — route-level emits are verified by the manual smoke test in Task 15.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/project.route.ts backend/src/index.ts
git commit -m "feat(audit): emit project.create/update/archive and project membership events"
```

---

## Task 14: Emit `trash.permanent_delete` from the trash route

**Files:**
- Modify: `backend/src/routes/trash.route.ts`
- Modify: `backend/src/index.ts`

The manual hard-delete dispatches into per-entity service methods (`brandService.permanentDelete`, etc.) that are also called from non-trash code paths. Emitting at the trash route ensures we audit only the human-driven "permanent delete from Trash UI" action, not internal cascades.

- [ ] **Step 1: Add `auditService` to the route factory signature**

In `backend/src/routes/trash.route.ts`:

```ts
import type { IAuditService } from "../interfaces/services/audit.service.interface";

export function createTrashRoutes(
	trashService: TrashService,
	brandService: BrandService,
	productService: ProductService,
	topicService: TopicService,
	libraryService: LibraryService,
	auditService: IAuditService,
) {
	// ...
}
```

(Adjust to match the existing signature; new arg is appended last.)

- [ ] **Step 2: Capture target name before deleting and emit after**

Inside the `DELETE /:type/:id` handler ([backend/src/routes/trash.route.ts:74-99](../../backend/src/routes/trash.route.ts#L74-L99)), capture an identifier before the delete and emit after:

```ts
app.delete("/:type/:id", async (c) => {
	const workspaceId = c.get("workspaceId");
	const type = c.req.param("type");
	const id = c.req.param("id");
	try {
		// Capture identifying info BEFORE the row is gone.
		let name: string | null = null;
		let parentMeta: Record<string, unknown> = {};

		switch (type) {
			case "brand": {
				const row = await prisma.brand.findUnique({ where: { id }, select: { name: true } });
				name = row?.name ?? null;
				await brandService.permanentDelete(id);
				break;
			}
			case "product": {
				const row = await prisma.product.findUnique({
					where: { id },
					select: { name: true, brandId: true },
				});
				name = row?.name ?? null;
				if (row?.brandId) parentMeta = { brandId: row.brandId };
				await productService.permanentDelete(workspaceId, id);
				break;
			}
			case "topic": {
				const row = await prisma.topic.findUnique({
					where: { id },
					select: { title: true, productId: true },
				});
				name = row?.title ?? null;
				if (row?.productId) parentMeta = { productId: row.productId };
				await topicService.permanentDeleteMany(workspaceId, [id]);
				break;
			}
			case "content": {
				const row = await prisma.generationOutput.findUnique({
					where: { id },
					select: { topicId: true },
				});
				name = null; // content rows don't have a user-facing name
				if (row?.topicId) parentMeta = { topicId: row.topicId };
				await libraryService.permanentDeleteMany(workspaceId, [id]);
				break;
			}
			default:
				return c.json({ error: `Unknown trash type: ${type}` }, 400);
		}

		await auditService.log({
			workspaceId,
			userId: c.get("userId"),
			action: "trash.permanent_delete",
			entityType: type,
			entityId: id,
			metadata: { name, ...parentMeta },
		});

		return c.json({ data: { success: true } });
	} catch (e) {
		return c.json({ error: e instanceof Error ? e.message : "Delete failed" }, 400);
	}
});
```

This requires `prisma` available inside the route. If the existing route factory doesn't already accept `prisma`, add it:

```ts
export function createTrashRoutes(
	prisma: PrismaClient,
	trashService: TrashService,
	// ... existing params
	auditService: IAuditService,
) {
	// ...
}
```

(Check the existing factory first — `prisma` may already be passed implicitly via one of the services.)

- [ ] **Step 3: Pass `auditService` (and `prisma` if needed) from the composition root**

In `backend/src/index.ts`, update the `createTrashRoutes` call.

- [ ] **Step 4: Type-check + run all tests**

```bash
cd backend && bunx tsc --noEmit && bun test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/trash.route.ts backend/src/index.ts
git commit -m "feat(audit): emit trash.permanent_delete on manual hard-delete from Trash UI"
```

---

## Task 15: Frontend null-safe rendering and end-to-end smoke test

**Files:**
- Modify (only if needed): `frontend/src/pages/AdminPage.tsx`

- [ ] **Step 1: Inspect the AuditLogEntry render path**

```bash
grep -n "AuditLogEntry\|audit-logs\|workspaceId" frontend/src/pages/AdminPage.tsx
```

Locate the `Table<AuditLogEntry>` block. Today the audit panel doesn't show `workspaceId` in its columns (per the screenshot the user shared: Date / User / Action / Entity), so making `workspaceId` nullable on the API response should not require any frontend change. Verify by reading the columns array.

- [ ] **Step 2: Update `AuditLogEntry` type if `workspaceId` is declared non-null**

If the type declaration says `workspaceId: string`, change it to `workspaceId: string | null`:

```ts
interface AuditLogEntry {
	id: string;
	workspaceId: string | null;
	// ...
}
```

(Skip this step if the type doesn't reference `workspaceId`.)

- [ ] **Step 3: Boot the stack and exercise a few audited actions**

```bash
docker-compose up -d
cd backend && bun run --hot src/index.ts &
cd frontend && npm run dev &
```

Then in the UI:

1. Sign in as a superadmin.
2. Visit `/admin` → Users tab → create a new user.
3. Visit Workspace Settings → Members → invite a user.
4. Visit Workspace Settings → Integrations → AI Providers → change a model name and save.
5. Visit `/admin` → Audit Logs tab — refresh the table.

Expected: at least three rows appear (`user.create`, `workspace.invitation_create`, `workspace.ai_settings_update`).

- [ ] **Step 4: Verify rows in the DB directly**

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT action, entity_type, workspace_id IS NULL AS global, metadata FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
```

Expected: rows match the actions you just performed. `global = t` for `user.create`, `f` for the workspace-scoped events.

- [ ] **Step 5: Verify API key masking**

Inspect the `workspace.ai_settings_update` row's `metadata`:

```bash
docker exec fce-postgres-1 psql -U fce -d fce_dashboard -c \
  "SELECT metadata FROM audit_logs WHERE action = 'workspace.ai_settings_update' ORDER BY created_at DESC LIMIT 1;"
```

Expected: `{"changedFields": [...]}` with field names only — **no API key values, no model values stored as values.**

- [ ] **Step 6: Commit any frontend changes**

```bash
git add frontend/src/pages/AdminPage.tsx
git commit -m "chore(audit): align AuditLogEntry type with nullable workspaceId"
```

(Skip if no change was needed.)

---

## Self-Review

After writing the complete plan, here's the inline check:

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| Schema change (nullable workspaceId) | Task 1 |
| AuditService + soft-fail | Task 2 |
| Composition-root wiring | Task 3 |
| Group A: `user.create` / `delete` / `password_reset` | Task 5 |
| Group A: `user.update` / `superadmin_grant` / `superadmin_revoke` | Task 6 |
| Group A: `taxonomy.create` / `update` / `delete` | Task 7 |
| Group B: `workspace.member_role_change` (admin path) | Task 8 |
| Group B: `workspace.member_remove` (admin path) | Task 8 |
| Group B: `workspace.member_remove` (workspace settings path) | Task 10 |
| Group B: `workspace.invitation_create` | Task 10 |
| Group B: `workspace.invitation_accept` | Task 11 |
| Group B: `workspace.invitation_revoke` | Task 11 |
| Group B: `workspace.ai_settings_update` | Task 12 |
| Group B: `project.create/update/archive/member_*` | Task 13 |
| Group B: `trash.permanent_delete` | Task 14 |
| Frontend null-safe + smoke | Task 15 |
| API key masking enforced at call site | Task 12 + verified Task 15 |

All spec sections covered.

**2. Type consistency:**

- `IAuditService.log(input: AuditLogInput)` — used identically across all tasks.
- `actingUserId: string` is always the first parameter on audited service methods.
- `AuditService.TAXONOMY_ENTITY_TYPE` is the only place taxonomy `entityType` strings are produced — no duplication.
- The `changes: { field: { from, to } }` diff shape is used identically in `user.update`, `taxonomy.update`, `project.update`, and `project.member_update`.

**3. Open ambiguity:** Task 13 leaves room for the implementer to confirm whether `DELETE /:projectId` is an archive or a hard-delete in the current code, and to pick the action name accordingly. This is intentional — a one-line check at implementation time is faster than a deep grep at plan-write time.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-29-admin-audit-logs.md](2026-04-29-admin-audit-logs.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.
