import type { Campaign } from "@prisma/client";
import type { CreateCampaignInput, UpdateCampaignInput } from "../../types/campaign.types";

export interface ICampaignService {
	list(workspaceId: string): Promise<Campaign[]>;
	getById(id: string): Promise<any>;
	create(workspaceId: string, userId: string, input: CreateCampaignInput): Promise<Campaign>;
	update(id: string, input: UpdateCampaignInput): Promise<Campaign>;
}
