import type { PrismaClient } from "@prisma/client";
import type { IContentGenerator } from "../interfaces/providers/content-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildContentGenerationPrompt } from "../utils/prompt-builder";

interface ContentJobData {
	requestId: string;
	productIds?: string[];
	userId: string;
	referenceImages?: string[];
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
		const { requestId, productIds, userId, referenceImages } = data;

		try {
			// Update status to processing
			const request = await this.prisma.generationRequest.update({
				where: { id: requestId },
				data: { status: "processing" },
			});

			// Build brand context (with fallback if brain version has corrupted data)
			let brand: any = null;
			try {
				brand = await this.prisma.brand.findUnique({
					where: { id: request.brandId },
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
			} catch (err) {
				this.logger.warn("Failed to load brand brain version, falling back to name only", {
					brandId: request.brandId,
					error: err instanceof Error ? err.message : String(err),
				});
				brand = await this.prisma.brand.findUnique({
					where: { id: request.brandId },
					select: { name: true },
				});
				brand = { ...brand, brainVersions: [] };
			}

			// Build product contexts (multiple)
			let productContext: string | undefined;
			const resolvedProductIds = productIds && productIds.length > 0
				? productIds
				: request.productId ? [request.productId] : [];

			const fetchProductSafely = async (pid: string) => {
				try {
					return await this.prisma.product.findUnique({
						where: { id: pid },
						include: { brainVersions: { where: { isActive: true }, take: 1 } },
					});
				} catch (err) {
					this.logger.warn("Failed to load product brain version, falling back to name only", {
						productId: pid,
						error: err instanceof Error ? err.message : String(err),
					});
					const basic = await this.prisma.product.findUnique({
						where: { id: pid },
						select: { name: true },
					});
					return basic ? { ...basic, brainVersions: [] } : null;
				}
			};

			if (resolvedProductIds.length === 1) {
				// Single product — keep original behavior
				const product = await fetchProductSafely(resolvedProductIds[0]);
				if (product?.brainVersions[0]) {
					productContext = JSON.stringify(product.brainVersions[0]);
				} else if (product) {
					productContext = JSON.stringify({ name: (product as any).name });
				}
			} else if (resolvedProductIds.length > 1) {
				// Multiple products — concatenate contexts
				const contexts: string[] = [];
				for (const pid of resolvedProductIds) {
					const product = await fetchProductSafely(pid);
					if (product?.brainVersions[0]) {
						contexts.push(`Product "${(product as any).name}":\n${JSON.stringify(product.brainVersions[0])}`);
					} else if (product) {
						contexts.push(`Product "${(product as any).name}":\n${JSON.stringify({ name: (product as any).name })}`);
					}
				}
				if (contexts.length > 0) {
					productContext = contexts.join("\n\n");
				}
			}

			const brandContext = brand?.brainVersions[0]
				? JSON.stringify(brand.brainVersions[0])
				: JSON.stringify({ name: brand?.name });

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

			// Fetch mapped AI skills for content generator
			const skillMappings = await this.prisma.workspaceSkillMapping.findMany({
				where: { workspaceId: request.workspaceId, generator: "content", isActive: true },
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
				productContext,
				skillContext: skillContext || undefined,
				platform: request.platform,
				contentType: request.contentType,
				framework: request.framework,
				hookType: request.hookType,
				language: request.language,
				prompt: request.prompt ?? undefined,
				referenceImages,
			};

			// Inject product reference content into generation input
			if (productReferenceContext) {
				generationInput.productContext = (generationInput.productContext ?? "") + `\n\nProduct reference materials:\n${productReferenceContext}`;
				this.logger.info("Product references injected into content generation", {
					requestId,
					charCount: productReferenceContext.length,
					imageCount: productReferenceImages.length,
				});
			}

			const allRefImages = [...(referenceImages ?? []), ...productReferenceImages];
			if (allRefImages.length > 0) {
				generationInput.referenceImages = allRefImages;
			}

			// Get prompts for logging
			const { systemPrompt, userPrompt } = buildContentGenerationPrompt(generationInput);

			// Generate content with timing
			const startTime = Date.now();
			const output = await this.contentGenerator.generate(generationInput);
			const durationMs = Date.now() - startTime;
			const usage = (this.contentGenerator as any).lastUsage;

			// Log AI activity
			await logAiActivity(
				this.prisma,
				{
					workspaceId: request.workspaceId,
					generator: "content",
					provider: process.env.AI_CONTENT_PROVIDER || process.env.AI_PROVIDER || "unknown",
					requestId: request.id,
					userId,
					systemPrompt,
					userPrompt,
					brandId: request.brandId,
					productId: request.productId ?? undefined,
					platform: request.platform,
					contentType: request.contentType,
					skillIds: skillMappings.map((m) => m.skill.id),
					skillNames: skillMappings.map((m) => m.skill.name),
				},
				{
					responseJson: output.content,
					durationMs,
					status: "success",
					inputTokens: usage?.inputTokens,
					outputTokens: usage?.outputTokens,
				},
			);

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

		// ─── Top-level fields (single_image, single_post, single_tweet, feed_post, article) ───
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
				contentText: Array.isArray(result.hashtags) ? result.hashtags.join(" ") : result.hashtags,
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

		// ─── Slides (carousel, carousel_post, carousel_ad, tiktok_carousel, thread) ───
		if (Array.isArray(result.slides)) {
			for (let i = 0; i < result.slides.length; i++) {
				const slide = result.slides[i];
				sections.push({
					sectionType: "slide",
					sectionOrder: order++,
					contentText: JSON.stringify({
						slideNumber: i + 1,
						headline: slide.headline ?? "",
						body: slide.body ?? "",
						visualDirection: slide.visualDirection ?? "",
					}),
				});
			}
		}

		// ─── Scenes (reels, tiktok_video, long_video, youtube_shorts, video_tweet, linkedin_video, reel_short_video) ───
		if (Array.isArray(result.scenes)) {
			for (let i = 0; i < result.scenes.length; i++) {
				const scene = result.scenes[i];
				sections.push({
					sectionType: "scene",
					sectionOrder: order++,
					contentText: JSON.stringify({
						sceneNumber: i + 1,
						visualDirection: scene.visualDirection ?? "",
						voiceover: scene.voiceover ?? "",
						onScreenText: scene.onScreenText ?? "",
					}),
				});
			}
		}

		// ─── Frames (story_image, story_video, story) ───
		if (Array.isArray(result.frames)) {
			for (let i = 0; i < result.frames.length; i++) {
				const frame = result.frames[i];
				sections.push({
					sectionType: "frame",
					sectionOrder: order++,
					contentText: JSON.stringify({
						frameNumber: i + 1,
						visual: frame.visual ?? "",
						textOverlay: frame.textOverlay ?? "",
					}),
				});
			}
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
