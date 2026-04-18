import type { CampaignChatMessage } from "@prisma/client";
import type { ChatAttachment, ChatBlock } from "../../types/chat.types";

export interface CreateChatMessageInput {
	campaignId: string;
	role: "user" | "assistant";
	userId?: string | null;
	contentBlocks: ChatBlock[];
	attachments?: ChatAttachment[];
	skillIds?: string[];
}

export interface IChatMessageRepository {
	create(input: CreateChatMessageInput): Promise<CampaignChatMessage>;
	findByCampaign(campaignId: string, limit?: number): Promise<CampaignChatMessage[]>;
	findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]>;
	findById(id: string): Promise<CampaignChatMessage | null>;
	deleteByCampaign(campaignId: string): Promise<number>;
}
