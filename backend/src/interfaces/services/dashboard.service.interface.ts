export interface DashboardStats {
	brandCount: number;
	productCount: number;
	generationCount: number;
	campaignCount: number;
	apiUsageUsd: number;
	apiLimitUsd: number;
	recentGenerations: {
		id: string;
		platform: string;
		contentType: string;
		status: string;
		createdAt: Date;
	}[];
}

export interface IDashboardService {
	getStats(workspaceId: string): Promise<DashboardStats>;
}
