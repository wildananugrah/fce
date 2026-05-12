// backend/src/jobs/brand-brain-refresh.job.ts
import type { PrismaClient } from "@prisma/client";
import type { SkillRegistry } from "../config/skills/loader";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { buildSkillContext } from "../utils/skill-context-builder";

interface BrandBrainRefreshJobData {
	brandId: string;
	workspaceId: string;
	userId: string;
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CONTEXT_CHARS = 10_000;

export class BrandBrainRefreshJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
		private skillRegistry: SkillRegistry,
	) {}

	async handle(data: BrandBrainRefreshJobData): Promise<void> {
		const { brandId, workspaceId, userId } = data;
		try {
			// 1. Fetch brand
			const brand = await this.prisma.brand.findUnique({
				where: { id: brandId },
				select: { websiteUrl: true, language: true },
			});
			if (!brand) {
				this.logger.warn("BrandBrainRefreshJob: brand not found, skipping", { brandId });
				return;
			}

			// 2. Load all completed brand-level document chunks (skip product-only docs)
			const docs = await this.prisma.brandDocument.findMany({
				where: { brandId, productId: null, extractionStatus: "completed" },
				include: { chunks: { orderBy: { chunkIndex: "asc" } } },
			});

			// 3. Build merged context — skip image types, cap at MAX_CONTEXT_CHARS
			let mergedContext = "";
			outer: for (const doc of docs) {
				if (IMAGE_TYPES.has(doc.fileType ?? "")) continue;
				for (const chunk of doc.chunks) {
					if (mergedContext.length >= MAX_CONTEXT_CHARS) break outer;
					mergedContext += chunk.contentText + "\n";
				}
			}
			mergedContext = mergedContext.slice(0, MAX_CONTEXT_CHARS);

			// 4. Exit early if nothing to analyze
			if (!mergedContext.trim() && !brand.websiteUrl) {
				this.logger.info("BrandBrainRefreshJob: no content to analyze, skipping", { brandId });
				return;
			}

			// 5. Build skill context
			const skillResult = buildSkillContext(this.skillRegistry, "brandBrain");

			// 6. Call AI scraper with merged context and optional website URL
			const brandScraper = await this.aiFactory.getBrandScraper(workspaceId);
			const scraped = await brandScraper.scrape({
				...(mergedContext.trim() ? { fileText: mergedContext } : {}),
				...(brand.websiteUrl ? { url: brand.websiteUrl } : {}),
				language: brand.language ?? undefined,
				skillContext: skillResult.context,
			});

			// 7. Determine next version and deactivate current
			const latest = await this.prisma.brandBrainVersion.findFirst({
				where: { brandId },
				orderBy: { version: "desc" },
			});
			const nextVersion = (latest?.version ?? 0) + 1;
			await this.prisma.brandBrainVersion.updateMany({
				where: { brandId, isActive: true },
				data: { isActive: false },
			});

			// 8. Build messaging rules and create new brain version
			const messagingRules: Record<string, string[]> = {};
			if (scraped.dos?.length) messagingRules.do = scraped.dos;
			if (scraped.donts?.length) messagingRules.dont = scraped.donts;

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

			// 9. Notify user via SSE
			this.notificationService.notify(userId, {
				type: "brand_brain_updated",
				data: { brandId, version: nextVersion },
			});

			this.logger.info("BrandBrainRefreshJob completed", { brandId, version: nextVersion });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("BrandBrainRefreshJob failed", { brandId, error: message });
			// No error notification — brain stays on current version silently
		}
	}
}
