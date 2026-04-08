import type { Workspace, WorkspaceInvitation } from "@prisma/client";
import type { IWorkspaceRepository } from "../interfaces/repositories/workspace.repository.interface";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";
import type {
	CreateWorkspaceInput,
	InviteMemberInput,
	UpdateWorkspaceInput,
	WorkspaceSummary,
} from "../types/workspace.types";

export class WorkspaceService implements IWorkspaceService {
	constructor(private workspaceRepository: IWorkspaceRepository) {}

	async listByUser(userId: string): Promise<WorkspaceSummary[]> {
		const workspaces = await this.workspaceRepository.findByUserId(userId);
		return workspaces.map((workspace) => ({
			id: workspace.id,
			name: workspace.name,
			slug: workspace.slug,
			description: workspace.description,
			logoUrl: workspace.logoUrl,
			avatarColor: workspace.avatarColor,
			avatarEmoji: workspace.avatarEmoji,
			role: workspace.roles[0]?.role ?? "member",
		}));
	}

	async getById(id: string): Promise<Workspace> {
		const workspace = await this.workspaceRepository.findById(id);
		if (!workspace) {
			throw new Error("Workspace not found");
		}
		return workspace;
	}

	async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
		const existing = await this.workspaceRepository.findBySlug(input.slug);
		if (existing) {
			throw new Error("Slug already taken");
		}

		const workspace = await this.workspaceRepository.create({
			name: input.name,
			slug: input.slug,
			description: input.description,
		});

		await this.workspaceRepository.addMember(workspace.id, userId, "admin");

		return workspace;
	}

	async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
		return this.workspaceRepository.update(id, input);
	}

	async getMemberRole(userId: string, workspaceId: string): Promise<string | null> {
		const role = await this.workspaceRepository.findRole(userId, workspaceId);
		return role?.role ?? null;
	}

	async listMembers(workspaceId: string): Promise<any[]> {
		const members = await this.workspaceRepository.findMembers(workspaceId);
		return members.map((m) => ({
			userId: m.userId,
			email: m.user.email,
			fullName: m.user.fullName,
			avatarUrl: m.user.avatarUrl,
			role: m.role,
		}));
	}

	async invite(
		workspaceId: string,
		invitedBy: string,
		input: InviteMemberInput,
	): Promise<WorkspaceInvitation> {
		return this.workspaceRepository.createInvitation({
			workspaceId,
			email: input.email,
			role: input.role ?? "editor",
			invitedBy,
		});
	}

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

		await this.workspaceRepository.updateInvitation(invitationId, { status: "accepted" });
		await this.workspaceRepository.addMember(invitation.workspaceId, userId, invitation.role);
	}

	async updateInvitation(
		invitationId: string,
		data: { status: string },
	): Promise<WorkspaceInvitation> {
		return this.workspaceRepository.updateInvitation(invitationId, data);
	}

	async removeMember(workspaceId: string, userId: string): Promise<void> {
		const members = await this.workspaceRepository.findMembers(workspaceId);
		const admins = members.filter((m) => m.role === "admin");
		const isTargetAdmin = admins.some((m) => m.userId === userId);

		if (isTargetAdmin && admins.length <= 1) {
			throw new Error("Cannot remove the last admin from the workspace");
		}

		await this.workspaceRepository.removeMember(workspaceId, userId);
	}

	async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
		return this.workspaceRepository.findInvitations(workspaceId);
	}
}
