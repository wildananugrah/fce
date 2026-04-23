import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedTikTokProfile {
	username: string;
	displayName: string | null;
	avatarUrl: string | null;
	followerCount: number | null;
	bio: string | null;
	platformMetadata: {
		videoCount: number | null;
		followingCount: number | null;
		totalHearts: number | null;
	};
}

export class TikTokProfileParser {
	parse(rawItems: ApifyResultItem[]): ParsedTikTokProfile | null {
		if (!rawItems || rawItems.length === 0) return null;
		const first = rawItems[0];
		const meta = first.authorMeta ?? {};
		const stats = first.authorStats ?? {};

		const username = meta.name ?? null;
		if (!username) return null;

		return {
			username,
			displayName: meta.nickName ?? null,
			avatarUrl: meta.avatar ?? null,
			followerCount: stats.followerCount ?? null,
			bio: meta.signature ?? null,
			platformMetadata: {
				videoCount: stats.videoCount ?? null,
				followingCount: stats.followingCount ?? null,
				totalHearts: stats.heart ?? null,
			},
		};
	}
}
