import type { ContentTopic } from "@prisma/client";
import type {
	CreateTopicInput,
	GenerateTopicsInput,
	UpdateTopicInput,
} from "../../types/topic.types";
import type { TopicWithBrand } from "../repositories/topic.repository.interface";

export interface ITopicService {
	list(workspaceId: string): Promise<TopicWithBrand[]>;
	getById(id: string): Promise<ContentTopic>;
	create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic>;
	update(id: string, input: UpdateTopicInput): Promise<ContentTopic>;
	generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
}
