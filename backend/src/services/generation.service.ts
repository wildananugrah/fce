import type { GenerationRequest } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { IGenerationService } from "../interfaces/services/generation.service.interface";
import type { CreateGenerationInput } from "../types/generation.types";

export class GenerationService implements IGenerationService {
	constructor(
		private generationRepository: IGenerationRepository,
		private boss: PgBoss,
	) {}

	async list(workspaceId: string): Promise<GenerationRequest[]> {
		return this.generationRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<any> {
		const request = await this.generationRepository.findById(id);
		if (!request) {
			throw new Error("Generation request not found");
		}
		return request;
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		return this.generationRepository.deleteMany(workspaceId, ids);
	}

	async create(
		workspaceId: string,
		userId: string,
		input: CreateGenerationInput,
	): Promise<GenerationRequest> {
		// Use first productId for the FK, or fall back to single productId
		const primaryProductId = input.productIds?.[0] ?? input.productId ?? null;

		const request = await this.generationRepository.create({
			workspaceId,
			brandId: input.brandId,
			productId: primaryProductId,
			contentTopicId: input.contentTopicId || null,
			platform: input.platform,
			contentType: input.contentType,
			framework: input.framework,
			hookType: input.hookType,
			language: input.language || "id",
			prompt: input.prompt || null,
			objective: input.objective || null,
			tonePreset: input.tonePreset || null,
			visualStyle: input.visualStyle || null,
			outputLength: input.outputLength || null,
		});

		await this.boss.send("content-generation", {
			requestId: request.id,
			productIds: input.productIds ?? (input.productId ? [input.productId] : []),
			userId,
			referenceImages: input.referenceImages,
			researchContext: input.researchContext,
		});

		return request;
	}
}
