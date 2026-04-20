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
			pillar?: string;
			language?: string;
		},
		hint?: string,
	): Promise<{ jobId: string }>;
	// Soft-delete. Topics move into Trash; restore or sweep later.
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	restoreMany(workspaceId: string, ids: string[]): Promise<number>;
	permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
