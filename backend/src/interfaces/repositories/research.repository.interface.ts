import type { ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { ResearchRunFilters } from "../../types/research.types";

export interface IResearchRepository {
	findRunsByWorkspace(
		workspaceId: string,
		filters?: ResearchRunFilters,
	): Promise<
		(ResearchRun & {
			brand: { name: string } | null;
			user: { fullName: string | null; email: string };
		})[]
	>;
	findRunById(id: string): Promise<(ResearchRun & { results: ResearchResult[] }) | null>;
	createRun(data: {
		workspaceId: string;
		userId: string;
		brandId?: string;
		actorType: string;
		actorId: string;
		input: any;
	}): Promise<ResearchRun>;
	updateRun(id: string, data: Partial<ResearchRun>): Promise<ResearchRun>;
	createResults(
		runId: string,
		workspaceId: string,
		results: Array<{
			dataType: string;
			title?: string;
			url?: string;
			content: string;
			metadata: any;
			scrapedAt: Date;
		}>,
	): Promise<number>;
	findResultById(id: string): Promise<ResearchResult | null>;
	findResultsByRun(runId: string, skip?: number, take?: number): Promise<ResearchResult[]>;
	getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null>;
	upsertWorkspaceSetting(
		workspaceId: string,
		data: { apifyApiKey?: string | null },
	): Promise<WorkspaceSetting>;
}
