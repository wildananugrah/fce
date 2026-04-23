import type { AnalysisConfig } from "@prisma/client";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../types/competitor-analyzer.types";

export interface IAnalysisConfigRepository {
	create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig>;

	findById(id: string): Promise<AnalysisConfigWithCreators | null>;

	findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]>;

	update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig>;

	delete(id: string): Promise<void>;

	/** Replaces the entire creator membership list atomically. */
	replaceCreators(configId: string, creatorIds: string[]): Promise<void>;

	/** Remove a single creator from a config. */
	removeCreator(configId: string, creatorId: string): Promise<void>;
}
