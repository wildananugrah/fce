import type { ContentTopic } from "@prisma/client";

export type TopicWithBrand = ContentTopic & {
	brand?: { id: string; name: string } | null;
};

export interface ITopicRepository {
	findByWorkspace(workspaceId: string): Promise<TopicWithBrand[]>;
	findById(id: string): Promise<ContentTopic | null>;
	create(data: {
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
	}): Promise<ContentTopic>;
	update(id: string, data: Partial<ContentTopic>): Promise<ContentTopic>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
