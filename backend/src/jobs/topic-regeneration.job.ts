import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildTopicGenerationPrompt } from "../utils/prompt-builder";

interface TopicRegenJobData {
	workspaceId: string;
	topicId?: string;
	brandId?: string;
	productIds?: string[];
	platform?: string;
	format?: string;
	objective?: string;
	pillar?: string;
	language?: string;
	hint?: string;
	preview: boolean;
	userId: string;
}

export class TopicRegenerationJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TopicRegenJobData): Promise<void> {
		const {
			workspaceId,
			topicId,
			brandId,
			productIds,
			platform,
			format,
			objective,
			pillar,
			language,
			hint,
			preview,
			userId,
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

			// Build product contexts
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

			// Fetch existing topic title for reference (if saved topic)
			let existingTitle = "";
			let existingDescription = "";
			if (topicId) {
				const existing = await this.prisma.contentTopic.findUnique({ where: { id: topicId } });
				existingTitle = existing?.title ?? "";
				existingDescription = existing?.description ?? "";
			}

			// Build a single-topic generation prompt with hint
			const hintLine = hint ? `Additional guidance: ${hint}` : "";
			const existingLine = existingTitle
				? `Current topic for reference: "${existingTitle}" — "${existingDescription}". Generate a fresh, different idea.`
				: "";

			const generationInput = {
				brandContext,
				productContexts: productContexts.length > 0 ? productContexts : undefined,
				platform,
				objective,
				formats: format ? [format] : undefined,
				pillars: pillar ? [pillar] : undefined,
				language,
				count: 1,
			};

			const { systemPrompt, userPrompt: baseUserPrompt } =
				buildTopicGenerationPrompt(generationInput);
			const userPrompt = `${baseUserPrompt}\n${existingLine}\n${hintLine}`.trim();

			// Generate single topic
			const topicGenerator = await this.aiFactory.getTopicGenerator(workspaceId);
			const startTime = Date.now();
			const output = await topicGenerator.generate({
				...generationInput,
				count: 1,
			});
			const durationMs = Date.now() - startTime;

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
					skillIds: [],
					skillNames: [],
				},
				{
					responseJson: output,
					durationMs,
					status: "success",
				},
			);

			const newTopic = output.topics[0];
			if (!newTopic) {
				throw new Error("AI returned no topics");
			}

			if (preview) {
				// Preview mode: don't write to DB, just send topic data via SSE
				this.notificationService.notify(userId, {
					type: "topic_preview_regenerated",
					data: {
						workspaceId,
						topic: {
							title: newTopic.title,
							description: newTopic.description,
							pillar: newTopic.pillar,
							platform: newTopic.platform ?? platform,
							format: newTopic.format ?? format,
							objective: newTopic.objective ?? objective,
							publishDate: newTopic.publishDate,
						},
						status: "completed",
					},
				});
			} else {
				// Saved mode: update existing topic in place
				await this.prisma.contentTopic.update({
					where: { id: topicId },
					data: {
						title: newTopic.title,
						description: newTopic.description,
						pillar: newTopic.pillar ?? null,
						platform: newTopic.platform ?? platform ?? null,
						format: newTopic.format ?? format ?? null,
						objective: newTopic.objective ?? objective ?? null,
						publishDate: newTopic.publishDate ? new Date(newTopic.publishDate) : null,
					},
				});

				this.notificationService.notify(userId, {
					type: "topic_regenerated",
					data: { workspaceId, topicId, status: "completed" },
				});
			}

			this.logger.info("Topic regeneration completed", { workspaceId, topicId, preview });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Topic regeneration failed", { workspaceId, topicId, error: message });

			this.notificationService.notify(userId, {
				type: preview ? "topic_preview_regeneration_failed" : "topic_regeneration_failed",
				data: { workspaceId, topicId, status: "failed", error: message },
			});
		}
	}
}
