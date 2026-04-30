export interface CreateTopicInput {
	brandId?: string;
	productIds?: string[];
	title: string;
	description?: string;
	pillar?: string;
	platform?: string;
	format?: string;
	objective?: string;
	publishDate?: string;
}

export interface GenerateTopicsInput {
	brandId?: string;
	productIds?: string[];
	platform?: string;
	objective?: string;
	formats?: string[];
	pillars?: string[];
	/** Per-request language override. When omitted, the service falls back to brand.language. */
	language?: string;
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	prompt?: string;
	referenceImages?: string[];
}

export interface UpdateTopicInput {
	title?: string;
	description?: string;
	pillar?: string;
	platform?: string;
	format?: string;
	objective?: string;
	publishDate?: string;
	status?: string;
	productIds?: string[];
}
