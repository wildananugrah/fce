import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

/**
 * Scheduled sweeper: hard-deletes rows soft-archived longer than
 * ARCHIVE_TTL_DAYS. Brand deletes cascade to products, brain versions,
 * topics, generation requests, outputs, sections, and feedback events
 * via FK constraints — so we only have to issue a `deleteMany` per table
 * and the DB takes care of the tree.
 *
 * Order matters only for output/content — we process it first so that
 * orphan archived outputs get cleaned even when their parent request isn't
 * archived. Everything else is independent.
 */
export class ArchiveSweepJob {
	constructor(
		private prisma: PrismaClient,
		private logger: ILogger,
		private ttlDays: number,
	) {}

	async handle(): Promise<void> {
		const cutoff = new Date(Date.now() - this.ttlDays * 24 * 60 * 60 * 1000);
		this.logger.info("archive-sweep: starting", {
			cutoff: cutoff.toISOString(),
			ttlDays: this.ttlDays,
		});

		const outputResult = await this.prisma.generationOutput.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const requestResult = await this.prisma.generationRequest.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const topicResult = await this.prisma.contentTopic.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		const productResult = await this.prisma.product.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		// Brands before projects so brand-cascade doesn't race with the
		// project-cascade (both would touch the same products/topics tree).
		const brandResult = await this.prisma.brand.deleteMany({
			where: { archivedAt: { lt: cutoff } },
		});
		// Projects last. The slug guard is belt-and-suspenders — the
		// archive endpoint already refuses to archive Default, so this
		// branch is unreachable in practice.
		const projectResult = await this.prisma.project.deleteMany({
			where: {
				archivedAt: { lt: cutoff },
				slug: { not: "default" },
			},
		});

		this.logger.info("archive-sweep: done", {
			deletedOutputs: outputResult.count,
			deletedRequests: requestResult.count,
			deletedTopics: topicResult.count,
			deletedProducts: productResult.count,
			deletedBrands: brandResult.count,
			deletedProjects: projectResult.count,
		});
	}
}
