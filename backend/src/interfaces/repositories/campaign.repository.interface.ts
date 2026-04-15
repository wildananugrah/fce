import type { Campaign, CampaignBrief, CampaignOutput } from "@prisma/client";
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
		status?: string;
		generationStage?: string;
	}): Promise<Campaign>;
	update(
		id: string,
		data: {
			name?: string;
			description?: string | null;
			objective?: string | null;
			status?: string;
			generationStage?: string | null;
			errorMessage?: string | null;
			audienceSegment?: string | null;
			keyMessage?: string | null;
			channelMix?: string[] | null;
			durationStart?: Date | null;
			durationEnd?: Date | null;
		},
	): Promise<Campaign>;
	createBrief(campaignId: string, data: CreateBriefInput): Promise<CampaignBrief>;
	findBriefByCampaign(campaignId: string): Promise<CampaignBrief | null>;
	updateBrief(id: string, data: Partial<CreateBriefInput>): Promise<CampaignBrief>;
	createChannelRoles(campaignOutputId: string, roles: CreateChannelRoleInput[]): Promise<void>;
	createDeliverables(
		campaignOutputId: string,
		deliverables: CreateDeliverableInput[],
	): Promise<void>;
}
