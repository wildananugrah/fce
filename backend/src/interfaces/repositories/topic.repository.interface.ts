import type { ContentTopic } from "@prisma/client";

export type TopicWithBrand = ContentTopic & {
	brand?: { id: string; name: string } | null;
	products?: Array<{
		id: string;
		product: { id: string; name: string };
	}>;
};

export interface ITopicRepository {
	findByWorkspace(workspaceId: string, filters?: { campaignId?: string }): Promise<TopicWithBrand[]>;
	findById(id: string): Promise<TopicWithBrand | null>;
	create(data: {
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
	}): Promise<ContentTopic>;
	update(
		id: string,
		data: Partial<ContentTopic> & { productIds?: string[] },
	): Promise<ContentTopic>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
