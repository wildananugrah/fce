import type { PrismaClient } from "@prisma/client";
import type {
	DashboardStats,
	IDashboardService,
} from "../interfaces/services/dashboard.service.interface";

export class DashboardService implements IDashboardService {
	constructor(private prisma: PrismaClient) {}

	async getStats(workspaceId: string): Promise<DashboardStats> {
		const [brandCount, productCount, generationCount, campaignCount, workspace, recentGenerations] =
			await Promise.all([
				this.prisma.brand.count({ where: { workspaceId } }),
				this.prisma.product.count({ where: { workspaceId } }),
				this.prisma.generationRequest.count({ where: { workspaceId } }),
				this.prisma.campaign.count({ where: { workspaceId } }),
				this.prisma.workspace.findUnique({
					where: { id: workspaceId },
					select: { apiUsageUsd: true, apiLimitUsd: true },
				}),
				this.prisma.generationRequest.findMany({
					where: { workspaceId },
					orderBy: { createdAt: "desc" },
					take: 10,
					select: {
						id: true,
						platform: true,
						contentType: true,
						status: true,
						createdAt: true,
					},
				}),
			]);

		return {
			brandCount,
			productCount,
			generationCount,
			campaignCount,
			apiUsageUsd: Number(workspace?.apiUsageUsd ?? 0),
			apiLimitUsd: Number(workspace?.apiLimitUsd ?? 0),
			recentGenerations,
		};
	}
}
