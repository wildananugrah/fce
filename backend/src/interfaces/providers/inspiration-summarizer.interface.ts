export interface InspirationSummary {
	angle: string;
	tone: string;
	keyPoints: string[];
	format: string;
	hashtags?: string[];
	engagementSignal?: string;
}

export interface IInspirationSummarizer {
	summarizeInspiration(rawData: unknown): Promise<InspirationSummary>;
}
