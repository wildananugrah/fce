import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedResearchResult {
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title?: string;
	url?: string;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: Date;
}

export interface IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
}
