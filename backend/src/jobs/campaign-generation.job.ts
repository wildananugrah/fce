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
					include: { brainVersions: { where: { isActive: true }, take: 1 } },
				});
				brandContext = brand?.brainVersions[0]
					? JSON.stringify(brand.brainVersions[0])
					: JSON.stringify({ name: brand?.name });
			}

			// Generate campaign
			const output = await this.campaignGenerator.generate({
				brandContext,
				objective: campaign.objective ?? undefined,
				budget: campaign.budget ?? undefined,
				channelMix: campaign.channelMix ? (campaign.channelMix as string[]) : undefined,
				culturalContext: campaign.culturalContext ?? undefined,
			});

			// Save campaign output
			await this.prisma.campaignOutput.create({
				data: {
					campaignId,
					bigIdea: output.bigIdea,
					messagingPillars: output.messagingPillars as any,
					funnelJourney: output.funnelJourney as any,
					channelRoles: output.channelRoles as any,
					status: "draft",
				},
			});

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
			this.logger.error("Campaign generation failed", { campaignId, error: message });

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
