import type { PrismaClient } from "@prisma/client";
import type { ICampaignBriefSummarizer } from "../interfaces/providers/campaign-brief-summarizer.interface";
import type { ICampaignGenerator } from "../interfaces/providers/campaign-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import {
	buildBriefSummaryPrompt,
	buildCampaignGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../utils/prompt-builder";

interface CampaignPdfJobData {
	campaignId: string;
	userId: string;
}

type Stage = "extracting" | "summarizing" | "planning" | "topics";

export class CampaignPdfGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private briefSummarizer: ICampaignBriefSummarizer,
		private campaignGenerator: ICampaignGenerator,
		private topicGenerator: ITopicGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: CampaignPdfJobData): Promise<void> {
		const { campaignId, userId } = data;
		let currentStage: Stage = "extracting";

		try {
			// ── Load campaign + brief ─────────────────────────────────────
			const campaign = await this.prisma.campaign.findUnique({
				where: { id: campaignId },
				include: {
					briefs: { orderBy: { createdAt: "desc" }, take: 1 },
				},
			});
			if (!campaign) throw new Error("Campaign not found");
			const brief = campaign.briefs[0];
			if (!brief || !brief.documentUrl) {
				throw new Error("Campaign brief has no document URL");
			}

			const brandContext = await this.loadBrandContext(campaign.brandId);
			const productContext = await this.loadProductContext(campaign.productId);

			// ── Stage 1: Extract PDF text ─────────────────────────────────
			await this.setStage(campaignId, userId, "extracting");
			const extractedText = await this.extractPdfText(brief.documentUrl);

			// ── Stage 2: Summarize brief (placeholder — Task 11) ─────────
			currentStage = "summarizing";

			// ── Stage 3: Build campaign plan (placeholder — Task 12) ─────
			// currentStage = "planning";

			// ── Stage 4: Generate topics (placeholder — Task 13) ─────────
			// currentStage = "topics";

			// ── Completion ────────────────────────────────────────────────
			await this.prisma.campaign.update({
				where: { id: campaignId },
				data: { status: "completed", generationStage: null },
			});
			this.notificationService.notify(userId, {
				type: "campaign_pdf_complete",
				data: { campaignId, status: "completed" },
			});
			this.logger.info("Campaign PDF generation completed", { campaignId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Campaign PDF generation failed", {
				campaignId,
				stage: currentStage,
				error: message,
			});
			await this.prisma.campaign.update({
				where: { id: campaignId },
				data: {
					status: "failed",
					generationStage: currentStage,
					errorMessage: message,
				},
			});
			this.notificationService.notify(userId, {
				type: "campaign_pdf_failed",
				data: { campaignId, status: "failed", error: message, stage: currentStage },
			});
		}
	}

	private async setStage(campaignId: string, userId: string, stage: Stage): Promise<void> {
		await this.prisma.campaign.update({
			where: { id: campaignId },
			data: { generationStage: stage },
		});
		this.notificationService.notify(userId, {
			type: "campaign_pdf_progress",
			data: { campaignId, stage },
		});
	}

	private async loadBrandContext(brandId: string | null): Promise<string> {
		if (!brandId) return "{}";
		const brand = await this.prisma.brand.findUnique({
			where: { id: brandId },
			include: { brainVersions: { where: { isActive: true }, take: 1 } },
		});
		return brand?.brainVersions[0]
			? JSON.stringify(brand.brainVersions[0])
			: JSON.stringify({ name: brand?.name });
	}

	private async loadProductContext(productId: string | null): Promise<string | undefined> {
		if (!productId) return undefined;
		const product = await this.prisma.product.findUnique({
			where: { id: productId },
			include: { brainVersions: { where: { isActive: true }, take: 1 } },
		});
		if (!product) return undefined;
		return product.brainVersions[0]
			? JSON.stringify(product.brainVersions[0])
			: JSON.stringify({ name: product.name });
	}

	private async extractPdfText(url: string): Promise<string> {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Could not fetch PDF from ${url}: ${response.status}`);
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const { PDFParse } = await import("pdf-parse");
		const parser = new PDFParse({ data: new Uint8Array(buffer) });
		await parser.load();
		const result = await parser.getText();
		return result.text;
	}
}
