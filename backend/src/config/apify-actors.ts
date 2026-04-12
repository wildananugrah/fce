import { FacebookParser } from "../providers/apify-parsers/facebook.parser";
import { GoogleSearchParser } from "../providers/apify-parsers/google-search.parser";
import { GoogleTrendsParser } from "../providers/apify-parsers/google-trends.parser";
import { InstagramParser } from "../providers/apify-parsers/instagram.parser";
import { TikTokParser } from "../providers/apify-parsers/tiktok.parser";
import type { IActorResultParser } from "../providers/apify-parsers/types";
import { WebsiteCrawlerParser } from "../providers/apify-parsers/website-crawler.parser";

export type ActorType =
	| "website_crawler"
	| "instagram"
	| "tiktok"
	| "facebook"
	| "google_trends"
	| "google_search";

interface ActorConfig {
	actorId: string;
	label: string;
	description: string;
	parser: IActorResultParser;
}

export const APIFY_ACTORS: Record<ActorType, ActorConfig> = {
	website_crawler: {
		actorId: "apify/website-content-crawler",
		label: "Website Crawler",
		description: "Extract content from any website",
		parser: new WebsiteCrawlerParser(),
	},
	instagram: {
		actorId: "apify/instagram-scraper",
		label: "Instagram",
		description: "Scrape posts from an account",
		parser: new InstagramParser(),
	},
	tiktok: {
		actorId: "clockworks/free-tiktok-scraper",
		label: "TikTok",
		description: "Scrape videos from an account",
		parser: new TikTokParser(),
	},
	facebook: {
		actorId: "apify/facebook-posts-scraper",
		label: "Facebook",
		description: "Scrape posts from a page",
		parser: new FacebookParser(),
	},
	google_trends: {
		actorId: "emastra/google-trends-scraper",
		label: "Google Trends",
		description: "Discover trending topics",
		parser: new GoogleTrendsParser(),
	},
	google_search: {
		actorId: "apify/google-search-scraper",
		label: "Google Search",
		description: "Analyze search results",
		parser: new GoogleSearchParser(),
	},
};
