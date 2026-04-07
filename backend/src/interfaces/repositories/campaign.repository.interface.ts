import type {
	Campaign,
	CampaignBrief,
	CampaignOutput,
} from "@prisma/client";
import type {
	CreateBriefInput,
	CreateChannelRoleInput,
	CreateDeliverableInput,
} from "../../types/campaign.types";

export interface ICampaignRepository {
	findByWorkspace(workspaceId: string): Promise<Campaign[]>;
	findById(id: string): Promise<
		| (Campaign & {
				outputs: CampaignOutput[];
				briefs: CampaignBrief[];
		  })
		| null
	>;
	create(data: {
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
	}): Promise<Campaign>;
	update(
		id: string,
		data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status">>,
	): Promise<Campaign>;
	createBrief(campaignId: string, data: CreateBriefInput): Promise<CampaignBrief>;
	findBriefByCampaign(campaignId: string): Promise<CampaignBrief | null>;
	updateBrief(id: string, data: Partial<CreateBriefInput>): Promise<CampaignBrief>;
	createChannelRoles(
		campaignOutputId: string,
		roles: CreateChannelRoleInput[],
	): Promise<void>;
	createDeliverables(
		campaignOutputId: string,
		deliverables: CreateDeliverableInput[],
	): Promise<void>;
}
