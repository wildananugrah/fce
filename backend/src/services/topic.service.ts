import type { ContentTopic } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";
import type { ITopicService } from "../interfaces/services/topic.service.interface";
import type { CreateTopicInput, GenerateTopicsInput, UpdateTopicInput } from "../types/topic.types";

export class TopicService implements ITopicService {
	constructor(
		private topicRepository: ITopicRepository,
		private boss: PgBoss,
	) {}

	async list(workspaceId: string): Promise<ContentTopic[]> {
		return this.topicRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<ContentTopic> {
		const topic = await this.topicRepository.findById(id);
		if (!topic) {
			throw new Error("Topic not found");
		}
		return topic;
	}

	async create(workspaceId: string, input: CreateTopicInput): Promise<ContentTopic> {
		return this.topicRepository.create({
			workspaceId,
			brandId: input.brandId,
			productId: input.productId,
			title: input.title,
			description: input.description,
			pillar: input.pillar,
			platform: input.platform,
			format: input.format,
			objective: input.objective,
			publishDate: input.publishDate ? new Date(input.publishDate) : undefined,
		});
	}

	async update(id: string, input: UpdateTopicInput): Promise<ContentTopic> {
		return this.topicRepository.update(id, {
			...input,
			publishDate: input.publishDate ? new Date(input.publishDate) : undefined,
		});
	}

	async generate(
		workspaceId: string,
		userId: string,
		input: GenerateTopicsInput,
	): Promise<{ jobId: string }> {
		const jobId = await this.boss.send("topic-generation", {
			workspaceId,
			brandId: input.brandId,
			productId: input.productId,
			platform: input.platform,
			count: input.count ?? 10,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}
}
