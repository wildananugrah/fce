import type { PrismaClient } from "@prisma/client";
import type {
	CachedScrape,
	IUrlScrapeCacheRepository,
} from "../interfaces/repositories/url-scrape-cache.repository.interface";

export class UrlScrapeCacheRepository implements IUrlScrapeCacheRepository {
	constructor(private prisma: PrismaClient) {}

	async findByHash(urlHash: string): Promise<CachedScrape | null> {
		const row = await this.prisma.urlScrapeCache.findUnique({ where: { urlHash } });
		if (!row) return null;
		if (row.expiresAt < new Date()) return null;
		return row as unknown as CachedScrape;
	}

	async upsert(data: {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		expiresAt: Date;
	}): Promise<void> {
		await this.prisma.urlScrapeCache.upsert({
			where: { urlHash: data.urlHash },
			update: {
				url: data.url,
				kind: data.kind,
				rawData: data.rawData as any,
				summary: data.summary,
				scrapedAt: new Date(),
				expiresAt: data.expiresAt,
			},
			create: {
				urlHash: data.urlHash,
				url: data.url,
				kind: data.kind,
				rawData: data.rawData as any,
				summary: data.summary,
				expiresAt: data.expiresAt,
			},
		});
	}
}
