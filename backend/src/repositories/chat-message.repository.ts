import type { CampaignChatMessage, PrismaClient } from "@prisma/client";
import type {
	CreateChatMessageInput,
	IChatMessageRepository,
} from "../interfaces/repositories/chat-message.repository.interface";

export class ChatMessageRepository implements IChatMessageRepository {
	constructor(private prisma: PrismaClient) {}

	async create(input: CreateChatMessageInput): Promise<CampaignChatMessage> {
		return this.prisma.campaignChatMessage.create({
			data: {
				campaignId: input.campaignId,
				role: input.role,
				userId: input.userId ?? null,
				contentBlocks: input.contentBlocks as any,
				attachments: (input.attachments ?? []) as any,
				skillIds: input.skillIds && input.skillIds.length > 0 ? (input.skillIds as any) : undefined,
			},
		});
	}

	async findByCampaign(campaignId: string, limit = 500): Promise<CampaignChatMessage[]> {
		return this.prisma.campaignChatMessage.findMany({
			where: { campaignId },
			orderBy: { createdAt: "asc" },
			take: limit,
		});
	}

	async findLatestByCampaign(campaignId: string, n: number): Promise<CampaignChatMessage[]> {
		const rows = await this.prisma.campaignChatMessage.findMany({
			where: { campaignId },
			orderBy: { createdAt: "desc" },
			take: n,
		});
		return rows.reverse();
	}

	async findById(id: string): Promise<CampaignChatMessage | null> {
		return this.prisma.campaignChatMessage.findUnique({ where: { id } });
	}

	async deleteByCampaign(campaignId: string): Promise<number> {
		const res = await this.prisma.campaignChatMessage.deleteMany({ where: { campaignId } });
		return res.count;
	}
}
