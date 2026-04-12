import { api } from "./api";

export interface ResearchRun {
	id: string;
	workspaceId: string;
	userId: string;
	brandId: string | null;
	actorType: string;
	actorId: string;
	input: Record<string, any>;
	apifyRunId: string | null;
	status: "pending" | "running" | "completed" | "failed";
	errorMessage: string | null;
	resultCount: number;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
	brand?: { name: string } | null;
	user?: { fullName: string | null; email: string };
}

export interface ResearchResult {
	id: string;
	runId: string;
	dataType: "page_content" | "social_post" | "trend" | "search_result";
	title: string | null;
	url: string | null;
	content: string;
	metadata: Record<string, any>;
	scrapedAt: string;
	createdAt: string;
}

export interface WorkspaceResearchSettings {
	hasApifyKey: boolean;
	maskedKey?: string;
}

export const researchApi = {
	getSettings(workspaceId: string) {
		return api<WorkspaceResearchSettings>(
			`/api/workspaces/${workspaceId}/research/settings`,
		);
	},

	setApifyKey(workspaceId: string, apiKey: string) {
		return api<{ success: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify`,
			{ method: "PUT", body: JSON.stringify({ apiKey }) },
		);
	},

	testApifyKey(workspaceId: string) {
		return api<{ connected: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify/test`,
			{ method: "POST" },
		);
	},

	removeApifyKey(workspaceId: string) {
		return api<{ success: boolean }>(
			`/api/workspaces/${workspaceId}/research/settings/apify`,
			{ method: "DELETE" },
		);
	},

	createRun(
		workspaceId: string,
		data: {
			actorType: string;
			input: Record<string, any>;
			brandId?: string;
		},
	) {
		return api<ResearchRun>(
			`/api/workspaces/${workspaceId}/research/runs`,
			{ method: "POST", body: JSON.stringify(data) },
		);
	},

	listRuns(
		workspaceId: string,
		filters?: { actorType?: string; status?: string; brandId?: string },
	) {
		const params = new URLSearchParams();
		if (filters?.actorType) params.set("actorType", filters.actorType);
		if (filters?.status) params.set("status", filters.status);
		if (filters?.brandId) params.set("brandId", filters.brandId);
		const qs = params.toString() ? `?${params.toString()}` : "";
		return api<ResearchRun[]>(
			`/api/workspaces/${workspaceId}/research/runs${qs}`,
		);
	},

	getRun(workspaceId: string, runId: string) {
		return api<ResearchRun & { results: ResearchResult[] }>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}`,
		);
	},

	getRunResults(
		workspaceId: string,
		runId: string,
		skip = 0,
		take = 50,
	) {
		return api<ResearchResult[]>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}/results?skip=${skip}&take=${take}`,
		);
	},

	getResultAsContext(
		workspaceId: string,
		runId: string,
		resultId: string,
	) {
		return api<{ context: string }>(
			`/api/workspaces/${workspaceId}/research/runs/${runId}/results/${resultId}/as-context`,
		);
	},
};
