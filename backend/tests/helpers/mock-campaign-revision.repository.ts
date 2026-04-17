import type { CampaignPlanRevision } from "@prisma/client";
import type {
	CreateRevisionInput,
	ICampaignRevisionRepository,
} from "../../src/interfaces/repositories/campaign-revision.repository.interface";

export class MockCampaignRevisionRepository implements ICampaignRevisionRepository {
	private revisions: CampaignPlanRevision[] = [];

	async create(input: CreateRevisionInput): Promise<CampaignPlanRevision> {
		const latest = Math.max(
			0,
			...this.revisions.filter((r) => r.campaignId === input.campaignId).map((r) => r.revisionNumber),
		);
		const rev: CampaignPlanRevision = {
			id: crypto.randomUUID(),
			campaignId: input.campaignId,
			revisionNumber: latest + 1,
			triggerMessageId: input.triggerMessageId ?? null,
			label: input.label,
			snapshot: input.snapshot as any,
			createdAt: new Date(),
		};
		this.revisions.push(rev);
		return rev;
	}

	async findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.revisions
			.filter((r) => r.campaignId === campaignId)
			.sort((a, b) => b.revisionNumber - a.revisionNumber);
	}

	async findById(id: string): Promise<CampaignPlanRevision | null> {
		return this.revisions.find((r) => r.id === id) ?? null;
	}

	async countByCampaign(campaignId: string): Promise<number> {
		return this.revisions.filter((r) => r.campaignId === campaignId).length;
	}

	clear(): void {
		this.revisions = [];
	}
}
