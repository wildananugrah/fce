import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";
import type { AiProviderFactory } from "./ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";

export interface SceneImageResult {
	sectionId: string;
	contentText: string;
	imageUrl: string;
}

export class SceneImageService {
	constructor(
		private prisma: PrismaClient,
		private aiFactory: AiProviderFactory,
		private storage: IStorageProvider,
		private bucket: string,
		private logger: ILogger,
	) {}

	// Ensures a post_image section exists for single-image content types,
	// then generates an image for it. Used to backfill older outputs that
	// were created before post_image sections were added.
	async ensureAndGenerateForPostImage(
		workspaceId: string,
		outputId: string,
		userId: string,
	): Promise<SceneImageResult> {
		const output = await this.prisma.generationOutput.findUnique({
			where: { id: outputId },
			select: {
				id: true,
				requestId: true,
				request: { select: { workspaceId: true } },
				sections: {
					select: { id: true, sectionType: true, sectionOrder: true, contentText: true },
					orderBy: { sectionOrder: "asc" },
				},
			},
		});
		if (!output || output.request.workspaceId !== workspaceId) {
			throw new Error("Output not in workspace");
		}

		let postImage = output.sections.find((s) => s.sectionType === "post_image");

		if (!postImage) {
			// Derive prompt from the existing visual_direction section text,
			// or fall back to a generic placeholder so Imagen has something.
			const visualDirection = output.sections.find((s) => s.sectionType === "visual_direction");
			const prompt = visualDirection?.contentText ?? "";
			const maxOrder = output.sections.reduce(
				(acc, s) => Math.max(acc, s.sectionOrder),
				-1,
			);
			postImage = await this.prisma.outputSection.create({
				data: {
					outputId,
					sectionType: "post_image",
					sectionOrder: maxOrder + 1,
					contentText: JSON.stringify({ prompt, referenceImageUrl: "" }),
				},
				select: { id: true, sectionType: true, sectionOrder: true, contentText: true },
			});
		}

		return this.generateForSection(workspaceId, outputId, postImage.id, userId);
	}

	async generateForSection(
		workspaceId: string,
		outputId: string,
		sectionId: string,
		userId: string,
	): Promise<SceneImageResult> {
		// 1. Load the section and verify ownership via its generation request.
		const section = await this.prisma.outputSection.findUnique({
			where: { id: sectionId },
		});
		if (!section || section.outputId !== outputId) {
			throw new Error("Section not found");
		}

		const output = await this.prisma.generationOutput.findUnique({
			where: { id: outputId },
			select: {
				id: true,
				requestId: true,
				request: {
					select: { workspaceId: true, brandId: true, productId: true, contentType: true },
				},
			},
		});
		if (!output || output.request.workspaceId !== workspaceId) {
			throw new Error("Output not in workspace");
		}

		// 2. Parse the section JSON and decide on an image prompt.
		// Sections for scenes/slides/frames/post_image are all JSON; the older
		// visual_direction section is a plain string — handle both.
		let data: Record<string, unknown>;
		try {
			const parsed = JSON.parse(section.contentText);
			data =
				parsed && typeof parsed === "object"
					? (parsed as Record<string, unknown>)
					: { text: section.contentText };
		} catch {
			data = { text: section.contentText };
		}

		const basePrompt =
			(data.visualReference as string) ||
			(data.visualDirection as string) ||
			(data.visual as string) ||
			(data.prompt as string) ||
			(data.text as string) ||
			(data.headline as string);
		if (!basePrompt) {
			throw new Error("Section has no visual reference or direction to base an image on");
		}

		const prompt = `${basePrompt}. Photorealistic, cinematic, high detail.`;

		// 3. Call Imagen (synchronous).
		const imageGenerator = await this.aiFactory.getImageProvider(workspaceId);
		if (!imageGenerator) {
			throw new Error(
				"No image-generation provider configured for this workspace. Set an API key in Workspace Settings → Integrations → AI Providers.",
			);
		}
		const startedAt = Date.now();
		try {
			const result = await imageGenerator.generate({ prompt, aspectRatio: "16:9" });
			const durationMs = Date.now() - startedAt;

			// 4. Upload to MinIO.
			const buffer = Buffer.from(result.imageBase64, "base64");
			const ext = result.mimeType.includes("jpeg") ? "jpg" : "png";
			const key = `scene-images/${outputId}/${sectionId}-${Date.now()}.${ext}`;
			const imageUrl = await this.storage.upload(this.bucket, key, buffer, result.mimeType);

			// 5. Persist the URL back into the section JSON.
			data.referenceImageUrl = imageUrl;
			const contentText = JSON.stringify(data);
			await this.prisma.outputSection.update({
				where: { id: sectionId },
				data: { contentText },
			});

			// 6. Log AI activity for token usage / dispute resolution.
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "image_generation",
					provider: "gemini",
					model: imageGenerator.model,
					requestId: output.requestId,
					userId,
					systemPrompt: "",
					userPrompt: prompt,
					brandId: output.request.brandId,
					productId: output.request.productId ?? undefined,
					contentType: output.request.contentType,
				},
				{
					responseText: imageUrl,
					durationMs,
					status: "success",
				},
			);

			this.logger.info("Scene image generated", {
				workspaceId,
				outputId,
				sectionId,
				durationMs,
			});

			return { sectionId, contentText, imageUrl };
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "image_generation",
					provider: "gemini",
					model: imageGenerator.model,
					requestId: output.requestId,
					userId,
					systemPrompt: "",
					userPrompt: prompt,
					brandId: output.request.brandId,
					productId: output.request.productId ?? undefined,
					contentType: output.request.contentType,
				},
				{
					durationMs: Date.now() - startedAt,
					status: "error",
					errorMessage: message,
				},
			);
			this.logger.error("Scene image generation failed", {
				workspaceId,
				outputId,
				sectionId,
				error: message,
			});
			throw err;
		}
	}
}
