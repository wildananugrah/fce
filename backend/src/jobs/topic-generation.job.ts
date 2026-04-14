import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildTopicGenerationPrompt } from "../utils/prompt-builder";
import { buildSkillContext } from "../utils/skill-context-builder";

interface TopicJobData {
	workspaceId: string;
	brandId?: string;
	productIds?: string[];
	platform?: string;
	objective?: string;
	formats?: string[];
	dateFrom?: string;
	dateTo?: string;
	count: number;
	userId: string;
	prompt?: string;
	referenceImages?: string[];
}

export class TopicGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private topicGenerator: ITopicGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TopicJobData): Promise<void> {
		const {
			workspaceId,
			brandId,
			productIds,
			platform,
			objective,
			formats,
			dateFrom,
			dateTo,
			count,
			userId,
			prompt,
			referenceImages,
		} = data;

		try {
			// Build brand context — split queries to avoid Prisma 7 WASM
			// "Out of bounds memory access" bug with nested includes
			let brandContext = "{}";
			if (brandId) {
				try {
					const brandBasic = await this.prisma.brand.findUnique({
						where: { id: brandId },
						select: { name: true },
					});
					const activeBrainVersion = await this.prisma.brandBrainVersion.findFirst({
						where: { brandId, isActive: true },
					});
					brandContext = activeBrainVersion
						? JSON.stringify(activeBrainVersion)
						: JSON.stringify({ name: brandBasic?.name ?? "Unknown Brand" });
				} catch (err) {
					this.logger.warn("Failed to load brand brain version, falling back to name only", {
						brandId,
						error: err instanceof Error ? err.message : String(err),
					});
					const brandBasic = await this.prisma.brand.findUnique({
						where: { id: brandId },
						select: { name: true },
					});
					brandContext = JSON.stringify({ name: brandBasic?.name ?? "Unknown Brand" });
				}
			}

			// Build product contexts — split queries to avoid Prisma 7 WASM bug
			const productContexts: string[] = [];
			if (productIds && productIds.length > 0) {
				for (const pid of productIds) {
					try {
						const productBasic = await this.prisma.product.findUnique({
							where: { id: pid },
							select: { name: true },
						});
						const activeProductBrain = await this.prisma.productBrainVersion.findFirst({
							where: { productId: pid, isActive: true },
						});
						if (activeProductBrain) {
							productContexts.push(JSON.stringify(activeProductBrain));
						} else if (productBasic) {
							productContexts.push(JSON.stringify({ name: productBasic.name }));
						}
					} catch (err) {
						this.logger.warn("Failed to load product brain version, falling back to name only", {
							productId: pid,
							error: err instanceof Error ? err.message : String(err),
						});
						const productBasic = await this.prisma.product.findUnique({
							where: { id: pid },
							select: { name: true },
						});
						if (productBasic) {
							productContexts.push(JSON.stringify({ name: productBasic.name }));
						}
					}
				}
			}

			// Fetch product reference content
			let productReferenceContext = "";
			const productReferenceImages: string[] = [];
			const allProductIds = productIds && productIds.length > 0 ? productIds : [];
			if (allProductIds.length > 0) {
				const MAX_REFERENCE_CHARS = 5000;
				let charCount = 0;

				for (const pid of allProductIds) {
					const docs = await this.prisma.brandDocument.findMany({
						where: { productId: pid },
						include: { chunks: { orderBy: { chunkIndex: "asc" } } },
					});

					for (const doc of docs) {
						if (doc.sourceType === "image" || doc.fileType.startsWith("image/")) {
							productReferenceImages.push(doc.fileUrl);
							continue;
						}

						for (const chunk of doc.chunks) {
							if (charCount >= MAX_REFERENCE_CHARS) break;
							const remaining = MAX_REFERENCE_CHARS - charCount;
							const text = chunk.contentText.slice(0, remaining);
							productReferenceContext += text + "\n";
							charCount += text.length;
						}
					}
				}
			}

			// Fetch mapped AI skills for topic generator
			// Uses character-limited helper that excludes reference files to
			// prevent prompt bloat when many skills are mapped.
			const skillResult = await buildSkillContext(this.prisma, workspaceId, "topic");
			const skillContext = skillResult.context;
			if (skillResult.truncatedCount > 0) {
				this.logger.info("Some skills were truncated due to context limit", {
					workspaceId,
					includedCount: skillResult.includedCount,
					truncatedCount: skillResult.truncatedCount,
				});
			}

			// Build generation input
			const generationInput = {
				brandContext,
				productContexts: productContexts.length > 0 ? productContexts : undefined,
				skillContext: skillContext || undefined,
				platform,
				objective,
				formats,
				dateFrom,
				dateTo,
				count,
				prompt,
				referenceImages,
			};

			// Inject product reference content into generation input
			if (productReferenceContext) {
				const contextArray = generationInput.productContexts ?? [];
				contextArray.push(`Product reference materials:\n${productReferenceContext}`);
				generationInput.productContexts = contextArray;
				this.logger.info("Product references injected into topic generation", {
					workspaceId,
					charCount: productReferenceContext.length,
					imageCount: productReferenceImages.length,
				});
			}

			const allRefImages = [...(referenceImages ?? []), ...productReferenceImages];
			if (allRefImages.length > 0) {
				generationInput.referenceImages = allRefImages;
			}

			// Get prompts for logging
			const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(generationInput);

			// Generate topics with timing
			const startTime = Date.now();
			const output = await this.topicGenerator.generate(generationInput);
			const durationMs = Date.now() - startTime;
			const usage = (this.topicGenerator as any).lastUsage;

			// Log AI activity
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "topic",
					provider: process.env.AI_TOPIC_PROVIDER || process.env.AI_PROVIDER || "unknown",
					userId,
					systemPrompt,
					userPrompt,
					brandId: brandId ?? undefined,
					productId: productIds?.[0] ?? undefined,
					platform: platform ?? undefined,
					skillIds: skillResult.skillIds,
					skillNames: skillResult.skillNames,
				},
				{
					responseJson: output,
					durationMs,
					status: "success",
					inputTokens: usage?.inputTokens,
					outputTokens: usage?.outputTokens,
				},
			);

			// Create ContentTopic records for each generated topic
			await Promise.all(
				output.topics.map((topic) =>
					this.prisma.contentTopic.create({
						data: {
							workspaceId,
							brandId: brandId ?? null,
							title: topic.title,
							description: topic.description,
							pillar: topic.pillar ?? null,
							platform: topic.platform ?? platform ?? null,
							format: topic.format ?? null,
							objective: topic.objective ?? null,
							publishDate: topic.publishDate ? new Date(topic.publishDate) : null,
							status: "draft",
							products:
								productIds && productIds.length > 0
									? { create: productIds.map((productId) => ({ productId })) }
									: undefined,
						},
					}),
				),
			);

			// Notify via SSE
			this.notificationService.notify(userId, {
				type: "topic_generation_complete",
				data: { workspaceId, count: output.topics.length, status: "completed" },
			});

			this.logger.info("Topic generation completed", { workspaceId, count: output.topics.length });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Topic generation failed", { workspaceId, error: message });

			this.notificationService.notify(userId, {
				type: "topic_generation_failed",
				data: { workspaceId, status: "failed", error: message },
			});
		}
	}
}
