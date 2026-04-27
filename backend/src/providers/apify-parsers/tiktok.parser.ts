import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";
import type { IActorResultParser, MediaInfo, ParsedResearchResult } from "./types";

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

	extractMedia(rawItem: ApifyResultItem): MediaInfo | null {
		const item = rawItem as Record<string, unknown>;
		// Common TikTok actor field names. videoUrl at top level OR
		// videoMeta.downloadAddr depending on actor version.
		const videoUrl =
			typeof item.videoUrl === "string"
				? item.videoUrl
				: typeof (item.videoMeta as Record<string, unknown> | undefined)?.downloadAddr === "string"
					? ((item.videoMeta as Record<string, unknown>).downloadAddr as string)
					: undefined;
		if (!videoUrl) return null;

		const meta = item.videoMeta as Record<string, unknown> | undefined;
		const duration =
			typeof meta?.duration === "number" ? Math.round(meta.duration) : undefined;
		return { videoUrl, durationSeconds: duration };
	}
}
