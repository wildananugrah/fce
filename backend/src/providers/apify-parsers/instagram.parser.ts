import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class InstagramParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.caption || item.type)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.ownerUsername ? `@${item.ownerUsername}` : undefined,
				url: item.url || item.shortCode ? `https://instagram.com/p/${item.shortCode}` : undefined,
				content: item.caption || "",
				metadata: {
					platform: "instagram",
					type: item.type,
					likesCount: item.likesCount ?? 0,
					commentsCount: item.commentsCount ?? 0,
					videoViewCount: item.videoViewCount,
					hashtags: item.hashtags || [],
					mentions: item.mentions || [],
					imageUrl: item.displayUrl || item.thumbnailUrl,
					ownerUsername: item.ownerUsername,
				},
				scrapedAt: item.timestamp ? new Date(item.timestamp) : new Date(),
			}));
	}
}
