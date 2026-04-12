import type { ActorType } from "../config/apify-actors";

export interface CreateResearchRunInput {
	actorType: ActorType;
	input: Record<string, any>;
	brandId?: string;
}

export interface ResearchRunFilters {
	actorType?: string;
	status?: string;
	brandId?: string;
}
