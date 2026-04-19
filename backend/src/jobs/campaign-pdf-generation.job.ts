import type { PrismaClient } from "@prisma/client";
import type { ICampaignBriefSummarizer } from "../interfaces/providers/campaign-brief-summarizer.interface";
import type { ICampaignGenerator } from "../interfaces/providers/campaign-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { ITopicGenerator } from "../interfaces/providers/topic-generator.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";
import { extractPdfText } from "../utils/pdf-extractor";
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
		private aiFactory: AiProviderFactory,
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
			const extractedText = await extractPdfText(brief.documentUrl);

			// ── Stage 2: Summarize brief ─────────────────────────────────
			currentStage = "summarizing";
			await this.setStage(campaignId, userId, "summarizing");

			const workspaceId = campaign.workspaceId;
			const settings = await this.aiFactory.getSettings(workspaceId);
			const summarizeStart = Date.now();
			const { systemPrompt: sumSys, userPrompt: sumUser } = buildBriefSummaryPrompt({
				extractedText,
				brandContext,
				productContext,
			});
			const briefSummarizer = await this.aiFactory.getBriefSummarizer(workspaceId);
			let summary: Awaited<ReturnType<ICampaignBriefSummarizer["summarizeBrief"]>>;
			try {
				summary = await briefSummarizer.summarizeBrief({
					extractedText,
					brandContext,
					productContext,
				});
				const usage = (briefSummarizer as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_brief_summary",
						provider: settings.providers.campaign,
						userId,
						systemPrompt: sumSys,
						userPrompt: sumUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						responseJson: summary,
						durationMs: Date.now() - summarizeStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			} catch (err) {
				const usage = (briefSummarizer as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_brief_summary",
						provider: settings.providers.campaign,
						userId,
						systemPrompt: sumSys,
						userPrompt: sumUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						durationMs: Date.now() - summarizeStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
				throw err;
			}

			// Persist summary to CampaignBrief and Campaign fields (only fill if empty)
			await this.prisma.campaignBrief.update({
				where: { id: brief.id },
				data: { documentSummary: summary.summary },
			});
			await this.prisma.campaign.update({
				where: { id: campaignId },
				data: {
					objective: campaign.objective || summary.objective || undefined,
					audienceSegment: campaign.audienceSegment || summary.audienceHint || undefined,
					keyMessage: campaign.keyMessage || summary.keyMessage || undefined,
					channelMix:
						campaign.channelMix ||
						(summary.channelHint.length > 0 ? (summary.channelHint as any) : undefined),
					durationStart:
						campaign.durationStart ||
						(summary.durationHint.start ? new Date(summary.durationHint.start) : undefined),
					durationEnd:
						campaign.durationEnd ||
						(summary.durationHint.end ? new Date(summary.durationHint.end) : undefined),
				},
			});

			// ── Stage 3: Build campaign plan ─────────────────────────────
			currentStage = "planning";
			await this.setStage(campaignId, userId, "planning");

			// Re-read the campaign so we get the freshly-applied Stage 2 hints.
			const refreshedCampaign = await this.prisma.campaign.findUnique({
				where: { id: campaignId },
			});
			if (!refreshedCampaign) throw new Error("Campaign disappeared mid-pipeline");

			const planInput = {
				brandContext: productContext
					? `${brandContext}\n\nProduct Context: ${productContext}`
					: brandContext,
				objective: refreshedCampaign.objective ?? undefined,
				budget: refreshedCampaign.budget ?? undefined,
				channelMix: refreshedCampaign.channelMix
					? (refreshedCampaign.channelMix as string[])
					: undefined,
				culturalContext: refreshedCampaign.culturalContext ?? undefined,
			};
			const { systemPrompt: planSys, userPrompt: planUser } =
				buildCampaignGenerationPrompt(planInput);

			const planStart = Date.now();
			const campaignGenerator = await this.aiFactory.getCampaignGenerator(workspaceId);
			let planOutput: Awaited<ReturnType<ICampaignGenerator["generate"]>>;
			try {
				planOutput = await campaignGenerator.generate(planInput);
				const usage = (campaignGenerator as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_plan",
						provider: settings.providers.campaign,
						userId,
						systemPrompt: planSys,
						userPrompt: planUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						responseJson: planOutput,
						durationMs: Date.now() - planStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			} catch (err) {
				const usage = (campaignGenerator as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_plan",
						provider: settings.providers.campaign,
						userId,
						systemPrompt: planSys,
						userPrompt: planUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						durationMs: Date.now() - planStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
				throw err;
			}

			await this.prisma.campaignOutput.create({
				data: {
					campaignId,
					bigIdea: planOutput.bigIdea,
					messagingPillars: planOutput.messagingPillars as any,
					funnelJourney: planOutput.funnelJourney as any,
					channelRoles: planOutput.channelRoles as any,
					status: "draft",
				},
			});

			// ── Stage 4: Generate topics ─────────────────────────────────
			currentStage = "topics";
			await this.setStage(campaignId, userId, "topics");

			const pillarsLine = Array.isArray(planOutput.messagingPillars)
				? planOutput.messagingPillars
						.map((p: any) => p.name ?? p.description ?? "")
						.filter(Boolean)
						.join(", ")
				: "";

			const topicPromptPrefix = [
				`Campaign big idea: ${planOutput.bigIdea ?? ""}`,
				pillarsLine ? `Messaging pillars: ${pillarsLine}` : "",
				summary.keyMessage ? `Key message: ${summary.keyMessage}` : "",
				summary.audienceHint ? `Audience: ${summary.audienceHint}` : "",
			]
				.filter(Boolean)
				.join("\n");

			const topicInput = {
				brandContext,
				productContexts: productContext ? [productContext] : undefined,
				prompt: topicPromptPrefix,
				count: 8,
			};

			const { systemPrompt: topSys, userPrompt: topUser } =
				buildTopicGenerationPrompt(topicInput);

			const topicStart = Date.now();
			const topicGenerator = await this.aiFactory.getTopicGenerator(workspaceId);
			let topicOutput: Awaited<ReturnType<ITopicGenerator["generate"]>>;
			try {
				topicOutput = await topicGenerator.generate(topicInput);
				const usage = (topicGenerator as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_topics",
						provider: settings.providers.topic,
						userId,
						systemPrompt: topSys,
						userPrompt: topUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						responseJson: topicOutput,
						durationMs: Date.now() - topicStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			} catch (err) {
				const usage = (topicGenerator as any).lastUsage;
				await logAiActivity(
					this.prisma,
					{
						workspaceId,
						generator: "campaign_topics",
						provider: settings.providers.topic,
						userId,
						systemPrompt: topSys,
						userPrompt: topUser,
						brandId: campaign.brandId ?? undefined,
					},
					{
						durationMs: Date.now() - topicStart,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
				throw err;
			}

			// Persist topics — linked to this campaign
			for (const t of topicOutput.topics ?? []) {
				const created = await this.prisma.contentTopic.create({
					data: {
						workspaceId: campaign.workspaceId,
						brandId: campaign.brandId,
						campaignId,
						title: t.title ?? "",
						description: t.description ?? "",
						pillar: t.pillar ?? null,
						platform: t.platform ?? null,
						format: t.format ?? null,
						objective: t.objective ?? null,
						publishDate: t.publishDate ? new Date(t.publishDate) : null,
						status: "draft",
					},
				});
				if (campaign.productId) {
					await this.prisma.contentTopicProduct.create({
						data: {
							contentTopicId: created.id,
							productId: campaign.productId,
						},
					});
				}
			}

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

}
