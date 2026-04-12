import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, ParsedResearchResult } from "./types";

export class TikTokParser implements IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[] {
		return rawItems
			.filter((item) => item.text || item.desc)
			.map((item) => ({
				dataType: "social_post" as const,
				title: item.authorMeta?.name || item.author?.nickname || undefined,
				url: item.webVideoUrl || undefined,
				content: item.text || item.desc || "",
				metadata: {
					platform: "tiktok",
					diggCount: item.diggCount ?? item.stats?.diggCount ?? 0,
					shareCount: item.shareCount ?? item.stats?.shareCount ?? 0,
					playCount: item.playCount ?? item.stats?.playCount ?? 0,
					commentCount: item.commentCount ?? item.stats?.commentCount ?? 0,
					hashtags: item.hashtags?.map((h: any) => h.name || h) || [],
					musicName: item.musicMeta?.musicName || item.music?.title,
					authorUsername: item.authorMeta?.nickName || item.author?.uniqueId,
				},
				scrapedAt: item.createTime ? new Date(item.createTime * 1000) : new Date(),
			}));
	}
}
