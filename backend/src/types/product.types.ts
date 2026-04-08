export interface CreateProductInput {
	brandId: string;
	name: string;
	slug: string;
	type?: string;
	priceTier?: string;
	summary?: string;
	imageUrl?: string;
}

export interface UpdateProductInput {
	name?: string;
	type?: string;
	priceTier?: string;
	summary?: string;
	imageUrl?: string;
	status?: string;
}

export interface CreateProductBrainVersionInput {
	usp?: string;
	rtb?: string;
	functionalBenefits?: any;
	emotionalBenefits?: any;
	targetAudience?: string;
	claims?: any;
	disclaimers?: any;
}
