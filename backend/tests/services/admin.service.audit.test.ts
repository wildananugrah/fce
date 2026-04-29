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
				update: async ({ data }: { data: any }) => ({
					id: "h1",
					name: data.name ?? "Curiosity",
					description: data.description ?? "old",
				}),
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
});
