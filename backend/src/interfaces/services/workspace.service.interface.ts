import type { Workspace, WorkspaceInvitation } from "@prisma/client";
import type {
	CreateWorkspaceInput,
	InviteMemberInput,
	UpdateWorkspaceInput,
	WorkspaceSummary,
} from "../../types/workspace.types";

export interface IWorkspaceService {
	listByUser(userId: string): Promise<WorkspaceSummary[]>;
	getById(id: string): Promise<Workspace>;
	getByIdSafe(id: string): Promise<Workspace | null>;
	create(userId: string, input: CreateWorkspaceInput): Promise<Workspace>;
	update(id: string, input: UpdateWorkspaceInput): Promise<Workspace>;
	delete(workspaceId: string, userId: string): Promise<void>;
	canManage(userId: string, workspaceId: string): Promise<boolean>;
	getMemberRole(userId: string, workspaceId: string): Promise<string | null>;

	listMembers(workspaceId: string): Promise<any[]>;
	invite(
		workspaceId: string,
		invitedBy: string,
		input: InviteMemberInput,
	): Promise<WorkspaceInvitation>;
	acceptInvitation(invitationId: string, userId: string, userEmail: string): Promise<void>;
	updateInvitation(
		actingUserId: string,
		invitationId: string,
		data: { status: string },
	): Promise<WorkspaceInvitation>;
	removeMember(actingUserId: string, workspaceId: string, userId: string): Promise<void>;

	listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
	getInvitationByToken(token: string): Promise<{
		id: string;
		workspaceName: string;
		role: string;
		inviterName: string | null;
		inviterEmail: string;
		inviteeEmail: string;
		status: string;
		isExpired: boolean;
	} | null>;
	resendInvitation(workspaceId: string, invitationId: string, userId: string): Promise<void>;
	listPendingForEmail(email: string): Promise<(import("@prisma/client").WorkspaceInvitation & { workspace: { id: string; name: string } })[]>;
}
