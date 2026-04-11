import type { PrismaClient } from "@prisma/client";
import type { ICampaignGenerator } from "../interfaces/providers/campaign-generator.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface CampaignJobData {
	campaignId: string;
	userId: string;
}

export class CampaignGenerationJob {
	constructor(
		private prisma: PrismaClient,
		private campaignGenerator: ICampaignGenerator,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: CampaignJobData): Promise<void> {
		const { campaignId, userId } = data;

		try {
			// Update campaign status to processing
			const campaign = await this.prisma.campaign.update({
				where: { id: campaignId },
				data: { status: "processing" },
			});

			// Build brand context
			let brandContext = "{}";
			if (campaign.brandId) {
				const brand = await this.prisma.brand.findUnique({
					where: { id: campaign.brandId },
					include: {
						brainVersions: { where: { isActive: true }, take: 1 },
					},
				});
				brandContext = brand?.brainVersions[0]
					? JSON.stringify(brand.brainVersions[0])
					: JSON.stringify({ name: brand?.name });
			}

			// Build product context
			let productContext: string | undefined;
			if (campaign.productId) {
				const product = await this.prisma.product.findUnique({
					where: { id: campaign.productId },
					include: {
						brainVersions: { where: { isActive: true }, take: 1 },
					},
				});
				if (product) {
					productContext = product.brainVersions[0]
						? JSON.stringify(product.brainVersions[0])
						: JSON.stringify({ name: product.name });
				}
			}

			// Load brief data
			const brief = await this.prisma.campaignBrief.findFirst({
				where: { campaignId },
				orderBy: { createdAt: "desc" },
			});

			// Build generation input with brief fields
			const generationInput: any = {
				brandContext,
				objective: campaign.objective ?? undefined,
				budget: campaign.budget ?? undefined,
				channelMix: campaign.channelMix ? (campaign.channelMix as string[]) : undefined,
				culturalContext: campaign.culturalContext ?? undefined,
			};

			// Add product context if available
			if (productContext) {
				generationInput.brandContext = `${brandContext}\n\nProduct Context: ${productContext}`;
			}

			// Add brief fields to generation input
			if (brief) {
				if (brief.objectiveDetail) {
					generationInput.objective =
						`${generationInput.objective ?? ""}\n\nDetailed Objective: ${brief.objectiveDetail}`.trim();
				}
				if (brief.channelMix) {
					generationInput.channelMix = brief.channelMix as string[];
				}
				if (brief.culturalContext) {
					generationInput.culturalContext =
						`${generationInput.culturalContext ?? ""}\n\n${brief.culturalContext}`.trim();
				}
				if (brief.trendContext) {
					generationInput.culturalContext =
						`${generationInput.culturalContext ?? ""}\n\nTrend Context: ${brief.trendContext}`.trim();
				}
				if (brief.competitiveContext) {
					generationInput.culturalContext =
						`${generationInput.culturalContext ?? ""}\n\nCompetitive Context: ${brief.competitiveContext}`.trim();
				}
				if (brief.toneDirection) {
					generationInput.brandContext = `${generationInput.brandContext}\n\nTone Direction: ${brief.toneDirection}`;
				}
				if (brief.mandatoryDeliverables) {
					generationInput.culturalContext =
						`${generationInput.culturalContext ?? ""}\n\nMandatory Deliverables: ${JSON.stringify(brief.mandatoryDeliverables)}`.trim();
				}
				if (brief.kpiPreference) {
					generationInput.culturalContext =
						`${generationInput.culturalContext ?? ""}\n\nKPI Preferences: ${JSON.stringify(brief.kpiPreference)}`.trim();
				}
			}

			// Generate campaign
			const output = await this.campaignGenerator.generate(generationInput);

			// Save campaign output
			const campaignOutput = await this.prisma.campaignOutput.create({
				data: {
					campaignId,
					bigIdea: output.bigIdea,
					messagingPillars: output.messagingPillars as any,
					funnelJourney: output.funnelJourney as any,
					channelRoles: output.channelRoles as any,
					status: "draft",
				},
			});

			// Parse and create CampaignChannelRole records from output
			if (output.channelRoles && Array.isArray(output.channelRoles)) {
				const channelRoleData = output.channelRoles.map((role: any, index: number) => ({
					campaignOutputId: campaignOutput.id,
					channelCode: role.channelCode ?? role.channel ?? `channel-${index}`,
					channelRole: role.channelRole ?? role.role ?? role.description ?? "",
					priorityOrder: role.priorityOrder ?? role.priority ?? index + 1,
				}));
				if (channelRoleData.length > 0) {
					await this.prisma.campaignChannelRole.createMany({
						data: channelRoleData,
					});
				}
			}

			// Parse and create CampaignDeliverable records from output
			if (output.funnelJourney && Array.isArray(output.funnelJourney)) {
				const deliverableData: any[] = [];
				for (const stage of output.funnelJourney) {
					if (stage.deliverables && Array.isArray(stage.deliverables)) {
						for (const d of stage.deliverables) {
							deliverableData.push({
								campaignOutputId: campaignOutput.id,
								deliverableType: d.type ?? d.deliverableType ?? "content",
								deliverableName: d.name ?? d.deliverableName ?? "Untitled",
								recommendedChannel: d.channel ?? d.recommendedChannel,
								funnelStage: stage.stage ?? stage.name ?? d.funnelStage,
								qtyRecommendation: d.qty ?? d.qtyRecommendation,
							});
						}
					}
				}
				if (deliverableData.length > 0) {
					await this.prisma.campaignDeliverable.createMany({
						data: deliverableData,
					});
				}
			}

			// Update campaign status to completed
			await this.prisma.campaign.update({
				where: { id: campaignId },
				data: { status: "completed" },
			});

			// Notify via SSE
			this.notificationService.notify(userId, {
				type: "campaign_generation_complete",
				data: { campaignId, status: "completed" },
			});

			this.logger.info("Campaign generation completed", { campaignId });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error("Campaign generation failed", {
				campaignId,
				error: message,
			});

			await this.prisma.campaign.update({
				where: { id: campaignId },
				data: { status: "failed" },
			});

			this.notificationService.notify(userId, {
				type: "campaign_generation_failed",
				data: { campaignId, status: "failed", error: message },
			});
		}
	}
}
