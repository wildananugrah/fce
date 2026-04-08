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
	create(userId: string, input: CreateWorkspaceInput): Promise<Workspace>;
	update(id: string, input: UpdateWorkspaceInput): Promise<Workspace>;
	getMemberRole(userId: string, workspaceId: string): Promise<string | null>;

	listMembers(workspaceId: string): Promise<any[]>;
	invite(
		workspaceId: string,
		invitedBy: string,
		input: InviteMemberInput,
	): Promise<WorkspaceInvitation>;
	acceptInvitation(invitationId: string, userId: string, userEmail: string): Promise<void>;
	updateInvitation(invitationId: string, data: { status: string }): Promise<WorkspaceInvitation>;
	removeMember(workspaceId: string, userId: string): Promise<void>;

	listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]>;
}
