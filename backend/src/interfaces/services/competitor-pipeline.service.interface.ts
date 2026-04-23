// backend/src/interfaces/services/competitor-pipeline.service.interface.ts
import type { CompetitorPipelineRun } from "@prisma/client";
import type {
	CreatePipelineRunInput,
	PipelineRunWithVideosAndScripts,
} from "../../types/competitor-analyzer.types";

export interface ICompetitorPipelineService {
	createRun(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreatePipelineRunInput,
	): Promise<CompetitorPipelineRun>;
	listRuns(projectId: string): Promise<CompetitorPipelineRun[]>;
	getRun(id: string): Promise<PipelineRunWithVideosAndScripts>;
	cancelRun(id: string): Promise<CompetitorPipelineRun>;
	deleteRun(id: string): Promise<void>;
}
