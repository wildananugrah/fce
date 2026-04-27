import type { ApifyResultItem } from "../../interfaces/providers/apify.interface";

export interface ParsedResearchResult {
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title?: string;
	url?: string;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: Date;
}

/**
 * Video metadata extracted from a single Apify result item. Used by the
 * URL inspiration service to decide whether to run video analysis.
 *   - videoUrl: direct video URL the host's CDN serves (post-Apify resolution).
 *   - durationSeconds: from the post metadata when available.
 *   - sizeBytes: optional; usually populated by a HEAD request, not by Apify.
 */
export interface MediaInfo {
	videoUrl?: string;
	durationSeconds?: number;
	sizeBytes?: number;
}

export interface IActorResultParser {
	parse(rawItems: ApifyResultItem[]): ParsedResearchResult[];
	/**
	 * Optional. Implement on parsers whose hosts produce videos (Instagram,
	 * TikTok, Facebook). Return null when the item is not a video.
	 * Parsers without video concept (Google Search, Google Trends, Website
	 * crawler) don't implement this.
	 */
	extractMedia?(rawItem: ApifyResultItem): MediaInfo | null;
}
