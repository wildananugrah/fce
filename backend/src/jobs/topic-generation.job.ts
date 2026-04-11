import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildTopicGenerationPrompt } from "../utils/prompt-builder";

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
			// Build brand context
			let brandContext = "{}";
			if (brandId) {
				const brand = await this.prisma.brand.findUnique({
					where: { id: brandId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				brandContext = brand?.brainVersions[0]
					? JSON.stringify(brand.brainVersions[0])
					: JSON.stringify({ name: brand?.name });
			}

			// Build product contexts (multiple)
			const productContexts: string[] = [];
			if (productIds && productIds.length > 0) {
				for (const pid of productIds) {
					const product = await this.prisma.product.findUnique({
						where: { id: pid },
						include: { brainVersions: { where: { isActive: true }, take: 1 } },
					});
					if (product?.brainVersions[0]) {
						productContexts.push(JSON.stringify(product.brainVersions[0]));
					} else if (product) {
						productContexts.push(JSON.stringify({ name: product.name }));
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
			const skillMappings = await this.prisma.workspaceSkillMapping.findMany({
				where: { workspaceId, generator: "topic", isActive: true },
				include: { skill: true },
			});
			const skillContext = skillMappings
				.map((m) => {
					let ctx = m.skill.content;
					if (m.skill.referenceFiles) {
						const refs = m.skill.referenceFiles as { name: string; content: string }[];
						ctx += "\n\n" + refs.map((r) => `## Reference: ${r.name}\n${r.content}`).join("\n\n");
					}
					return `### Skill: ${m.skill.name}\n${ctx}`;
				})
				.join("\n\n---\n\n");

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
					skillIds: skillMappings.map((m) => m.skill.id),
					skillNames: skillMappings.map((m) => m.skill.name),
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
