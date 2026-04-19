import type { PrismaClient } from "@prisma/client";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { IBrandScraper } from "../interfaces/providers/brand-scraper.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { WebsiteCrawlerParser } from "../providers/apify-parsers/website-crawler.parser";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";

interface BrandScrapingJobData {
	brandId: string;
	url: string;
	userId: string;
}

export class BrandScrapingJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
		private apifyProvider?: IApifyProvider,
	) {}

	async handle(data: BrandScrapingJobData): Promise<void> {
		const { brandId, url, userId } = data;

		try {
			// Resolve workspaceId from the brand record
			const brand = await this.prisma.brand.findUnique({
				where: { id: brandId },
				select: { workspaceId: true },
			});
			const workspaceId = brand?.workspaceId ?? "";

			// Apify pre-step: enrich with structured content if API key available
			let enrichedContent: string | undefined;
			if (this.apifyProvider) {
				try {
					const settings = await this.prisma.workspaceSetting.findFirst({
						where: {
							workspace: {
								brands: { some: { id: brandId } },
							},
						},
					});
					if (settings?.apifyApiKey) {
						this.logger.info("Using Apify to pre-scrape brand URL", { brandId, url });
						const { runId } = await this.apifyProvider.runActor(
							"apify/website-content-crawler",
							{ startUrls: [{ url }], maxCrawlPages: 5 },
							settings.apifyApiKey,
						);

						// Wait for Apify completion (max 2 min for brand scraping)
						let delay = 1000;
						const start = Date.now();
						while (Date.now() - start < 120000) {
							await new Promise((r) => setTimeout(r, delay));
							const status = await this.apifyProvider.getRunStatus(runId, settings.apifyApiKey);
							if (status.status === "SUCCEEDED") break;
							if (status.status === "FAILED" || status.status === "ABORTED") break;
							delay = Math.min(delay * 2, 15000);
						}

						const rawResults = await this.apifyProvider.getRunResults(runId, settings.apifyApiKey);
						const parser = new WebsiteCrawlerParser();
						const parsed = parser.parse(rawResults);
						if (parsed.length > 0) {
							enrichedContent = parsed
								.slice(0, 5)
								.map((p) => `## ${p.title || "Page"}\n${p.content}`)
								.join("\n\n---\n\n")
								.slice(0, 10000);
							this.logger.info("Apify enrichment complete", {
								brandId,
								pages: parsed.length,
								chars: enrichedContent.length,
							});
						}
					}
				} catch (err) {
					this.logger.warn("Apify pre-step failed, falling back to AI-only scraping", {
						brandId,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			// Scrape brand data from URL (with optional enriched content)
			const brandScraper = await this.aiFactory.getBrandScraper(workspaceId);
			const providerName = (await this.aiFactory.getSettings(workspaceId)).providers.brandScraper;
			const startTime = Date.now();
			let scraped: Awaited<ReturnType<IBrandScraper["scrape"]>>;
			try {
				scraped = enrichedContent
					? await brandScraper.scrape({ url, enrichedContent } as any)
					: await brandScraper.scrape({ url });
				const durationMs = Date.now() - startTime;
				const usage = (brandScraper as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "brand_scraping",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Scrape URL: ${url}`,
						brandId,
					},
					{
						responseJson: scraped,
						durationMs,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			} catch (err) {
				const durationMs = Date.now() - startTime;
				const usage = (brandScraper as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "brand_scraping",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Scrape URL: ${url}`,
						brandId,
					},
					{
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						durationMs,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
				throw err;
			}

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
