import type { ContentTopic, PrismaClient } from "@prisma/client";
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
		private prisma: PrismaClient,
	) {}

	async list(
		workspaceId: string,
		filters?: { campaignId?: string; projectId?: string },
	): Promise<TopicWithBrand[]> {
		return this.topicRepository.findByWorkspace(workspaceId, filters);
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
	): Promise<{ runId: string; jobId: string }> {
		const brand = await this.prisma.brand.findUnique({
			where: { id: input.brandId },
			select: { language: true },
		});
		if (!brand) throw new Error("Brand not found");
		const language = brand.language;

		// Create the run row BEFORE enqueueing so the worker has something
		// to look up and the user can cancel between submit and pickup.
		const run = await this.prisma.topicGenerationRun.create({
			data: { workspaceId, userId, status: "pending" },
		});

		const jobId = await this.boss.send("topic-generation", {
			runId: run.id,
			workspaceId,
			brandId: input.brandId,
			productIds: input.productIds,
			platform: input.platform,
			objective: input.objective,
			formats: input.formats,
			pillars: input.pillars,
			language,
			dateFrom: input.dateFrom,
			dateTo: input.dateTo,
			count: input.count ?? 10,
			userId,
			prompt: input.prompt,
			referenceImages: input.referenceImages,
		});

		return { runId: run.id, jobId: jobId ?? "queued" };
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
			pillar: topic.pillar ?? undefined,
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
			pillar?: string;
		},
		hint?: string,
	): Promise<{ jobId: string }> {
		const brand = await this.prisma.brand.findUnique({
			where: { id: params.brandId },
			select: { language: true },
		});
		if (!brand) throw new Error("Brand not found");
		const language = brand.language;

		const jobId = await this.boss.send("topic-regeneration", {
			workspaceId,
			brandId: params.brandId,
			productIds: params.productIds ?? [],
			platform: params.platform,
			format: params.format,
			objective: params.objective,
			pillar: params.pillar,
			language,
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
		return this.topicRepository.archiveMany(workspaceId, ids);
	}

	async restoreMany(workspaceId: string, ids: string[]): Promise<number> {
		if (!ids.length) {
			throw new Error("No topic IDs provided");
		}
		return this.topicRepository.restoreMany(workspaceId, ids);
	}

	async permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number> {
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
