export interface ContentGenerationInput {
	brandContext: string;
	productContext?: string;
	skillContext?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language: string;
	prompt?: string;
	referenceImages?: string[];
	researchContext?: string;
}

export interface ContentGenerationOutput {
	contentTitle: string;
	content: {
		hook?: string;
		headline?: string;
		body?: string;
		cta?: string;
		hashtags?: string[];
		visualDirection?: string;
		slides?: Array<{ headline: string; body: string; visualDirection?: string }>;
		scenes?: Array<{
			timeRange?: string;
			visualDirection: string;
			voiceover: string;
			onScreenText?: string;
			visualReference?: string;
			referenceImageUrl?: string;
		}>;
		frames?: Array<{ visual: string; textOverlay?: string }>;
	};
}

export interface IContentGenerator {
	generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
}
