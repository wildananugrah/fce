import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class FacebookParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.message)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.pageName || item.user?.name || undefined,
				url: item.url || item.postUrl || undefined,
				content: item.text || item.message || "",
				metadata: {
					platform: "facebook",
					likes: item.likes ?? item.reactionsCount ?? 0,
					comments: item.comments ?? item.commentsCount ?? 0,
					shares: item.shares ?? item.sharesCount ?? 0,
					type: item.type,
					pageName: item.pageName,
				},
				scrapedAt: item.time ? new Date(item.time) : new Date(),
			}));
	}
}
