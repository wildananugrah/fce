import type { ContentTopic } from "@prisma/client";
import type {
	CreateTopicInput,
	GenerateTopicsInput,
	UpdateTopicInput,
} from "../../types/topic.types";

export interface ITopicService {
	list(workspaceId: string): Promise<ContentTopic[]>;
	getById(id: string): Promise<ContentTopic>;
	create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic>;
	update(id: string, input: UpdateTopicInput): Promise<ContentTopic>;
	generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }>;
}
