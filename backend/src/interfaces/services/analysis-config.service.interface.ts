// backend/src/interfaces/services/analysis-config.service.interface.ts
import type { AnalysisConfig } from "@prisma/client";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../types/competitor-analyzer.types";

export interface IAnalysisConfigService {
	create(
		workspaceId: string,
		projectId: string,
		input: CreateAnalysisConfigInput,
	): Promise<AnalysisConfig>;
	list(projectId: string): Promise<AnalysisConfigWithCreators[]>;
	get(id: string): Promise<AnalysisConfigWithCreators>;
	update(id: string, input: UpdateAnalysisConfigInput): Promise<AnalysisConfig>;
	delete(id: string): Promise<void>;
	replaceCreators(configId: string, creatorIds: string[], projectId: string): Promise<void>;
	removeCreator(configId: string, creatorId: string): Promise<void>;
}
