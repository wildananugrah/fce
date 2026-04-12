import type { ResearchResult, ResearchRun } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import { type ActorType, APIFY_ACTORS } from "../config/apify-actors";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IResearchRepository } from "../interfaces/repositories/research.repository.interface";
import type { IResearchService } from "../interfaces/services/research.service.interface";
import type { CreateResearchRunInput, ResearchRunFilters } from "../types/research.types";

export class ResearchService implements IResearchService {
	constructor(
		private researchRepository: IResearchRepository,
		private apifyProvider: IApifyProvider,
		private boss: PgBoss,
		private logger: ILogger,
	) {}

	async createRun(
		workspaceId: string,
		userId: string,
		input: CreateResearchRunInput,
	): Promise<ResearchRun> {
		const actorConfig = APIFY_ACTORS[input.actorType];
		if (!actorConfig) throw new Error(`Unknown actor type: ${input.actorType}`);

		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey)
			throw new Error("Apify API key not configured. Set it in workspace settings.");

		const run = await this.researchRepository.createRun({
			workspaceId,
			userId,
			brandId: input.brandId,
			actorType: input.actorType,
			actorId: actorConfig.actorId,
			input: input.input,
		});

		await this.boss.send("research-run", { researchRunId: run.id });
		this.logger.info("Research run enqueued", { runId: run.id, actorType: input.actorType });
		return run;
	}

	async listRuns(workspaceId: string, filters?: ResearchRunFilters) {
		return this.researchRepository.findRunsByWorkspace(workspaceId, filters);
	}

	async getRun(runId: string) {
		const run = await this.researchRepository.findRunById(runId);
		if (!run) throw new Error("Research run not found");
		return run;
	}

	async getRunResults(runId: string, skip = 0, take = 50): Promise<ResearchResult[]> {
		return this.researchRepository.findResultsByRun(runId, skip, take);
	}

	async getResult(resultId: string): Promise<ResearchResult> {
		const result = await this.researchRepository.findResultById(resultId);
		if (!result) throw new Error("Research result not found");
		return result;
	}

	async getResultAsContext(resultId: string): Promise<string> {
		const result = await this.getResult(resultId);
		const parts: string[] = [];
		if (result.title) parts.push(`Title: ${result.title}`);
		if (result.url) parts.push(`Source: ${result.url}`);
		parts.push(`Content: ${result.content}`);
		const meta = result.metadata as Record<string, any>;
		if (meta.platform) parts.push(`Platform: ${meta.platform}`);
		if (meta.hashtags?.length) parts.push(`Hashtags: ${meta.hashtags.join(", ")}`);
		return parts.join("\n");
	}

	async getSettings(workspaceId: string) {
		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey) return { hasApifyKey: false };
		const key = settings.apifyApiKey;
		const masked = key.length > 8 ? `${key.slice(0, 4)}...${key.slice(-4)}` : "****";
		return { hasApifyKey: true, maskedKey: masked };
	}

	async setApifyKey(workspaceId: string, apiKey: string): Promise<void> {
		await this.researchRepository.upsertWorkspaceSetting(workspaceId, { apifyApiKey: apiKey });
	}

	async testApifyKey(workspaceId: string): Promise<boolean> {
		const settings = await this.researchRepository.getWorkspaceSetting(workspaceId);
		if (!settings?.apifyApiKey) return false;
		return this.apifyProvider.testConnection(settings.apifyApiKey);
	}

	async removeApifyKey(workspaceId: string): Promise<void> {
		await this.researchRepository.upsertWorkspaceSetting(workspaceId, { apifyApiKey: null });
	}
}
