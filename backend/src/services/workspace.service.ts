import type { Workspace, WorkspaceInvitation } from "@prisma/client";
import { QuotaExceededError } from "../errors/quota-exceeded-error";
import type { IEmailProvider } from "../interfaces/providers/email.provider.interface";
import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";
import type { IWorkspaceRepository } from "../interfaces/repositories/workspace.repository.interface";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";
import type {
	CreateWorkspaceInput,
	InviteMemberInput,
	UpdateWorkspaceInput,
	WorkspaceSummary,
} from "../types/workspace.types";
import { parseDuration } from "../utils/duration";

interface InvitationConfig {
	appUrl: string;
	tokenExpiry: string; // e.g. "7d"
}

export class WorkspaceService implements IWorkspaceService {
	constructor(
		private workspaceRepository: IWorkspaceRepository,
		private emailProvider: IEmailProvider,
		private userRepository: IUserRepository,
		private invitationConfig: InvitationConfig,
		private audit: IAuditService,
	) {}

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

	async getByIdSafe(id: string): Promise<Workspace | null> {
		return this.workspaceRepository.findById(id);
	}

	async create(userId: string, input: CreateWorkspaceInput): Promise<Workspace> {
		const user = await this.userRepository.findById(userId);
		if (!user) throw new Error("User not found");

		// Superadmins bypass the quota; everyone else is capped by User.maxWorkspaces.
		if (!user.isSuperadmin) {
			const current = await this.workspaceRepository.countCreatedBy(userId);
			if (current >= user.maxWorkspaces) {
				throw new QuotaExceededError("workspaces", user.maxWorkspaces, current);
			}
		}

		const existing = await this.workspaceRepository.findBySlug(input.slug);
		if (existing) {
			throw new Error("Slug already taken");
		}

		const workspace = await this.workspaceRepository.createWithOwner(
			{
				name: input.name,
				slug: input.slug,
				description: input.description,
			},
			userId,
		);

		return workspace;
	}

	async update(id: string, input: UpdateWorkspaceInput): Promise<Workspace> {
		return this.workspaceRepository.update(id, input);
	}

	async canManage(userId: string, workspaceId: string): Promise<boolean> {
		const role = await this.workspaceRepository.findRole(userId, workspaceId);
		if (role?.role === "admin") return true;

		const workspace = await this.workspaceRepository.findById(workspaceId);
		if (!workspace) return false;

		// Creator of the workspace can always manage/delete it.
		if (workspace.createdBy === userId) return true;

		// Self-heal for orphaned workspaces: if no existing admin can
		// manage the workspace, nobody is able to rename, invite into, or
		// delete it. In that state, the workspace is effectively ownerless
		// and the current authenticated caller can take it over. This
		// promotion is persistent so the recovery only happens once.
		const members = await this.workspaceRepository.findMembers(workspaceId);
		const hasAdmin = members.some((m) => m.role === "admin");
		if (!hasAdmin) {
			await this.workspaceRepository.upsertMemberRole(workspaceId, userId, "admin");
			if (!workspace.createdBy) {
				await this.workspaceRepository.setCreator(workspaceId, userId);
			}
			return true;
		}

		return false;
	}

	async delete(workspaceId: string, userId: string): Promise<void> {
		const allowed = await this.canManage(userId, workspaceId);
		if (!allowed) {
			throw new Error("Only admins or the creator can delete a workspace");
		}
		await this.workspaceRepository.delete(workspaceId);
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

	async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
		return this.workspaceRepository.findInvitations(workspaceId);
	}

	private isExpired(createdAt: Date): boolean {
		const ttl = parseDuration(this.invitationConfig.tokenExpiry);
		return createdAt.getTime() + ttl < Date.now();
	}

	private humanExpiry(): string {
		const match = /^(\d+)([smhd])$/.exec(this.invitationConfig.tokenExpiry);
		if (!match) return this.invitationConfig.tokenExpiry;
		const [, n, u] = match;
		const unitLabel: Record<string, string> = { s: "second", m: "minute", h: "hour", d: "day" };
		const label = unitLabel[u];
		return `${n} ${label}${Number.parseInt(n, 10) === 1 ? "" : "s"}`;
	}

	async getInvitationByToken(token: string) {
		const invitation = await this.workspaceRepository.findInvitationById(token);
		if (!invitation) return null;

		const workspace = await this.workspaceRepository.findById(invitation.workspaceId);
		if (!workspace) return null;

		const inviter = await this.userRepository.findById(invitation.invitedBy);

		return {
			id: invitation.id,
			workspaceName: workspace.name,
			role: invitation.role,
			inviterName: inviter?.fullName ?? null,
			inviterEmail: inviter?.email ?? "",
			inviteeEmail: invitation.email,
			status: invitation.status,
			isExpired: invitation.status === "pending" && this.isExpired(invitation.createdAt),
		};
	}

	async resendInvitation(workspaceId: string, invitationId: string, userId: string): Promise<void> {
		const allowed = await this.canManage(userId, workspaceId);
		if (!allowed) {
			throw new Error("Only admins can resend invitations");
		}

		const invitation = await this.workspaceRepository.findInvitationById(invitationId);
		if (!invitation || invitation.workspaceId !== workspaceId) {
			throw new Error("Invitation not found");
		}
		if (invitation.status !== "pending") {
			throw new Error("Invitation is no longer pending");
		}

		const workspace = await this.workspaceRepository.findById(workspaceId);
		if (!workspace) throw new Error("Workspace not found");

		const inviter = await this.userRepository.findById(invitation.invitedBy);

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

	async listPendingForEmail(email: string) {
		const pending = await this.workspaceRepository.findPendingInvitationsByEmail(email);
		return pending.filter((inv) => !this.isExpired(inv.createdAt));
	}
}
