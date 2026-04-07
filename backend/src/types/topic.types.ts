export interface CreateTopicInput {
	brandId?: string;
	productId?: string;
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
	productId?: string;
	platform?: string;
	count?: number;
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
}
