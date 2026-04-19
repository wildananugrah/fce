export interface IAdminService {
	listUsers(): Promise<any[]>;
	createUser(input: {
		email: string;
		password: string;
		fullName?: string;
		isSuperadmin?: boolean;
	}): Promise<any>;
	updateUser(
		userId: string,
		data: { fullName?: string; status?: string; isSuperadmin?: boolean; email?: string },
	): Promise<any>;
	deleteUser(userId: string): Promise<void>;
	resetPassword(userId: string, newPassword: string): Promise<void>;
	listUserWorkspaces(userId: string): Promise<
		Array<{ workspaceId: string; workspaceName: string; workspaceSlug: string; role: string }>
	>;
	setUserWorkspaceRole(
		userId: string,
		workspaceId: string,
		role: "admin" | "member",
	): Promise<void>;
	removeUserFromWorkspace(userId: string, workspaceId: string): Promise<void>;
	listAuditLogs(workspaceId?: string, limit?: number): Promise<any[]>;
	createTaxonomyItem(
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		data: { name: string; description?: string },
	): Promise<any>;
	updateTaxonomyItem(
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
		data: { name?: string; description?: string },
	): Promise<any>;
	deleteTaxonomyItem(
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
	): Promise<void>;
}
