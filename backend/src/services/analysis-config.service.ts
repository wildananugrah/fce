import type { AnalysisConfig } from "@prisma/client";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { IAnalysisConfigService } from "../interfaces/services/analysis-config.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../types/competitor-analyzer.types";

export class AnalysisConfigService implements IAnalysisConfigService {
	constructor(
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private logger: ILogger,
	) {}

	async create(
		workspaceId: string,
		projectId: string,
		input: CreateAnalysisConfigInput,
	): Promise<AnalysisConfig> {
		const name = input.name.trim();
		const brandContext = input.brandContext.trim();
		if (!name) throw new Error("Name is required");
		if (!brandContext) throw new Error("Brand context is required");
		if (!input.analysisInstructions.trim()) throw new Error("Analysis instructions required");
		if (!input.outputPreferences.trim()) throw new Error("Output preferences required");

		return this.configRepository.create({
			workspaceId,
			projectId,
			input: {
				name,
				targetNiche: input.targetNiche?.trim() || undefined,
				brandContext,
				analysisInstructions: input.analysisInstructions.trim(),
				outputPreferences: input.outputPreferences.trim(),
			},
		});
	}

	async list(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		return this.configRepository.findByProject(projectId);
	}

	async get(id: string): Promise<AnalysisConfigWithCreators> {
		const config = await this.configRepository.findById(id);
		if (!config) throw new Error("Config not found");
		return config;
	}

	async update(id: string, input: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		await this.get(id);
		return this.configRepository.update(id, input);
	}

	async delete(id: string): Promise<void> {
		await this.get(id);
		await this.configRepository.delete(id);
	}

	async replaceCreators(configId: string, creatorIds: string[], projectId: string): Promise<void> {
		await this.get(configId);

		if (creatorIds.length === 0) {
			await this.configRepository.replaceCreators(configId, []);
			return;
		}

		const creators = await this.creatorRepository.findByIds(creatorIds);
		const belongToProject = creators.every((c) => c.projectId === projectId);
		if (!belongToProject || creators.length !== creatorIds.length) {
			throw new Error("One or more creators do not belong to this project");
		}

		await this.configRepository.replaceCreators(configId, creatorIds);
		this.logger.info("Config creators replaced", {
			configId,
			count: creatorIds.length,
		});
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		await this.get(configId);
		await this.configRepository.removeCreator(configId, creatorId);
	}
}
