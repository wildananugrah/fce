import type { CampaignPlanRevision } from "@prisma/client";

export interface TopicSnapshot {
	title: string;
	description: string | null;
	pillar: string | null;
	platform: string | null;
	format: string | null;
	objective: string | null;
	publishDate: string | null;
	productIds: string[];
}

export interface PlanSnapshot {
	objective: string | null;
	audienceSegment: string | null;
	keyMessage: string | null;
	bigIdea: string | null;
	messagingPillars: Array<{ name: string; description: string }> | null;
	documentSummary?: string | null;
	topics?: TopicSnapshot[] | null;
}

export interface CreateRevisionInput {
	campaignId: string;
	triggerMessageId?: string | null;
	label: string;
	snapshot: PlanSnapshot;
}

export interface ICampaignRevisionRepository {
	create(input: CreateRevisionInput): Promise<CampaignPlanRevision>;
	findByCampaign(campaignId: string): Promise<CampaignPlanRevision[]>;
	findById(id: string): Promise<CampaignPlanRevision | null>;
	countByCampaign(campaignId: string): Promise<number>;
}
