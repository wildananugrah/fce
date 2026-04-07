export interface CreateGenerationInput {
	brandId: string;
	productId?: string;
	platform: string;
	contentType: string;
	framework: string;
	hookType: string;
	language?: string;
	prompt?: string;
}
