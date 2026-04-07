export interface CreateWorkspaceInput {
	name: string;
	slug: string;
	description?: string;
}

export interface UpdateWorkspaceInput {
	name?: string;
	description?: string;
	logoUrl?: string;
	avatarColor?: string;
	avatarEmoji?: string;
}

export interface InviteMemberInput {
	email: string;
	role?: string;
}

export interface WorkspaceSummary {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	logoUrl: string | null;
	avatarColor: string;
	avatarEmoji: string | null;
	role: string;
}
