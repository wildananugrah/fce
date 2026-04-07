export interface TopicGenerationInput {
	brandContext: string;
	productContext?: string;
	platform?: string;
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
