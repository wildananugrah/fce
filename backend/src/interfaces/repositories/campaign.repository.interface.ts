import type { Campaign, CampaignOutput } from "@prisma/client";

export interface ICampaignRepository {
	findByWorkspace(workspaceId: string): Promise<Campaign[]>;
	findById(id: string): Promise<(Campaign & { outputs: CampaignOutput[] }) | null>;
	create(data: {
		workspaceId: string;
		brandId?: string;
		name: string;
		description?: string;
		objective?: string;
		budget?: string;
		channelMix?: any;
		culturalContext?: string;
	}): Promise<Campaign>;
	update(
		id: string,
		data: Partial<Pick<Campaign, "name" | "description" | "objective" | "status">>,
	): Promise<Campaign>;
}
