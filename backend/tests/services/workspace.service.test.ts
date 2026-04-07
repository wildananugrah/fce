import { afterEach, describe, expect, it } from "bun:test";
import { WorkspaceService } from "../../src/services/workspace.service";
import { MockWorkspaceRepository } from "../helpers/mock-workspace.repository";

describe("WorkspaceService", () => {
	const workspaceRepo = new MockWorkspaceRepository();
	const workspaceService = new WorkspaceService(workspaceRepo);

	afterEach(() => {
		workspaceRepo.clear();
	});

	describe("create", () => {
		it("should create workspace and add creator as admin", async () => {
			const userId = crypto.randomUUID();
			const workspace = await workspaceService.create(userId, {
				name: "My Workspace",
				slug: "my-workspace",
				description: "A test workspace",
			});

			expect(workspace.name).toBe("My Workspace");
			expect(workspace.slug).toBe("my-workspace");
			expect(workspace.description).toBe("A test workspace");

			const members = await workspaceRepo.findMembers(workspace.id);
			expect(members).toHaveLength(1);
			expect(members[0].userId).toBe(userId);
			expect(members[0].role).toBe("admin");
		});

		it("should throw when slug is already taken", async () => {
			const userId = crypto.randomUUID();
			await workspaceService.create(userId, { name: "Workspace 1", slug: "taken-slug" });
			await expect(
				workspaceService.create(userId, { name: "Workspace 2", slug: "taken-slug" }),
			).rejects.toThrow("Workspace slug already taken");
		});
	});

	describe("listByUser", () => {
		it("should return workspaces with user's role", async () => {
			const userId = crypto.randomUUID();
			await workspaceService.create(userId, { name: "Workspace A", slug: "ws-a" });
			await workspaceService.create(userId, { name: "Workspace B", slug: "ws-b" });

			const list = await workspaceService.listByUser(userId);
			expect(list).toHaveLength(2);
			expect(list.every((w) => w.role === "admin")).toBe(true);
			const slugs = list.map((w) => w.slug);
			expect(slugs).toContain("ws-a");
			expect(slugs).toContain("ws-b");
		});
	});

	describe("getById", () => {
		it("should return workspace when found", async () => {
			const userId = crypto.randomUUID();
			const created = await workspaceService.create(userId, { name: "Found WS", slug: "found-ws" });

			const workspace = await workspaceService.getById(created.id);
			expect(workspace.id).toBe(created.id);
			expect(workspace.name).toBe("Found WS");
		});

		it("should throw 'Workspace not found' when not found", async () => {
			await expect(workspaceService.getById("nonexistent-id")).rejects.toThrow(
				"Workspace not found",
			);
		});
	});

	describe("invite", () => {
		it("should create an invitation", async () => {
			const userId = crypto.randomUUID();
			const workspace = await workspaceService.create(userId, {
				name: "Invite WS",
				slug: "invite-ws",
			});

			const invitation = await workspaceService.invite(workspace.id, userId, {
				email: "invitee@example.com",
				role: "editor",
			});

			expect(invitation.workspaceId).toBe(workspace.id);
			expect(invitation.email).toBe("invitee@example.com");
			expect(invitation.role).toBe("editor");
			expect(invitation.status).toBe("pending");
		});
	});

	describe("acceptInvitation", () => {
		it("should add member with invitation's role", async () => {
			const adminId = crypto.randomUUID();
			const inviteeId = crypto.randomUUID();
			const inviteeEmail = "invitee@example.com";

			const workspace = await workspaceService.create(adminId, {
				name: "Accept WS",
				slug: "accept-ws",
			});
			const invitation = await workspaceService.invite(workspace.id, adminId, {
				email: inviteeEmail,
				role: "editor",
			});

			await workspaceService.acceptInvitation(invitation.id, inviteeId, inviteeEmail);

			const members = await workspaceRepo.findMembers(workspace.id);
			const newMember = members.find((m) => m.userId === inviteeId);
			expect(newMember).toBeDefined();
			expect(newMember?.role).toBe("editor");
		});

		it("should throw when invitation email does not match", async () => {
			const adminId = crypto.randomUUID();
			const workspace = await workspaceService.create(adminId, {
				name: "Mismatch WS",
				slug: "mismatch-ws",
			});
			const invitation = await workspaceService.invite(workspace.id, adminId, {
				email: "correct@example.com",
				role: "editor",
			});

			await expect(
				workspaceService.acceptInvitation(invitation.id, crypto.randomUUID(), "wrong@example.com"),
			).rejects.toThrow("Invitation email does not match");
		});
	});

	describe("removeMember", () => {
		it("should remove a member", async () => {
			const adminId = crypto.randomUUID();
			const memberId = crypto.randomUUID();

			const workspace = await workspaceService.create(adminId, {
				name: "Remove WS",
				slug: "remove-ws",
			});
			await workspaceRepo.addMember(workspace.id, memberId, "editor");

			await workspaceService.removeMember(workspace.id, memberId);

			const members = await workspaceRepo.findMembers(workspace.id);
			expect(members.find((m) => m.userId === memberId)).toBeUndefined();
		});

		it("should throw when removing the last admin", async () => {
			const adminId = crypto.randomUUID();
			const workspace = await workspaceService.create(adminId, {
				name: "LastAdmin WS",
				slug: "lastadmin-ws",
			});

			await expect(workspaceService.removeMember(workspace.id, adminId)).rejects.toThrow(
				"Cannot remove the last admin from the workspace",
			);
		});
	});
});
