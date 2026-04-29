import type { UrlKind } from "./url-router";

export interface ApifyActorCall {
	actorId: string;
	input: Record<string, unknown>;
}

export function buildActorInput(kind: UrlKind): ApifyActorCall {
	// Always pass the normalized URL to the scraper. The raw `kind.url` may
	// carry tracking params (utm_*, igsh, fbclid, etc.) which confuse some
	// actors and cause them to return 0 results.
	const url = kind.normalizedUrl;
	switch (kind.type) {
		case "instagram":
			return {
				actorId: "apify/instagram-scraper",
				input: { directUrls: [url], resultsLimit: 1, resultsType: "posts" },
			};
		case "tiktok":
			return {
				actorId: "clockworks/free-tiktok-scraper",
				input: { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: false },
			};
		case "facebook":
			return {
				actorId: "apify/facebook-posts-scraper",
				input: { startUrls: [{ url }], maxPosts: 1 },
			};
		case "youtube":
		case "website":
			return {
				actorId: "apify/website-content-crawler",
				input: {
					startUrls: [{ url }],
					maxCrawlPages: 1,
					maxCrawlDepth: 0,
					crawlerType: "playwright:adaptive",
				},
			};
	}
}
