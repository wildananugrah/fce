export interface TopicGenerationInput {
	brandContext: string;
	productContexts?: string[];
	skillContext?: string;
	platform?: string;
	objective?: string;
	formats?: string[];
	pillars?: string[];
	language?: string;
	dateFrom?: string;
	dateTo?: string;
	count?: number;
	prompt?: string;
	referenceImages?: string[];
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
