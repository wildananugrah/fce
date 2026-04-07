import type { PrismaClient } from "@prisma/client";
import type { IContentGenerator } from "../interfaces/providers/content-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface ContentJobData {
	requestId: string;
	userId: string;
}

export class ContentGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private contentGenerator: IContentGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
		private outputSectionRepository?: IOutputSectionRepository,
	) {}

	async handle(data: ContentJobData): Promise<void> {
		const { requestId, userId } = data;

		try {
			// Update status to processing
			const request = await this.prisma.generationRequest.update({
				where: { id: requestId },
				data: { status: "processing" },
			});

			// Build brand context
			const brand = await this.prisma.brand.findUnique({
				where: { id: request.brandId },
				include: { brainVersions: { where: { isActive: true }, take: 1 } },
			});

			let productContext: string | undefined;
			if (request.productId) {
				const product = await this.prisma.product.findUnique({
					where: { id: request.productId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				if (product?.brainVersions[0]) {
					productContext = JSON.stringify(product.brainVersions[0]);
				}
			}

			const brandContext = brand?.brainVersions[0]
				? JSON.stringify(brand.brainVersions[0])
				: JSON.stringify({ name: brand?.name });

			// Generate content
			const output = await this.contentGenerator.generate({
				brandContext,
				productContext,
				platform: request.platform,
				contentType: request.contentType,
				framework: request.framework,
				hookType: request.hookType,
				language: request.language,
				prompt: request.prompt ?? undefined,
			});

			// Save output
			const savedOutput = await this.prisma.generationOutput.create({
				data: {
					requestId,
					contentTitle: output.contentTitle,
					content: output.content as any,
					status: "draft",
				},
			});

			// Parse and save output sections if repository is available
			if (this.outputSectionRepository) {
				const sections = this.parseOutputToSections(output.content);
				if (sections.length > 0) {
					await this.outputSectionRepository.createMany(savedOutput.id, sections);
				}
			}

			// Update request status
			await this.prisma.generationRequest.update({
				where: { id: requestId },
				data: { status: "completed" },
			});

			// Notify via SSE
			this.notificationService.notify(userId, {
				type: "generation_complete",
				data: { requestId, status: "completed" },
			});

			this.logger.info("Content generation completed", { requestId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Content generation failed", { requestId, error: message });

			await this.prisma.generationRequest.update({
				where: { id: requestId },
				data: { status: "failed", errorMessage: message },
			});

			this.notificationService.notify(userId, {
				type: "generation_failed",
				data: { requestId, status: "failed", error: message },
			});
		}
	}

	private parseOutputToSections(result: any) {
		const sections: { sectionType: string; sectionOrder: number; contentText: string }[] = [];
		let order = 0;

		if (result.hooks || result.hook) {
			const hooks = result.hooks || [result.hook];
			const hookArray = Array.isArray(hooks) ? hooks : [hooks];
			for (const hook of hookArray) {
				sections.push({
					sectionType: "hook",
					sectionOrder: order++,
					contentText: typeof hook === "string" ? hook : JSON.stringify(hook),
				});
			}
		}

		if (result.caption || result.mainCopy || result.content) {
			const caption = result.caption || result.mainCopy || result.content;
			sections.push({
				sectionType: "caption",
				sectionOrder: order++,
				contentText: typeof caption === "string" ? caption : JSON.stringify(caption),
			});
		}

		if (result.cta || result.callToAction) {
			const cta = result.cta || result.callToAction;
			const ctaArray = Array.isArray(cta) ? cta : [cta];
			for (const c of ctaArray) {
				sections.push({
					sectionType: "cta",
					sectionOrder: order++,
					contentText: typeof c === "string" ? c : JSON.stringify(c),
				});
			}
		}

		if (result.hashtags) {
			sections.push({
				sectionType: "hashtag",
				sectionOrder: order++,
				contentText: Array.isArray(result.hashtags)
					? result.hashtags.join(" ")
					: result.hashtags,
			});
		}

		if (result.visualDirection) {
			sections.push({
				sectionType: "visual_direction",
				sectionOrder: order++,
				contentText:
					typeof result.visualDirection === "string"
						? result.visualDirection
						: JSON.stringify(result.visualDirection),
			});
		}

		if (result.rationale) {
			sections.push({
				sectionType: "rationale",
				sectionOrder: order++,
				contentText: result.rationale,
			});
		}

		return sections;
	}
}
