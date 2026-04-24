import { afterEach, describe, expect, it } from "bun:test";
import { WorkspaceService } from "../../src/services/workspace.service";
import { MockUserRepository } from "../helpers/mock-user.repository";
import { MockWorkspaceRepository } from "../helpers/mock-workspace.repository";

describe("WorkspaceService", () => {
	const workspaceRepo = new MockWorkspaceRepository();
	const userRepo = new MockUserRepository();
	const emailCalls: any[] = [];
	const emailProvider = {
		sendInvitation: async (input: any) => {
			emailCalls.push(input);
		},
	};
	const workspaceService = new WorkspaceService(workspaceRepo, emailProvider as any, userRepo, {
		appUrl: "http://localhost:5173",
		tokenExpiry: "7d",
	});

	// Seed a user with generous quotas — these tests predate the per-user quota
	// system and don't care about it.
	async function seedUser() {
		const user = await userRepo.create({
			email: `test-${crypto.randomUUID()}@example.com`,
			passwordHash: "x",
			maxWorkspaces: 99,
			maxProjects: 99,
		});
		return user.id;
	}

	afterEach(() => {
		workspaceRepo.clear();
		userRepo.clear?.();
		emailCalls.length = 0;
	});

	describe("create", () => {
		it("should create workspace and add creator as admin", async () => {
			const userId = await seedUser();
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
			const userId = await seedUser();
			await workspaceService.create(userId, { name: "Workspace 1", slug: "taken-slug" });
			await expect(
				workspaceService.create(userId, { name: "Workspace 2", slug: "taken-slug" }),
			).rejects.toThrow("Slug already taken");
		});

		it("should reject with QuotaExceededError when the user has hit maxWorkspaces", async () => {
			const user = await userRepo.create({
				email: `quota-${crypto.randomUUID()}@example.com`,
				passwordHash: "x",
				maxWorkspaces: 1,
				maxProjects: 3,
			});
			await workspaceService.create(user.id, { name: "First", slug: "first-ws" });
			await expect(
				workspaceService.create(user.id, { name: "Second", slug: "second-ws" }),
			).rejects.toThrow(/reached your workspaces limit/);
		});
	});

	describe("listByUser", () => {
		it("should return workspaces with user's role", async () => {
			const userId = await seedUser();
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
			const userId = await seedUser();
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
			const userId = await seedUser();
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
			const adminId = await seedUser();
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
			const adminId = await seedUser();
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
			const adminId = await seedUser();
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
			const adminId = await seedUser();
			const workspace = await workspaceService.create(adminId, {
				name: "LastAdmin WS",
				slug: "lastadmin-ws",
			});

			await expect(workspaceService.removeMember(workspace.id, adminId)).rejects.toThrow(
				"Cannot remove the last admin from the workspace",
			);
		});
	});

	describe("invitation expiry and resend", () => {
		it("sends an email when inviting", async () => {
			const inviter = await userRepo.create({
				email: "admin@test.com",
				passwordHash: "x",
				fullName: "Admin",
			});
			const workspace = await workspaceService.create(inviter.id, {
				name: "WS",
				slug: "ws-a",
			});
			emailCalls.length = 0;
			await workspaceService.invite(workspace.id, inviter.id, {
				email: "new@test.com",
				role: "editor",
			});
			expect(emailCalls).toHaveLength(1);
			expect(emailCalls[0].to).toBe("new@test.com");
			expect(emailCalls[0].workspaceName).toBe("WS");
			expect(emailCalls[0].acceptUrl).toContain("/accept-invitation?token=");
		});

		it("acceptInvitation throws when expired and flips status", async () => {
			const inviter = await userRepo.create({
				email: "admin2@test.com",
				passwordHash: "x",
			});
			const workspace = await workspaceService.create(inviter.id, {
				name: "WS2",
				slug: "ws-b",
			});
			const invitation = await workspaceService.invite(workspace.id, inviter.id, {
				email: "late@test.com",
				role: "editor",
			});
			// Force the createdAt back 8 days to simulate expiry.
			(workspaceRepo as any).invitations.find((i: any) => i.id === invitation.id).createdAt =
				new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

			const newUser = await userRepo.create({
				email: "late@test.com",
				passwordHash: "x",
			});
			await expect(
				workspaceService.acceptInvitation(invitation.id, newUser.id, "late@test.com"),
			).rejects.toThrow("Invitation has expired");

			const after = await (workspaceRepo as any).findInvitationById(invitation.id);
			expect(after.status).toBe("expired");
		});

		it("getInvitationByToken returns metadata without auth", async () => {
			const inviter = await userRepo.create({
				email: "admin3@test.com",
				passwordHash: "x",
				fullName: "The Admin",
			});
			const workspace = await workspaceService.create(inviter.id, {
				name: "WS3",
				slug: "ws-c",
			});
			const invitation = await workspaceService.invite(workspace.id, inviter.id, {
				email: "target@test.com",
				role: "admin",
			});

			const info = await workspaceService.getInvitationByToken(invitation.id);
			expect(info).not.toBeNull();
			expect(info!.workspaceName).toBe("WS3");
			expect(info!.role).toBe("admin");
			expect(info!.inviterEmail).toBe("admin3@test.com");
			expect(info!.inviterName).toBe("The Admin");
			expect(info!.inviteeEmail).toBe("target@test.com");
			expect(info!.isExpired).toBe(false);
		});

		it("resendInvitation calls email provider again", async () => {
			const inviter = await userRepo.create({
				email: "admin4@test.com",
				passwordHash: "x",
			});
			const workspace = await workspaceService.create(inviter.id, {
				name: "WS4",
				slug: "ws-d",
			});
			const invitation = await workspaceService.invite(workspace.id, inviter.id, {
				email: "resend@test.com",
				role: "editor",
			});
			emailCalls.length = 0;
			await workspaceService.resendInvitation(workspace.id, invitation.id, inviter.id);
			expect(emailCalls).toHaveLength(1);
			expect(emailCalls[0].to).toBe("resend@test.com");
		});

		it("rejects invite when email is already a member", async () => {
			const inviter = await userRepo.create({
				email: "admin5@test.com",
				passwordHash: "x",
			});
			const workspace = await workspaceService.create(inviter.id, {
				name: "WS5",
				slug: "ws-e",
			});
			// Patch the mock member record to use the real user email since
			// MockWorkspaceRepository.addMember generates a synthetic email.
			const memberRecord = (workspaceRepo as any).roles.find(
				(r: any) => r.userId === inviter.id && r.workspaceId === workspace.id,
			);
			if (memberRecord) memberRecord.user.email = "admin5@test.com";

			await expect(
				workspaceService.invite(workspace.id, inviter.id, {
					email: "admin5@test.com",
					role: "editor",
				}),
			).rejects.toThrow("User is already a member of this workspace");
		});
	});
});
