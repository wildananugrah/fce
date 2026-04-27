export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	productIds?: string[];
	contentTopicId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	/** @internal — sourced from brand.language inside the service, NOT from request body. */
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
