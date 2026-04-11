export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	productIds?: string[];
	contentTopicId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language?: string;
	prompt?: string;
	objective?: string;
	tonePreset?: string;
	visualStyle?: string;
	outputLength?: string;
}
