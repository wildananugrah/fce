export interface CreateCampaignInput {
	brandId?: string;
	name: string;
	description?: string;
	objective?: string;
	budget?: string;
	channelMix?: string[];
	culturalContext?: string;
	generate?: boolean;
}

export interface UpdateCampaignInput {
	name?: string;
	description?: string;
	objective?: string;
	status?: string;
}
