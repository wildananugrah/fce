export interface CreateCampaignInput {
	brandId?: string;
	productId?: string;
	name: string;
	description?: string;
	objective?: string;
	budget?: string;
	channelMix?: string[];
	culturalContext?: string;
	audienceSegment?: string;
	durationStart?: string; // ISO date
	durationEnd?: string; // ISO date
	budgetMin?: number;
	budgetMax?: number;
	keyMessage?: string;
	generate?: boolean;
}

export interface UpdateCampaignInput {
	name?: string;
	description?: string;
	objective?: string;
	status?: string;
}

export interface CreateBriefInput {
	objectiveDetail?: string;
	channelMix?: string[];
	mandatoryDeliverables?: string[];
	culturalContext?: string;
	trendContext?: string;
	competitiveContext?: string;
	kpiPreference?: Record<string, any>;
	toneDirection?: string;
	documentSummary?: string;
	documentUrl?: string;
	documentName?: string;
}

export interface CreateChannelRoleInput {
	channelCode: string;
	channelRole: string;
	priorityOrder: number;
}

export interface CreateDeliverableInput {
	deliverableType: string;
	deliverableName: string;
	recommendedChannel?: string;
	funnelStage?: string;
	qtyRecommendation?: number;
}

export interface CreateFromBriefInput {
	brandId: string;
	productId?: string;
	fileName: string;
	fileUrl: string;
	fileSize: number;
	fileType: string;
}
