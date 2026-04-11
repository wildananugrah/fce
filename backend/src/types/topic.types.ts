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
	dateFrom?: string;
	dateTo?: string;
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
	productIds?: string[];
}
