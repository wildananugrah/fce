export interface CachedScrape {
	id: string;
	urlHash: string;
	url: string;
	kind: string;
	rawData: unknown;
	summary: string | null;
	videoSummary: string | null;
	scrapedAt: Date;
	expiresAt: Date;
}

export interface IUrlScrapeCacheRepository {
	findByHash(urlHash: string): Promise<CachedScrape | null>;
	upsert(data: {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		expiresAt: Date;
	}): Promise<void>;
	/**
	 * Update the videoSummary on an existing cache row, identified by URL hash.
	 * Idempotent — overwrites any prior value. No-op if the row doesn't exist.
	 */
	setVideoSummary(urlHash: string, videoSummary: string): Promise<void>;
}
