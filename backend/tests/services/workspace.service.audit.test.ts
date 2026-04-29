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
		expect(typeof spy.mock.calls[0][0].metadata.expiresAt).toBe("string");
	});
});
