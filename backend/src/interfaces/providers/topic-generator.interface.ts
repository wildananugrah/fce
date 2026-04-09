export interface TopicGenerationInput {
	brandContext: string;
	productContext?: string;
	skillContext?: string;
	platform?: string;
	objective?: string;
	dateFrom?: string;
	dateTo?: string;
	count?: number;
}

export interface TopicGenerationOutput {
	topics: Array<{
		title: string;
		description: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: string;
	}>;
}

export interface ITopicGenerator {
	generate(input: TopicGenerationInput): Promise<TopicGenerationOutput>;
}
