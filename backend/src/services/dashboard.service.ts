import type { PrismaClient } from "@prisma/client";
import type {
	DashboardStats,
	IDashboardService,
} from "../interfaces/services/dashboard.service.interface";

export class DashboardService implements IDashboardService {
	constructor(private prisma: PrismaClient) {}

	async getStats(workspaceId: string): Promise<DashboardStats> {
		// Queries are split sequentially to avoid the Prisma 7 WASM
		// "Out of bounds memory access" bug triggered by Promise.all.
		// Counts exclude archived rows so dashboard stats reflect what the user
		// sees in the main lists. Archived items live in Workspace Settings → Trash.
		const brandCount = await this.prisma.brand.count({
			where: { workspaceId, archivedAt: null },
		});
		const productCount = await this.prisma.product.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});
		const generationCount = await this.prisma.generationRequest.count({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
		});
		const campaignCount = await this.prisma.campaign.count({ where: { workspaceId } });
		const workspace = await this.prisma.workspace.findUnique({
			where: { id: workspaceId },
			select: { apiUsageUsd: true, apiLimitUsd: true },
		});
		const recentGenerations = await this.prisma.generationRequest.findMany({
			where: { workspaceId, archivedAt: null, brand: { archivedAt: null } },
			orderBy: { createdAt: "desc" },
			take: 10,
			select: {
				id: true,
				platform: true,
				contentType: true,
				status: true,
				createdAt: true,
			},
		});

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
