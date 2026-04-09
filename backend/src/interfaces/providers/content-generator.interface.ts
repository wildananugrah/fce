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
		scenes?: Array<{ visualDirection: string; voiceover: string; onScreenText?: string }>;
		frames?: Array<{ visual: string; textOverlay?: string }>;
	};
}

export interface IContentGenerator {
	generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
}
