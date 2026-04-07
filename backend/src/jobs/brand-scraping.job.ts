import type { PrismaClient } from "@prisma/client";
import type { IBrandScraper } from "../interfaces/providers/brand-scraper.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface BrandScrapingJobData {
	brandId: string;
	url: string;
	userId: string;
}

export class BrandScrapingJob {
	constructor(
		private prisma: PrismaClient,
		private brandScraper: IBrandScraper,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: BrandScrapingJobData): Promise<void> {
		const { brandId, url, userId } = data;

		try {
			// Scrape brand data from URL
			const scraped = await this.brandScraper.scrape({ url });

			// Determine next version number
			const latest = await this.prisma.brandBrainVersion.findFirst({
				where: { brandId },
				orderBy: { version: "desc" },
			});
			const nextVersion = (latest?.version ?? 0) + 1;

			// Deactivate all existing versions
			await this.prisma.brandBrainVersion.updateMany({
				where: { brandId, isActive: true },
				data: { isActive: false },
			});

			// Update brand with scraped name/category if available
			if (scraped.name || scraped.category) {
				await this.prisma.brand.update({
					where: { id: brandId },
					data: {
						...(scraped.name ? { name: scraped.name } : {}),
						...(scraped.category ? { category: scraped.category } : {}),
					},
				});
			}

			// Build messaging rules from do's and don'ts
			const messagingRules: Record<string, string[]> = {};
			if (scraped.dos && scraped.dos.length > 0) messagingRules.do = scraped.dos;
			if (scraped.donts && scraped.donts.length > 0) messagingRules.dont = scraped.donts;

			// Create a new BrandBrainVersion with the scraped data
			await this.prisma.brandBrainVersion.create({
				data: {
					brandId,
					version: nextVersion,
					personality: scraped.personality ?? null,
					tone: scraped.tone ?? null,
					audiencePersonas: scraped.targetAudience
						? [{ name: "Primary", traits: [scraped.targetAudience] }]
						: null,
					values: scraped.values ? (scraped.values as any) : null,
					messagingRules: Object.keys(messagingRules).length > 0 ? messagingRules : null,
					vocabulary: {
						...(scraped.vocabulary ?? {}),
						summary: scraped.summary ?? undefined,
						brandPromise: scraped.brandPromise ?? undefined,
						usp: scraped.usp ?? undefined,
						contentPillars: scraped.contentPillars ?? [],
						marketingStrategy: scraped.marketingStrategy ?? undefined,
					},
					isActive: true,
					status: "draft",
				},
			});

			// Notify via SSE
			this.notificationService.notify(userId, {
				type: "brand_scraping_complete",
				data: { brandId, version: nextVersion, status: "completed" },
			});

			this.logger.info("Brand scraping completed", { brandId, version: nextVersion });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Brand scraping failed", { brandId, error: message });

			this.notificationService.notify(userId, {
				type: "brand_scraping_failed",
				data: { brandId, status: "failed", error: message },
			});
		}
	}
}
