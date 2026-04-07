import type { PrismaClient } from "@prisma/client";
import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class RecommendationRecomputeJob {
	constructor(
		private prisma: PrismaClient,
		private recommendationRepository: IRecommendationRepository,
		private logger: ILogger,
	) {}

	async handle(data: { brandId: string; workspaceId: string }) {
		const { brandId, workspaceId } = data;

		try {
			this.logger.info("Recomputing recommendation profile", { brandId });

			const approvedOutputs = await this.prisma.generationOutput.findMany({
				where: {
					status: "approved",
					request: { brandId },
				},
				include: { request: true },
			});

			if (approvedOutputs.length === 0) {
				this.logger.info("No approved outputs for brand, skipping", { brandId });
				return;
			}

			const frameworkCounts: Record<string, number> = {};
			const hookTypeCounts: Record<string, number> = {};
			const platformCounts: Record<string, number> = {};

			for (const output of approvedOutputs) {
				const req = output.request;
				frameworkCounts[req.framework] = (frameworkCounts[req.framework] || 0) + 1;
				hookTypeCounts[req.hookType] = (hookTypeCounts[req.hookType] || 0) + 1;
				platformCounts[req.platform] = (platformCounts[req.platform] || 0) + 1;
			}

			const sortByFrequency = (counts: Record<string, number>) =>
				Object.entries(counts)
					.sort((a, b) => b[1] - a[1])
					.slice(0, 5)
					.map(([name, count]) => ({ name, count }));

			const editEvents = await this.prisma.outputFeedbackEvent.findMany({
				where: {
					eventType: { in: ["manual_edit", "section_edit"] },
					output: { request: { brandId } },
				},
				take: 100,
				orderBy: { createdAt: "desc" },
			});

			const editPatterns: Record<string, number> = {};
			for (const event of editEvents) {
				const before = event.before as any;
				if (before?.sectionType) {
					editPatterns[before.sectionType] = (editPatterns[before.sectionType] || 0) + 1;
				}
			}

			await this.recommendationRepository.upsert("brand", brandId, {
				workspaceId,
				preferredFrameworks: sortByFrequency(frameworkCounts),
				preferredHooks: sortByFrequency(hookTypeCounts),
				preferredPlatforms: sortByFrequency(platformCounts),
				commonEditPatterns: sortByFrequency(editPatterns),
				sampleSize: approvedOutputs.length,
			});

			this.logger.info("Recommendation profile updated", { brandId, sampleSize: approvedOutputs.length });
		} catch (error) {
			this.logger.error("Recommendation recompute failed", {
				brandId,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}
