import type { Campaign, CampaignBrief } from "@prisma/client";
import type {
	CreateBriefInput,
	CreateCampaignInput,
	UpdateCampaignInput,
} from "../../types/campaign.types";

export interface ICampaignService {
	list(workspaceId: string): Promise<Campaign[]>;
	getById(id: string): Promise<any>;
	create(
		workspaceId: string,
		userId: string,
		input: CreateCampaignInput,
	): Promise<Campaign>;
	update(id: string, input: UpdateCampaignInput): Promise<Campaign>;
	createBrief(
		campaignId: string,
		input: CreateBriefInput,
	): Promise<CampaignBrief>;
	getBrief(campaignId: string): Promise<CampaignBrief | null>;
	updateBrief(
		briefId: string,
		input: Partial<CreateBriefInput>,
	): Promise<CampaignBrief>;
	generateFromBrief(campaignId: string, userId: string): Promise<void>;
}
