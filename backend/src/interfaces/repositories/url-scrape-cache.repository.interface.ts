export interface CachedScrape {
	id: string;
	urlHash: string;
	url: string;
	kind: string;
	rawData: unknown;
	summary: string | null;
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
}
