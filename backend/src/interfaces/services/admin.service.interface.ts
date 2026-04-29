export interface IAdminService {
	listUsers(): Promise<any[]>;
	createUser(
		actingUserId: string,
		input: { email: string; password: string; fullName?: string; isSuperadmin?: boolean },
	): Promise<any>;
	updateUser(
		actingUserId: string,
		userId: string,
		data: { fullName?: string; status?: string; isSuperadmin?: boolean; email?: string },
	): Promise<any>;
	deleteUser(actingUserId: string, userId: string): Promise<void>;
	resetPassword(actingUserId: string, userId: string, newPassword: string): Promise<void>;
	listUserWorkspaces(userId: string): Promise<
		Array<{ workspaceId: string; workspaceName: string; workspaceSlug: string; role: string }>
	>;
	setUserWorkspaceRole(
		actingUserId: string,
		userId: string,
		workspaceId: string,
		role: "admin" | "member",
	): Promise<void>;
	removeUserFromWorkspace(
		actingUserId: string,
		userId: string,
		workspaceId: string,
	): Promise<void>;
	listAuditLogs(workspaceId?: string, limit?: number): Promise<any[]>;
	createTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		data: { name: string; description?: string },
	): Promise<any>;
	updateTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
		data: { name?: string; description?: string },
	): Promise<any>;
	deleteTaxonomyItem(
		actingUserId: string,
		type: "framework" | "hookType" | "tonePreset" | "visualStyle",
		id: string,
	): Promise<void>;
}
