export interface CreateBrandInput {
	name: string;
	slug: string;
	category?: string;
	websiteUrl?: string;
	projectId?: string;
}

export interface UpdateBrandInput {
	name?: string;
	category?: string;
	websiteUrl?: string;
	status?: string;
}

export interface CreateBrainVersionInput {
	personality?: string;
	tone?: string;
	audiencePersonas?: any;
	values?: any;
	messagingRules?: any;
	vocabulary?: any;
}
