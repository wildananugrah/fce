import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class WebsiteCrawlerParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.markdown)
			.map((item) => ({
				dataType: "page_content" as const,
				title: item.metadata?.title || item.title || undefined,
				url: item.url || undefined,
				content: item.text || item.markdown || "",
				metadata: {
					description: item.metadata?.description,
					language: item.metadata?.languageCode,
					loadedAt: item.loadedAt,
				},
				scrapedAt: item.loadedAt ? new Date(item.loadedAt) : new Date(),
			}));
	}
}
