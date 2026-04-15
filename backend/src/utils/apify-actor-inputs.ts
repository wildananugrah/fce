import type { UrlKind } from "./url-router";

export interface ApifyActorCall {
	actorId: string;
	input: Record<string, unknown>;
}

export function buildActorInput(kind: UrlKind): ApifyActorCall {
	switch (kind.type) {
		case "instagram":
			return {
				actorId: "apify/instagram-scraper",
				input: { directUrls: [kind.url], resultsLimit: 1, resultsType: "posts" },
			};
		case "tiktok":
			return {
				actorId: "clockworks/free-tiktok-scraper",
				input: { postURLs: [kind.url], resultsPerPage: 1, shouldDownloadVideos: false },
			};
		case "facebook":
			return {
				actorId: "apify/facebook-posts-scraper",
				input: { startUrls: [{ url: kind.url }], maxPosts: 1 },
			};
		case "youtube":
		case "website":
			return {
				actorId: "apify/website-content-crawler",
				input: {
					startUrls: [{ url: kind.url }],
					maxCrawlPages: 1,
					maxCrawlDepth: 0,
					crawlerType: "playwright:adaptive",
				},
			};
	}
}
