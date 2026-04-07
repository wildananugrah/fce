import type { Campaign } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ICampaignRepository } from "../interfaces/repositories/campaign.repository.interface";
import type { ICampaignService } from "../interfaces/services/campaign.service.interface";
import type { CreateCampaignInput, UpdateCampaignInput } from "../types/campaign.types";

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

	async create(workspaceId: string, userId: string, input: CreateCampaignInput): Promise<Campaign> {
		const campaign = await this.campaignRepository.create({
			workspaceId,
			brandId: input.brandId,
			name: input.name,
			description: input.description,
			objective: input.objective,
			budget: input.budget,
			channelMix: input.channelMix,
			culturalContext: input.culturalContext,
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
}
