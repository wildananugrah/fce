import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class GoogleSearchParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		const results: ParsedResearchResult[] = [];
		for (const item of rawItems) {
			const organicResults = item.organicResults || [item];
			for (const result of organicResults) {
				if (!result.title && !result.description) continue;
				results.push({
					dataType: "search_result" as const,
					title: result.title || undefined,
					url: result.url || result.link || undefined,
					content: result.description || result.snippet || "",
					metadata: {
						platform: "google_search",
						position: result.position,
						displayedUrl: result.displayedUrl,
						searchQuery: item.searchQuery?.term || item.keyword,
					},
					scrapedAt: new Date(),
				});
			}
		}
		return results;
	}
}
