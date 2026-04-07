import type { ContentTopic, PrismaClient } from "@prisma/client";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";

export class TopicRepository implements ITopicRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string): Promise<ContentTopic[]> {
		return this.prisma.contentTopic.findMany({
			where: { workspaceId },
			orderBy: { createdAt: "desc" },
		});
	}

	async findById(id: string): Promise<ContentTopic | null> {
		return this.prisma.contentTopic.findUnique({ where: { id } });
	}

	async create(data: {
		workspaceId: string;
		brandId?: string;
		productId?: string;
		title: string;
		description?: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: Date;
	}): Promise<ContentTopic> {
		return this.prisma.contentTopic.create({ data });
	}

	async update(id: string, data: Partial<ContentTopic>): Promise<ContentTopic> {
		return this.prisma.contentTopic.update({ where: { id }, data });
	}
}
