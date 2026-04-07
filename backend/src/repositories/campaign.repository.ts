import type {
	Campaign,
	CampaignBrief,
	CampaignOutput,
	PrismaClient,
} from "@prisma/client";
import type { ICampaignRepository } from "../interfaces/repositories/campaign.repository.interface";
import type {
	CreateBriefInput,
	CreateChannelRoleInput,
	CreateDeliverableInput,
} from "../types/campaign.types";

export class CampaignRepository implements ICampaignRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string): Promise<Campaign[]> {
		return this.prisma.campaign.findMany({
			where: { workspaceId },
			orderBy: { createdAt: "desc" },
		});
	}

	async findById(
		id: string,
	): Promise<
		(Campaign & { outputs: CampaignOutput[]; briefs: CampaignBrief[] }) | null
	> {
		return this.prisma.campaign.findUnique({
			where: { id },
			include: {
				outputs: {
					include: {
						channelRoleRecords: true,
						deliverables: true,
					},
				},
				briefs: true,
			},
		});
	}

	async create(data: {
		workspaceId: string;
		brandId?: string;
		productId?: string;
		name: string;
		description?: string;
		objective?: string;
		budget?: string;
		channelMix?: any;
		culturalContext?: string;
		audienceSegment?: string;
		durationStart?: Date;
		durationEnd?: Date;
		budgetMin?: number;
		budgetMax?: number;
		keyMessage?: string;
	}): Promise<Campaign> {
		return this.prisma.campaign.create({ data });
	}

	async update(
		id: string,
		data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status">>,
	): Promise<Campaign> {
		return this.prisma.campaign.update({ where: { id }, data });
	}

	async createBrief(
		campaignId: string,
		data: CreateBriefInput,
	): Promise<CampaignBrief> {
		return this.prisma.campaignBrief.create({
			data: {
				campaignId,
				objectiveDetail: data.objectiveDetail,
				channelMix: data.channelMix,
				mandatoryDeliverables: data.mandatoryDeliverables,
				culturalContext: data.culturalContext,
				trendContext: data.trendContext,
				competitiveContext: data.competitiveContext,
				kpiPreference: data.kpiPreference,
				toneDirection: data.toneDirection,
			},
		});
	}

	async findBriefByCampaign(
		campaignId: string,
	): Promise<CampaignBrief | null> {
		return this.prisma.campaignBrief.findFirst({
			where: { campaignId },
			orderBy: { createdAt: "desc" },
		});
	}

	async updateBrief(
		id: string,
		data: Partial<CreateBriefInput>,
	): Promise<CampaignBrief> {
		return this.prisma.campaignBrief.update({
			where: { id },
			data: {
				objectiveDetail: data.objectiveDetail,
				channelMix: data.channelMix,
				mandatoryDeliverables: data.mandatoryDeliverables,
				culturalContext: data.culturalContext,
				trendContext: data.trendContext,
				competitiveContext: data.competitiveContext,
				kpiPreference: data.kpiPreference,
				toneDirection: data.toneDirection,
			},
		});
	}

	async createChannelRoles(
		campaignOutputId: string,
		roles: CreateChannelRoleInput[],
	): Promise<void> {
		await this.prisma.campaignChannelRole.createMany({
			data: roles.map((role) => ({
				campaignOutputId,
				channelCode: role.channelCode,
				channelRole: role.channelRole,
				priorityOrder: role.priorityOrder,
			})),
		});
	}

	async createDeliverables(
		campaignOutputId: string,
		deliverables: CreateDeliverableInput[],
	): Promise<void> {
		await this.prisma.campaignDeliverable.createMany({
			data: deliverables.map((d) => ({
				campaignOutputId,
				deliverableType: d.deliverableType,
				deliverableName: d.deliverableName,
				recommendedChannel: d.recommendedChannel,
				funnelStage: d.funnelStage,
				qtyRecommendation: d.qtyRecommendation,
			})),
		});
	}
}
