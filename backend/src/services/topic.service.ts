import type { ContentTopic } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type {
	ITopicRepository,
	TopicWithBrand,
} from "../interfaces/repositories/topic.repository.interface";
import type { ITopicService } from "../interfaces/services/topic.service.interface";
import type { CreateTopicInput, GenerateTopicsInput, UpdateTopicInput } from "../types/topic.types";

export class TopicService implements ITopicService {
	constructor(
		private topicRepository: ITopicRepository,
		private boss: PgBoss,
	) {}

	async list(workspaceId: string): Promise<TopicWithBrand[]> {
		return this.topicRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<TopicWithBrand> {
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
			productIds: input.productIds,
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
			productIds: input.productIds,
			platform: input.platform,
			objective: input.objective,
			formats: input.formats,
			dateFrom: input.dateFrom,
			dateTo: input.dateTo,
			count: input.count ?? 10,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async regenerate(
		workspaceId: string,
		userId: string,
		topicId: string,
		hint?: string,
	): Promise<{ jobId: string }> {
		const topic = await this.topicRepository.findById(topicId);
		if (!topic) {
			throw new Error("Topic not found");
		}

		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			topicId,
			brandId: topic.brandId,
			productIds: topic.products?.map((p) => p.product.id) ?? [],
			platform: topic.platform,
			format: topic.format,
			objective: topic.objective,
			hint,
			preview: false,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async regeneratePreview(
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
	): Promise<{ jobId: string }> {
		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			brandId: params.brandId,
			productIds: params.productIds ?? [],
			platform: params.platform,
			format: params.format,
			objective: params.objective,
			hint,
			preview: true,
			userId,
		});

		return { jobId: jobId ?? "queued" };
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		if (!ids.length) {
			throw new Error("No topic IDs provided");
		}
		return this.topicRepository.deleteMany(workspaceId, ids);
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const validStatuses = ["draft", "scheduled", "published", "archived"];
		if (!ids.length) {
			throw new Error("No topic IDs provided");
		}
		if (!validStatuses.includes(status)) {
			throw new Error(`Invalid status: ${status}. Must be one of: ${validStatuses.join(", ")}`);
		}
		return this.topicRepository.updateManyStatus(workspaceId, ids, status);
	}
}
