import type { ContentTopic, PrismaClient } from "@prisma/client";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";

export class TopicRepository implements ITopicRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string, filters?: { campaignId?: string }) {
		return this.prisma.contentTopic.findMany({
			where: {
				workspaceId,
				archivedAt: null,
				// Topics can be brand-less (free-floating for a campaign) — only
				// enforce the brand's archivedAt when a brand is attached.
				OR: [{ brandId: null }, { brand: { archivedAt: null } }],
				...(filters?.campaignId ? { campaignId: filters.campaignId } : {}),
			},
			orderBy: { createdAt: "desc" },
			include: {
				brand: { select: { id: true, name: true } },
				products: { include: { product: { select: { id: true, name: true } } } },
			},
		});
	}

	async findArchivedByWorkspace(workspaceId: string) {
		// Only topics archived on their own. Topics of an archived brand are
		// collapsed under the brand's trash row.
		return this.prisma.contentTopic.findMany({
			where: {
				workspaceId,
				archivedAt: { not: null },
				OR: [{ brandId: null }, { brand: { archivedAt: null } }],
			},
			orderBy: { archivedAt: "desc" },
			include: {
				brand: { select: { id: true, name: true } },
				products: { include: { product: { select: { id: true, name: true } } } },
			},
		});
	}

	async findById(id: string) {
		return this.prisma.contentTopic.findUnique({
			where: { id },
			include: {
				brand: { select: { id: true, name: true } },
				products: { include: { product: { select: { id: true, name: true } } } },
			},
		});
	}

	async create(data: {
		workspaceId: string;
		brandId?: string;
		productIds?: string[];
		title: string;
		description?: string;
		pillar?: string;
		platform?: string;
		format?: string;
		objective?: string;
		publishDate?: Date;
	}): Promise<ContentTopic> {
		const { productIds, ...topicData } = data;
		return this.prisma.contentTopic.create({
			data: {
				...topicData,
				products:
					productIds && productIds.length > 0
						? { create: productIds.map((productId) => ({ productId })) }
						: undefined,
			},
		});
	}

	async update(
		id: string,
		data: Partial<ContentTopic> & { productIds?: string[] },
	): Promise<ContentTopic> {
		const { productIds, ...topicData } = data;

		if (productIds !== undefined) {
			// Sync join table: delete all existing, create new ones
			await this.prisma.contentTopicProduct.deleteMany({ where: { contentTopicId: id } });
			if (productIds.length > 0) {
				await this.prisma.contentTopicProduct.createMany({
					data: productIds.map((productId) => ({ contentTopicId: id, productId })),
				});
			}
		}

		return this.prisma.contentTopic.update({ where: { id }, data: topicData });
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.contentTopic.deleteMany({
			where: { workspaceId, id: { in: ids } },
		});
		return result.count;
	}

	async archiveMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.contentTopic.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { archivedAt: new Date() },
		});
		return result.count;
	}

	async restoreMany(workspaceId: string, ids: string[]): Promise<number> {
		const result = await this.prisma.contentTopic.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { archivedAt: null },
		});
		return result.count;
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const result = await this.prisma.contentTopic.updateMany({
			where: { workspaceId, id: { in: ids } },
			data: { status },
		});
		return result.count;
	}
}
