export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	productIds?: string[];
	contentTopicId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	/** Per-request language override. When omitted, the service falls back to brand.language. */
	language?: string;
	prompt?: string;
	objective?: string;
	tonePreset?: string;
	visualStyle?: string;
	outputLength?: string;
	referenceImages?: string[];
	researchContext?: string;
	pillars?: string[];
}
