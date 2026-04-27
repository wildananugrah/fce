import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { IUrlInspirationService } from "../interfaces/services/url-inspiration.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
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
	pillars?: string[];
	language?: string;
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
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
		private urlInspirationService: IUrlInspirationService,
	) {}

	async handle(data: TopicJobData): Promise<void> {
		const {
			workspaceId,
			brandId,
			productIds,
			platform,
			objective,
			formats,
			pillars,
			language,
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

			// Get URL inspirations via Apify + Gemini summarizer
			const inspirations = await this.urlInspirationService.enrichInspirationsFromPrompt(
				workspaceId,
				prompt,
				userId,
			);
			const successfulInspirations = inspirations.filter((i) => i.summary !== null);
			let enrichedPrompt = prompt;
			if (successfulInspirations.length > 0) {
				const block = successfulInspirations
					.map((i) => {
						const s = i.summary!;
						const parts = [
							`Reference from ${i.url} (${i.kind}):`,
							`- Angle: ${s.angle}`,
							`- Tone: ${s.tone}`,
							`- Key points: ${s.keyPoints.join("; ")}`,
							`- Format: ${s.format}`,
						];
						if (s.hashtags?.length) parts.push(`- Hashtags: ${s.hashtags.join(" ")}`);
						if (s.engagementSignal) parts.push(`- Engagement: ${s.engagementSignal}`);
						return parts.join("\n");
					})
					.join("\n\n---\n\n");
				enrichedPrompt = `${prompt ?? ""}\n\n=== REFERENCE INSPIRATION ===\n${block}\n\nIMPORTANT: Use the reference inspiration above as direct creative direction. Derive topic angles, themes, and claims from it. At least half of the generated topics should clearly reflect the reference content — not copy it, but build on its angle, tone, or themes for this brand.`;
				this.logger.info("URL inspirations injected into topic generation", {
					workspaceId,
					count: successfulInspirations.length,
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
				pillars,
				language,
				dateFrom,
				dateTo,
				count,
				prompt: enrichedPrompt,
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
			const topicGenerator = await this.aiFactory.getTopicGenerator(workspaceId);
			const startTime = Date.now();
			const output = await topicGenerator.generate(generationInput);
			const durationMs = Date.now() - startTime;
			const usage = (topicGenerator as any).lastUsage;

			// Log AI activity
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "topic",
					provider: (await this.aiFactory.getSettings(workspaceId)).providers.topic,
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
