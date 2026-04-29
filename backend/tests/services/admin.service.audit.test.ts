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
