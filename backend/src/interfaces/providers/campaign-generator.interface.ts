export interface CampaignGenerationInput {
	brandContext: string;
	objective?: string;
	budget?: string;
	channelMix?: string[];
	culturalContext?: string;
}

export interface CampaignGenerationOutput {
	bigIdea: string;
	messagingPillars: Array<{ name: string; description: string }>;
	funnelJourney: any;
	channelRoles: any;
}

export interface ICampaignGenerator {
	generate(input: CampaignGenerationInput): Promise<CampaignGenerationOutput>;
}
