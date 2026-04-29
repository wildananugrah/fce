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
