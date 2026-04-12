import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class GoogleTrendsParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.query || item.title || item.keyword)
			.map((item) => ({
				dataType: "trend" as const,
				title: item.query || item.title || item.keyword || undefined,
				url: item.exploreLink ? `https://trends.google.com${item.exploreLink}` : undefined,
				content: item.query || item.title || item.keyword || "",
				metadata: {
					platform: "google_trends",
					value: item.value ?? item.interest,
					formattedValue: item.formattedValue,
					relatedQueries: item.relatedQueries,
					geo: item.geo,
					timeRange: item.timeRange,
				},
				scrapedAt: new Date(),
			}));
	}
}
