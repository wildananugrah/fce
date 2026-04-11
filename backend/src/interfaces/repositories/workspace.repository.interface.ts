import type { UserWorkspaceRole, Workspace, WorkspaceInvitation } from "@prisma/client";

export interface IWorkspaceRepository {
	findById(id: string): Promise<Workspace | null>;
	findBySlug(slug: string): Promise<Workspace | null>;
	findByUserId(userId: string): Promise<(Workspace & { roles: { role: string }[] })[]>;
	create(data: { name: string; slug: string; description?: string }): Promise<Workspace>;
	createWithOwner(
		data: { name: string; slug: string; description?: string },
		ownerUserId: string,
	): Promise<Workspace>;
	update(
		id: string,
		data: Partial<
			Pick<Workspace, "name" | "description" | "logoUrl" | "avatarColor" | "avatarEmoji" | "status">
		>,
	): Promise<Workspace>;
	delete(id: string): Promise<void>;

	findRole(userId: string, workspaceId: string): Promise<UserWorkspaceRole | null>;
	findMembers(workspaceId: string): Promise<
		(UserWorkspaceRole & {
			user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
		})[]
	>;
	addMember(workspaceId: string, userId: string, role: string): Promise<UserWorkspaceRole>;
	upsertMemberRole(
		workspaceId: string,
		userId: string,
		role: string,
	): Promise<UserWorkspaceRole>;
	setCreator(workspaceId: string, userId: string): Promise<void>;
	removeMember(workspaceId: string, userId: string): Promise<void>;

	findInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
	findPendingInvitationsByEmail(
		email: string,
	): Promise<(WorkspaceInvitation & { workspace: Workspace })[]>;
	findInvitationById(id: string): Promise<WorkspaceInvitation | null>;
	createInvitation(data: {
		workspaceId: string;
		email: string;
		role: string;
		invitedBy: string;
	}): Promise<WorkspaceInvitation>;
	updateInvitation(id: string, data: { status: string }): Promise<WorkspaceInvitation>;
}
