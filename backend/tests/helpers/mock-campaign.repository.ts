import type { Campaign, CampaignBrief, CampaignOutput } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/client";
import type { ICampaignRepository } from "../../src/interfaces/repositories/campaign.repository.interface";
import type {
	CreateBriefInput,
	CreateChannelRoleInput,
	CreateDeliverableInput,
} from "../../src/types/campaign.types";

export class MockCampaignRepository implements ICampaignRepository {
	private campaigns: Campaign[] = [];
	private outputs: CampaignOutput[] = [];
	private briefs: CampaignBrief[] = [];
	private channelRoles: any[] = [];
	private deliverables: any[] = [];

	async findByWorkspace(workspaceId: string): Promise<Campaign[]> {
		return this.campaigns.filter((c) => c.workspaceId === workspaceId);
	}

	async findById(
		id: string,
	): Promise<(Campaign & { outputs: CampaignOutput[]; briefs: CampaignBrief[] }) | null> {
		const campaign = this.campaigns.find((c) => c.id === id);
		if (!campaign) return null;
		const campaignOutputs = this.outputs.filter((o) => o.campaignId === id);
		const campaignBriefs = this.briefs.filter((b) => b.campaignId === id);
		return { ...campaign, outputs: campaignOutputs, briefs: campaignBriefs };
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
		const campaign: Campaign = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			brandId: data.brandId ?? null,
			productId: data.productId ?? null,
			name: data.name,
			description: data.description ?? null,
			objective: data.objective ?? null,
			budget: data.budget ?? null,
			channelMix: data.channelMix ?? null,
			culturalContext: data.culturalContext ?? null,
			audienceSegment: data.audienceSegment ?? null,
			durationStart: data.durationStart ?? null,
			durationEnd: data.durationEnd ?? null,
			budgetMin: data.budgetMin != null ? new Decimal(data.budgetMin) : null,
			budgetMax: data.budgetMax != null ? new Decimal(data.budgetMax) : null,
			keyMessage: data.keyMessage ?? null,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.campaigns.push(campaign);
		return campaign;
	}

	async update(
		id: string,
		data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status">>,
	): Promise<Campaign> {
		const index = this.campaigns.findIndex((c) => c.id === id);
		if (index === -1) throw new Error("Campaign not found");
		this.campaigns[index] = {
			...this.campaigns[index],
			...data,
			updatedAt: new Date(),
		};
		return this.campaigns[index];
	}

	async createBrief(campaignId: string, data: CreateBriefInput): Promise<CampaignBrief> {
		const brief: CampaignBrief = {
			id: crypto.randomUUID(),
			campaignId,
			objectiveDetail: data.objectiveDetail ?? null,
			channelMix: data.channelMix ?? null,
			mandatoryDeliverables: data.mandatoryDeliverables ?? null,
			culturalContext: data.culturalContext ?? null,
			trendContext: data.trendContext ?? null,
			competitiveContext: data.competitiveContext ?? null,
			kpiPreference: data.kpiPreference ?? null,
			toneDirection: data.toneDirection ?? null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.briefs.push(brief);
		return brief;
	}

	async findBriefByCampaign(campaignId: string): Promise<CampaignBrief | null> {
		const matching = this.briefs.filter((b) => b.campaignId === campaignId);
		if (matching.length === 0) return null;
		// Return the most recently created brief
		return matching.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
	}

	async updateBrief(id: string, data: Partial<CreateBriefInput>): Promise<CampaignBrief> {
		const index = this.briefs.findIndex((b) => b.id === id);
		if (index === -1) throw new Error("Brief not found");
		const existing = this.briefs[index];
		this.briefs[index] = {
			...existing,
			objectiveDetail: data.objectiveDetail ?? existing.objectiveDetail,
			channelMix: data.channelMix ?? existing.channelMix,
			mandatoryDeliverables: data.mandatoryDeliverables ?? existing.mandatoryDeliverables,
			culturalContext: data.culturalContext ?? existing.culturalContext,
			trendContext: data.trendContext ?? existing.trendContext,
			competitiveContext: data.competitiveContext ?? existing.competitiveContext,
			kpiPreference: data.kpiPreference ?? existing.kpiPreference,
			toneDirection: data.toneDirection ?? existing.toneDirection,
			updatedAt: new Date(),
		};
		return this.briefs[index];
	}

	async createChannelRoles(
		campaignOutputId: string,
		roles: CreateChannelRoleInput[],
	): Promise<void> {
		for (const role of roles) {
			this.channelRoles.push({
				id: crypto.randomUUID(),
				campaignOutputId,
				...role,
			});
		}
	}

	async createDeliverables(
		campaignOutputId: string,
		deliverables: CreateDeliverableInput[],
	): Promise<void> {
		for (const d of deliverables) {
			this.deliverables.push({
				id: crypto.randomUUID(),
				campaignOutputId,
				...d,
			});
		}
	}

	clear(): void {
		this.campaigns = [];
		this.outputs = [];
		this.briefs = [];
		this.channelRoles = [];
		this.deliverables = [];
	}
}
