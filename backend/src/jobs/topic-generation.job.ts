import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface TopicJobData {
	workspaceId: string;
	brandId?: string;
	productId?: string;
	platform?: string;
	objective?: string;
	dateFrom?: string;
	dateTo?: string;
	count: number;
	userId: string;
}

export class TopicGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private topicGenerator: ITopicGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: TopicJobData): Promise<void> {
		const { workspaceId, brandId, productId, platform, objective, dateFrom, dateTo, count, userId } = data;

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

			// Build product context
			let productContext: string | undefined;
			if (productId) {
				const product = await this.prisma.product.findUnique({
					where: { id: productId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				if (product?.brainVersions[0]) {
					productContext = JSON.stringify(product.brainVersions[0]);
				}
			}

			// Generate topics
			const output = await this.topicGenerator.generate({
				brandContext,
				productContext,
				platform,
				objective,
				dateFrom,
				dateTo,
				count,
			});

			// Create ContentTopic records for each generated topic
			await Promise.all(
				output.topics.map((topic) =>
					this.prisma.contentTopic.create({
						data: {
							workspaceId,
							brandId: brandId ?? null,
							productId: productId ?? null,
							title: topic.title,
							description: topic.description,
							pillar: topic.pillar ?? null,
							platform: topic.platform ?? platform ?? null,
							format: topic.format ?? null,
							objective: topic.objective ?? null,
							publishDate: topic.publishDate ? new Date(topic.publishDate) : null,
							status: "draft",
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
