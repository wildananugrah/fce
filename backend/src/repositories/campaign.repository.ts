import type { Campaign, CampaignOutput, PrismaClient } from "@prisma/client";
import type { ICampaignRepository } from "../interfaces/repositories/campaign.repository.interface";

export class CampaignRepository implements ICampaignRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string): Promise<Campaign[]> {
		return this.prisma.campaign.findMany({
			where: { workspaceId },
			orderBy: { createdAt: "desc" },
		});
	}

	async findById(id: string): Promise<(Campaign & { outputs: CampaignOutput[] }) | null> {
		return this.prisma.campaign.findUnique({
			where: { id },
			include: {
				outputs: true,
			},
		});
	}

	async create(data: {
		workspaceId: string;
		brandId?: string;
		name: string;
		description?: string;
		objective?: string;
		budget?: string;
		channelMix?: any;
		culturalContext?: string;
	}): Promise<Campaign> {
		return this.prisma.campaign.create({ data });
	}

	async update(
		id: string,
		data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status">>,
	): Promise<Campaign> {
		return this.prisma.campaign.update({ where: { id }, data });
	}
}
