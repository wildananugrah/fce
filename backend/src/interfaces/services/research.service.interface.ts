import type { ResearchResult, ResearchRun } from "@prisma/client";
import type { CreateResearchRunInput, ResearchRunFilters } from "../../types/research.types";

export interface IResearchService {
	createRun(
		workspaceId: string,
		userId: string,
		input: CreateResearchRunInput,
	): Promise<ResearchRun>;
	listRuns(workspaceId: string, filters?: ResearchRunFilters): Promise<any[]>;
	getRun(runId: string): Promise<any>;
	getRunResults(runId: string, skip?: number, take?: number): Promise<ResearchResult[]>;
	getResult(resultId: string): Promise<ResearchResult>;
	getResultAsContext(resultId: string): Promise<string>;
	getSettings(workspaceId: string): Promise<{ hasApifyKey: boolean; maskedKey?: string }>;
	getRawApifyKey(workspaceId: string): Promise<string | null>;
	setApifyKey(workspaceId: string, apiKey: string): Promise<void>;
	testApifyKey(workspaceId: string): Promise<boolean>;
	removeApifyKey(workspaceId: string): Promise<void>;
}
