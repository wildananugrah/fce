import type { Campaign, CampaignBrief } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ICampaignRepository } from "../interfaces/repositories/campaign.repository.interface";
import type { ICampaignService } from "../interfaces/services/campaign.service.interface";
import type {
	CreateBriefInput,
	CreateCampaignInput,
	UpdateCampaignInput,
} from "../types/campaign.types";

export class CampaignService implements ICampaignService {
	constructor(
		private campaignRepository: ICampaignRepository,
		private boss: PgBoss,
	) {}

	async list(workspaceId: string): Promise<Campaign[]> {
		return this.campaignRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<any> {
		const campaign = await this.campaignRepository.findById(id);
		if (!campaign) {
			throw new Error("Campaign not found");
		}
		return campaign;
	}

	async create(
		workspaceId: string,
		userId: string,
		input: CreateCampaignInput,
	): Promise<Campaign> {
		const campaign = await this.campaignRepository.create({
			workspaceId,
			brandId: input.brandId,
			productId: input.productId,
			name: input.name,
			description: input.description,
			objective: input.objective,
			budget: input.budget,
			channelMix: input.channelMix,
			culturalContext: input.culturalContext,
			audienceSegment: input.audienceSegment,
			durationStart: input.durationStart
				? new Date(input.durationStart)
				: undefined,
			durationEnd: input.durationEnd
				? new Date(input.durationEnd)
				: undefined,
			budgetMin: input.budgetMin,
			budgetMax: input.budgetMax,
			keyMessage: input.keyMessage,
		});

		if (input.generate) {
			await this.boss.send("campaign-generation", {
				campaignId: campaign.id,
				userId,
			});
		}

		return campaign;
	}

	async update(id: string, input: UpdateCampaignInput): Promise<Campaign> {
		return this.campaignRepository.update(id, input);
	}

	async createBrief(
		campaignId: string,
		input: CreateBriefInput,
	): Promise<CampaignBrief> {
		return this.campaignRepository.createBrief(campaignId, input);
	}

	async getBrief(campaignId: string): Promise<CampaignBrief | null> {
		return this.campaignRepository.findBriefByCampaign(campaignId);
	}

	async updateBrief(
		briefId: string,
		input: Partial<CreateBriefInput>,
	): Promise<CampaignBrief> {
		return this.campaignRepository.updateBrief(briefId, input);
	}

	async generateFromBrief(
		campaignId: string,
		userId: string,
	): Promise<void> {
		const campaign = await this.campaignRepository.findById(campaignId);
		if (!campaign) {
			throw new Error("Campaign not found");
		}

		await this.boss.send("campaign-generation", {
			campaignId,
			userId,
		});
	}
}
