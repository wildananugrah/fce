export interface IAdminService {
	listUsers(): Promise<any[]>;
	updateUser(
		userId: string,
		data: { fullName?: string; status?: string; isSuperadmin?: boolean },
	): Promise<any>;
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
