export interface BriefSummaryInput {
	extractedText: string;
	brandContext: string;
	productContext?: string;
}

export interface BriefSummaryOutput {
	summary: string;
	objective: string;
	audienceHint: string;
	keyMessage: string;
	budgetHint: string;
	channelHint: string[];
	durationHint: {
		start: string | null;
		end: string | null;
	};
}

export interface ICampaignBriefSummarizer {
	summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput>;
}
