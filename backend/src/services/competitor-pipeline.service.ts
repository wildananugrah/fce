import type { CompetitorPipelineRun } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { ICompetitorPipelineService } from "../interfaces/services/competitor-pipeline.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import {
	PIPELINE_INPUT_LIMITS,
	PIPELINE_TERMINAL_STATUSES,
	type CreatePipelineRunInput,
	type PipelineRunWithVideosAndScripts,
} from "../types/competitor-analyzer.types";

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

export class CompetitorPipelineService implements ICompetitorPipelineService {
	constructor(
		private pipelineRepository: ICompetitorPipelineRepository,
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private boss: PgBoss,
		private apifyKeyLookup: ApifyKeyLookup,
		private logger: ILogger,
	) {}

	async createRun(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreatePipelineRunInput,
	): Promise<CompetitorPipelineRun> {
		// 1. Validate input ranges.
		this.validateInputRanges(input);

		// 2. Workspace must have an Apify key.
		const apifyKey = await this.apifyKeyLookup(workspaceId);
		if (!apifyKey) {
			throw new Error("Apify API key not configured. Set it in workspace settings.");
		}

		// 3. Config must exist, belong to project, and have ≥1 non-archived creator.
		const config = await this.configRepository.findById(input.configId);
		if (!config) throw new Error("Config not found");
		if (config.projectId !== projectId) throw new Error("Config does not belong to this project");
		const activeCreators = config.creators.filter((c) => c.archivedAt === null);
		if (activeCreators.length === 0) {
			throw new Error("Config must have at least one creator to run a pipeline");
		}

		// 4. Create the run record.
		const run = await this.pipelineRepository.createRun({
			workspaceId,
			projectId,
			configId: input.configId,
			userId,
			videosPerCreator: input.videosPerCreator,
			lookbackPool: input.lookbackPool,
			timeframeDays: input.timeframeDays,
		});

		// 5. Enqueue — 30 min expiration budget (pg-boss SendOptions uses
		// expireInSeconds, not expireInHours; 1800s = 30 min).
		await this.boss.send(
			"competitor-pipeline",
			{ runId: run.id },
			{ expireInSeconds: 1800 },
		);

		this.logger.info("Competitor pipeline run enqueued", {
			runId: run.id,
			projectId,
			configId: input.configId,
			creatorCount: activeCreators.length,
		});

		return run;
	}

	async listRuns(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.pipelineRepository.findRunsByProject(projectId);
	}

	async getRun(id: string): Promise<PipelineRunWithVideosAndScripts> {
		const run = await this.pipelineRepository.findRunById(id);
		if (!run) throw new Error("Run not found");
		return run;
	}

	async cancelRun(id: string): Promise<CompetitorPipelineRun> {
		const run = await this.pipelineRepository.findRunById(id);
		if (!run) throw new Error("Run not found");
		if (PIPELINE_TERMINAL_STATUSES.has(run.status)) {
			throw new Error("Cannot cancel a run already in a terminal state");
		}
		return this.pipelineRepository.updateRun(id, { status: "cancelling" });
	}

	private validateInputRanges(input: CreatePipelineRunInput): void {
		const {
			videosPerCreatorMin,
			videosPerCreatorMax,
			lookbackPoolMin,
			lookbackPoolMax,
			timeframeDaysMin,
			timeframeDaysMax,
		} = PIPELINE_INPUT_LIMITS;

		if (input.videosPerCreator < videosPerCreatorMin || input.videosPerCreator > videosPerCreatorMax) {
			throw new Error(
				`videosPerCreator must be between ${videosPerCreatorMin} and ${videosPerCreatorMax}`,
			);
		}
		if (input.lookbackPool < lookbackPoolMin || input.lookbackPool > lookbackPoolMax) {
			throw new Error(
				`lookbackPool must be between ${lookbackPoolMin} and ${lookbackPoolMax}`,
			);
		}
		if (input.timeframeDays < timeframeDaysMin || input.timeframeDays > timeframeDaysMax) {
			throw new Error(
				`timeframeDays must be between ${timeframeDaysMin} and ${timeframeDaysMax}`,
			);
		}
	}
}
