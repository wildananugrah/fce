import type { PrismaClient } from "@prisma/client";
import type { SkillRegistry } from "../config/skills/loader";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { IUrlInspirationService } from "../interfaces/services/url-inspiration.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";
import { isGenerationCancelled } from "../utils/generation-cancellation";
import { buildContentGenerationPrompt } from "../utils/prompt-builder";
import { buildSkillContext } from "../utils/skill-context-builder";

interface ContentJobData {
	requestId: string;
	productIds?: string[];
	userId: string;
	referenceImages?: string[];
	researchContext?: string;
	pillars?: string[];
}

export class ContentGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private notificationService: INotificationService,
		private logger: ILogger,
		private outputSectionRepository?: IOutputSectionRepository,
		private urlInspirationService?: IUrlInspirationService,
		private skillRegistry?: SkillRegistry,
	) {}

	async handle(data: ContentJobData): Promise<void> {
		const { requestId, productIds, userId, referenceImages, researchContext, pillars } = data;

		try {
			// Cancellation checkpoint #1 — user may have cancelled before the
			// worker picked the job up. Check before we flip to "processing"
			// (which would otherwise overwrite the "cancelled" status).
			if (await isGenerationCancelled(this.prisma, requestId)) {
				this.logger.info("content-generation: cancelled by user", { requestId, userId });
				return;
			}

			// Update status to processing
			const request = await this.prisma.generationRequest.update({
				where: { id: requestId },
				data: { status: "processing" },
			});

			// Build brand context — split queries to avoid Prisma 7 WASM bug
			let brand: any = null;
			try {
				const brandBasic = await this.prisma.brand.findUnique({
					where: { id: request.brandId },
					select: { name: true },
				});
				const activeBrain = await this.prisma.brandBrainVersion.findFirst({
					where: { brandId: request.brandId, isActive: true },
				});
				brand = { ...brandBasic, brainVersions: activeBrain ? [activeBrain] : [] };
			} catch (err) {
				this.logger.warn("Failed to load brand brain version, falling back to name only", {
					brandId: request.brandId,
					error: err instanceof Error ? err.message : String(err),
				});
				const brandBasic = await this.prisma.brand.findUnique({
					where: { id: request.brandId },
					select: { name: true },
				});
				brand = { ...brandBasic, brainVersions: [] };
			}

			// Build product contexts (multiple)
			let productContext: string | undefined;
			const resolvedProductIds =
				productIds && productIds.length > 0
					? productIds
					: request.productId
						? [request.productId]
						: [];

			// Split queries to avoid Prisma 7 WASM "Out of bounds memory access" bug
			const fetchProductSafely = async (pid: string) => {
				try {
					const basic = await this.prisma.product.findUnique({
						where: { id: pid },
						select: { name: true },
					});
					const activeBrain = await this.prisma.productBrainVersion.findFirst({
						where: { productId: pid, isActive: true },
					});
					return basic ? { ...basic, brainVersions: activeBrain ? [activeBrain] : [] } : null;
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
						contexts.push(
							`Product "${(product as any).name}":\n${JSON.stringify(product.brainVersions[0])}`,
						);
					} else if (product) {
						contexts.push(
							`Product "${(product as any).name}":\n${JSON.stringify({ name: (product as any).name })}`,
						);
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
			// Uses character-limited helper that excludes reference files to
			// prevent prompt bloat when many skills are mapped.
			const skillResult = buildSkillContext(this.skillRegistry ?? new Map(), "content");
			const skillContext = skillResult.context;
			if (skillResult.truncatedCount > 0) {
				this.logger.info("Some skills were truncated due to context limit", {
					workspaceId: request.workspaceId,
					includedCount: skillResult.includedCount,
					truncatedCount: skillResult.truncatedCount,
				});
			}

			// Get URL inspirations via Apify + Gemini summarizer
			let enrichedPrompt: string | undefined = request.prompt ?? undefined;
			if (this.urlInspirationService) {
				const inspirations = await this.urlInspirationService.enrichInspirationsFromPrompt(
					request.workspaceId,
					request.prompt,
					userId,
				);
				const successfulInspirations = inspirations.filter((i) => i.summary !== null);
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
					enrichedPrompt = `${request.prompt ?? ""}\n\n=== REFERENCE INSPIRATION ===\n${block}\n\nIMPORTANT: Use the reference inspiration above as direct creative direction. Derive topic angles, themes, and claims from it. At least half of the generated topics should clearly reflect the reference content — not copy it, but build on its angle, tone, or themes for this brand.`;
					this.logger.info("URL inspirations injected into content generation", {
						workspaceId: request.workspaceId,
						count: successfulInspirations.length,
					});
				}
			}

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
				prompt: enrichedPrompt,
				referenceImages,
				pillars,
			};

			// Inject research context (from "Use as Inspiration")
			if (researchContext) {
				generationInput.researchContext = researchContext;
				this.logger.info("Research context injected into content generation", {
					requestId,
					charCount: researchContext.length,
				});
			}

			// Inject product reference content into generation input
			if (productReferenceContext) {
				generationInput.productContext =
					(generationInput.productContext ?? "") +
					`\n\nProduct reference materials:\n${productReferenceContext}`;
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

			// Cancellation checkpoint #2 — last chance before the (expensive,
			// uncancellable) AI provider call.
			if (await isGenerationCancelled(this.prisma, requestId)) {
				this.logger.info("content-generation: cancelled by user", { requestId, userId });
				return;
			}

			// Generate content with timing
			const contentGenerator = await this.aiFactory.getContentGenerator(request.workspaceId);
			const startTime = Date.now();
			const output = await contentGenerator.generate(generationInput);
			const durationMs = Date.now() - startTime;
			const usage = (contentGenerator as any).lastUsage;

			// Cancellation checkpoint #3 — AI call returned but user cancelled
			// while it was running. Skip writing GenerationOutput / sections /
			// notifications so the user's cancel intent is honored.
			if (await isGenerationCancelled(this.prisma, requestId)) {
				this.logger.info("content-generation: cancelled by user", { requestId, userId });
				return;
			}

			// Log AI activity
			await logAiActivity(
				this.prisma,
				{
					workspaceId: request.workspaceId,
					generator: "content",
					provider: (await this.aiFactory.getSettings(request.workspaceId)).providers.content,
					requestId: request.id,
					userId,
					systemPrompt,
					userPrompt,
					brandId: request.brandId,
					productId: request.productId ?? undefined,
					platform: request.platform,
					contentType: request.contentType,
					skillSlugs: skillResult.skillSlugs,
					skillNames: skillResult.skillNames,
				},
				{
					responseJson: output.content,
					durationMs,
					status: "success",
					inputTokens: usage?.inputTokens,
					outputTokens: usage?.outputTokens,
				},
			);

			// Save output. "generated" means the AI finished but the human hasn't
			// reviewed or pushed it to the Library yet — the Content Generator
			// list keys off this status so items vanish once the user clicks
			// Send to Library (which flips the output to "draft" inside Library).
			const savedOutput = await this.prisma.generationOutput.create({
				data: {
					requestId,
					contentTitle: output.contentTitle,
					content: output.content as any,
					status: "generated",
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

			this.logger.info("Content generation completed", { requestId, userId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Content generation failed", { requestId, userId, error: message });

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

		if (result.caption || result.mainCopy || result.body || result.content) {
			const caption = result.caption || result.mainCopy || result.body || result.content;
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

		// ─── Post image (single-image formats: single_image, single_post,
		// feed_post, story_image). One image per post, populated lazily when
		// the user clicks "Generate image". Only emit if there are no
		// multi-part outputs (slides/scenes/frames) to avoid duplication.
		const hasMultipart =
			Array.isArray(result.slides) ||
			Array.isArray(result.scenes) ||
			Array.isArray(result.frames);
		if (!hasMultipart) {
			const prompt =
				(typeof result.visualDirection === "string" ? result.visualDirection : "") ||
				(typeof result.visual === "string" ? result.visual : "") ||
				"";
			sections.push({
				sectionType: "post_image",
				sectionOrder: order++,
				contentText: JSON.stringify({
					prompt,
					referenceImageUrl: "",
				}),
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
						referenceImageUrl: "",
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
						timeRange: scene.timeRange ?? "",
						visualDirection: scene.visualDirection ?? "",
						voiceover: scene.voiceover ?? "",
						onScreenText: scene.onScreenText ?? "",
						visualReference: scene.visualReference ?? "",
						referenceImageUrl: scene.referenceImageUrl ?? "",
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
						referenceImageUrl: "",
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
