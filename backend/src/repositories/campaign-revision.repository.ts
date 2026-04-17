import type { CampaignPlanRevision, PrismaClient } from "@prisma/client";
import type {
	CreateRevisionInput,
	ICampaignRevisionRepository,
} from "../interfaces/repositories/campaign-revision.repository.interface";

export class CampaignRevisionRepository implements ICampaignRevisionRepository {
	constructor(private prisma: PrismaClient) {}

	async create(input: CreateRevisionInput): Promise<CampaignPlanRevision> {
		// Next revisionNumber = (max for this campaign) + 1, defaulting to 1.
		const latest = await this.prisma.campaignPlanRevision.findFirst({
			where: { campaignId: input.campaignId },
			orderBy: { revisionNumber: "desc" },
			select: { revisionNumber: true },
		});
		const revisionNumber = (latest?.revisionNumber ?? 0) + 1;

		return this.prisma.campaignPlanRevision.create({
			data: {
				campaignId: input.campaignId,
				revisionNumber,
				triggerMessageId: input.triggerMessageId ?? null,
				label: input.label,
				snapshot: input.snapshot as any,
			},
		});
	}

	async findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.prisma.campaignPlanRevision.findMany({
			where: { campaignId },
			orderBy: { revisionNumber: "desc" },
		});
	}

	async findById(id: string): Promise<CampaignPlanRevision | null> {
		return this.prisma.campaignPlanRevision.findUnique({ where: { id } });
	}

	async countByCampaign(campaignId: string): Promise<number> {
		return this.prisma.campaignPlanRevision.count({ where: { campaignId } });
	}
}
