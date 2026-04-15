import type { ContentTopic } from "@prisma/client";
import type {
	CreateTopicInput,
	GenerateTopicsInput,
	UpdateTopicInput,
} from "../../types/topic.types";
import type { TopicWithBrand } from "../repositories/topic.repository.interface";

export interface ITopicService {
	list(workspaceId: string, filters?: { campaignId?: string }): Promise<TopicWithBrand[]>;
	getById(id: string): Promise<TopicWithBrand>;
	create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic>;
	update(id: string, input: UpdateTopicInput): Promise<ContentTopic>;
	generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }>;
	regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
	): Promise<{ jobId: string }>;
	regeneratePreview(
		workspaceId: string,
		userId: string,
		params: {
			brandId?: string;
			productIds?: string[];
			platform?: string;
			format?: string;
			objective?: string;
		},
		hint?: string,
	): Promise<{ jobId: string }>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
