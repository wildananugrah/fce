import type { CampaignChatMessage } from "@prisma/client";
import type {
	CreateChatMessageInput,
	IChatMessageRepository,
} from "../../src/interfaces/repositories/chat-message.repository.interface";

export class MockChatMessageRepository implements IChatMessageRepository {
	private messages: CampaignChatMessage[] = [];

	async create(input: CreateChatMessageInput): Promise<CampaignChatMessage> {
		const msg: CampaignChatMessage = {
			id: crypto.randomUUID(),
			campaignId: input.campaignId,
			role: input.role,
			userId: input.userId ?? null,
			contentBlocks: input.contentBlocks as any,
			attachments: (input.attachments ?? []) as any,
			skillIds: input.skillIds && input.skillIds.length > 0 ? (input.skillIds as any) : null,
			createdAt: new Date(),
		};
		this.messages.push(msg);
		return msg;
	}

	async findByCampaign(campaignId: string): Promise<CampaignChatMessage[]> {
		return this.messages
			.filter((m) => m.campaignId === campaignId)
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	}

	async findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]> {
		const all = await this.findByCampaign(campaignId);
		return all.slice(-n);
	}

	async findById(id: string): Promise<CampaignChatMessage | null> {
		return this.messages.find((m) => m.id === id) ?? null;
	}

	async deleteByCampaign(campaignId: string): Promise<number> {
		const before = this.messages.length;
		this.messages = this.messages.filter((m) => m.campaignId !== campaignId);
		return before - this.messages.length;
	}

	clear(): void {
		this.messages = [];
	}
}
