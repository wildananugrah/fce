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

			// Create a new BrandBrainVersion with the scraped data
			await this.prisma.brandBrainVersion.create({
				data: {
					brandId,
					version: nextVersion,
					personality: scraped.personality ?? null,
					tone: scraped.tone ?? null,
					values: scraped.values ? (scraped.values as any) : null,
					vocabulary: scraped.vocabulary ? (scraped.vocabulary as any) : null,
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
