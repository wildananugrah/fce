import type { UserWorkspaceRole, Workspace, WorkspaceInvitation } from "@prisma/client";
import type { IWorkspaceRepository } from "../../src/interfaces/repositories/workspace.repository.interface";

export class MockWorkspaceRepository implements IWorkspaceRepository {
	private workspaces: Workspace[] = [];
	private roles: (UserWorkspaceRole & {
		user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
	})[] = [];
	private invitations: (WorkspaceInvitation & { workspace?: Workspace })[] = [];

	async findById(id: string): Promise<Workspace | null> {
		return this.workspaces.find((w) => w.id === id) ?? null;
	}

	async findBySlug(slug: string): Promise<Workspace | null> {
		return this.workspaces.find((w) => w.slug === slug) ?? null;
	}

	async findByUserId(userId: string): Promise<(Workspace & { roles: { role: string }[] })[]> {
		const userRoles = this.roles.filter((r) => r.userId === userId);
		return userRoles.map((r) => {
			const workspace = this.workspaces.find((w) => w.id === r.workspaceId);
			if (!workspace) throw new Error("Workspace not found");
			return { ...workspace, roles: [{ role: r.role }] };
		});
	}

	async create(data: { name: string; slug: string; description?: string }): Promise<Workspace> {
		const workspace: Workspace = {
			id: crypto.randomUUID(),
			name: data.name,
			slug: data.slug,
			description: data.description ?? null,
			logoUrl: null,
			avatarColor: "#7c6dfa",
			avatarEmoji: null,
			status: "active",
			apiLimitUsd: 50.0 as any,
			apiUsageUsd: 0.0 as any,
			createdBy: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.workspaces.push(workspace);
		return workspace;
	}

	async createWithOwner(
		data: { name: string; slug: string; description?: string },
		ownerUserId: string,
	): Promise<Workspace> {
		const workspace = await this.create(data);
		await this.addMember(workspace.id, ownerUserId, "admin");
		return workspace;
	}

	async update(
		id: string,
		data: Partial<
			Pick<Workspace, "name" | "description" | "logoUrl" | "avatarColor" | "avatarEmoji" | "status">
		>,
	): Promise<Workspace> {
		const index = this.workspaces.findIndex((w) => w.id === id);
		if (index === -1) throw new Error("Workspace not found");
		this.workspaces[index] = { ...this.workspaces[index], ...data, updatedAt: new Date() };
		return this.workspaces[index];
	}

	async delete(id: string): Promise<void> {
		const index = this.workspaces.findIndex((w) => w.id === id);
		if (index === -1) throw new Error("Workspace not found");
		this.workspaces.splice(index, 1);
	}

	async findRole(userId: string, workspaceId: string): Promise<UserWorkspaceRole | null> {
		return this.roles.find((r) => r.userId === userId && r.workspaceId === workspaceId) ?? null;
	}

	async findMembers(workspaceId: string): Promise<
		(UserWorkspaceRole & {
			user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
		})[]
	> {
		return this.roles.filter((r) => r.workspaceId === workspaceId);
	}

	async addMember(workspaceId: string, userId: string, role: string): Promise<UserWorkspaceRole> {
		const member: UserWorkspaceRole & {
			user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
		} = {
			id: crypto.randomUUID(),
			userId,
			workspaceId,
			role,
			createdAt: new Date(),
			user: { id: userId, email: `${userId}@test.com`, fullName: null, avatarUrl: null },
		};
		this.roles.push(member);
		return member;
	}

	async upsertMemberRole(
		workspaceId: string,
		userId: string,
		role: string,
	): Promise<UserWorkspaceRole> {
		const existing = this.roles.find(
			(r) => r.userId === userId && r.workspaceId === workspaceId,
		);
		if (existing) {
			existing.role = role;
			return existing;
		}
		return this.addMember(workspaceId, userId, role);
	}

	async setCreator(workspaceId: string, userId: string): Promise<void> {
		const workspace = this.workspaces.find((w) => w.id === workspaceId);
		if (workspace) {
			(workspace as any).createdBy = userId;
		}
	}

	async removeMember(workspaceId: string, userId: string): Promise<void> {
		const index = this.roles.findIndex((r) => r.workspaceId === workspaceId && r.userId === userId);
		if (index !== -1) {
			this.roles.splice(index, 1);
		}
	}

	async findInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
		return this.invitations.filter((i) => i.workspaceId === workspaceId);
	}

	async findPendingInvitationsByEmail(
		email: string,
	): Promise<(WorkspaceInvitation & { workspace: Workspace })[]> {
		return this.invitations
			.filter((i) => i.email === email && i.status === "pending")
			.map((i) => {
				const workspace = this.workspaces.find((w) => w.id === i.workspaceId);
				if (!workspace) throw new Error("Workspace not found");
				return { ...i, workspace };
			});
	}

	async findInvitationById(id: string): Promise<WorkspaceInvitation | null> {
		return this.invitations.find((i) => i.id === id) ?? null;
	}

	async createInvitation(data: {
		workspaceId: string;
		email: string;
		role: string;
		invitedBy: string;
	}): Promise<WorkspaceInvitation> {
		const invitation: WorkspaceInvitation = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			email: data.email,
			role: data.role,
			status: "pending",
			invitedBy: data.invitedBy,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.invitations.push(invitation);
		return invitation;
	}

	async updateInvitation(id: string, data: { status: string }): Promise<WorkspaceInvitation> {
		const index = this.invitations.findIndex((i) => i.id === id);
		if (index === -1) throw new Error("Invitation not found");
		this.invitations[index] = { ...this.invitations[index], ...data, updatedAt: new Date() };
		return this.invitations[index];
	}

	clear(): void {
		this.workspaces = [];
		this.roles = [];
		this.invitations = [];
	}
}
