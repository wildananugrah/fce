import { api } from "./api";

// ─── Types (mirror backend Prisma types at runtime ergonomics) ─────

export interface Creator {
	id: string;
	workspaceId: string;
	projectId: string;
	platform: string;
	profileUrl: string;
	username: string;
	displayName: string | null;
	niche: string;
	followerCount: number | null;
	avatarUrl: string | null;
	bio: string | null;
	platformMetadata: Record<string, unknown> | null;
	enrichmentStatus: "pending" | "enriched" | "failed";
	enrichmentError: string | null;
	lastEnrichedAt: string | null;
	archivedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AnalysisConfig {
	id: string;
	name: string;
	targetNiche: string | null;
	brandContext: string;
	analysisInstructions: string;
	outputPreferences: string;
	creators: Creator[];
	_count?: { runs: number };
	createdAt: string;
	updatedAt: string;
}

export interface PipelineRun {
	id: string;
	configId: string | null;
	userId: string;
	videosPerCreator: number;
	lookbackPool: number;
	timeframeDays: number;
	status: "pending" | "scraping" | "analyzing" | "generating" | "completed" | "failed" | "cancelling";
	stage: string | null;
	errorMessage: string | null;
	startedAt: string | null;
	completedAt: string | null;
	createdAt: string;
}

export interface PipelineContent {
	id: string;
	runId: string;
	creatorId: string;
	platform: string;
	platformPostId: string;
	contentType: string;
	contentUrl: string;
	thumbnailUrl: string | null;
	caption: string | null;
	viewCount: number | null;
	likeCount: number | null;
	shareCount: number | null;
	commentCount: number | null;
	hashtags: string[] | null;
	postedAt: string | null;
	analysisStatus: "pending" | "running" | "completed" | "failed";
	analysisJson: {
		hook: string;
		retentionMechanisms: string[];
		pacingNotes: string;
		onScreenText: string[];
		audioStyle: string;
		whyItWentViral: string;
		ctaAnalysis: string;
	} | null;
	analysisError: string | null;
	createdAt: string;
}

export interface PipelineScript {
	id: string;
	runId: string;
	sourceVideoId: string | null;
	scriptNumber: number;
	title: string | null;
	hook: string | null;
	body: string | null;
	broll: Array<{ scene: string; description: string }> | null;
	cta: string | null;
	rawContent: unknown;
	createdAt: string;
}

export type PipelineRunDetail = PipelineRun & {
	videos: PipelineContent[];
	scripts: PipelineScript[];
	config: AnalysisConfig | null;
};

// ─── Helpers ───────────────────────────────────────────────────

function basePath(workspaceId: string, projectId: string): string {
	return `/api/workspaces/${workspaceId}/projects/${projectId}/competitor-analyzer`;
}

// Note: `api<T>()` returns `json.data` directly — do NOT destructure a
// wrapper `{ data: T }` shape. See frontend/src/services/api.ts.

// ─── Creators ──────────────────────────────────────────────────

export async function listCreators(
	workspaceId: string,
	projectId: string,
	opts?: { includeArchived?: boolean; niche?: string },
): Promise<Creator[]> {
	const qs = new URLSearchParams();
	if (opts?.includeArchived) qs.set("includeArchived", "true");
	if (opts?.niche) qs.set("niche", opts.niche);
	const url = `${basePath(workspaceId, projectId)}/creators${qs.toString() ? `?${qs}` : ""}`;
	return api<Creator[]>(url);
}

export async function createCreator(
	workspaceId: string,
	projectId: string,
	input: { profileUrl: string; username: string; niche: string; platform?: string },
): Promise<Creator> {
	return api<Creator>(`${basePath(workspaceId, projectId)}/creators`, {
		method: "POST",
		body: JSON.stringify({ ...input, platform: input.platform ?? "tiktok" }),
	});
}

export async function archiveCreator(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/creators/${id}`, { method: "DELETE" });
}

export async function refreshCreator(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<Creator> {
	return api<Creator>(`${basePath(workspaceId, projectId)}/creators/${id}/refresh`, {
		method: "POST",
	});
}

// ─── Configs ───────────────────────────────────────────────────

export async function listConfigs(
	workspaceId: string,
	projectId: string,
): Promise<AnalysisConfig[]> {
	return api<AnalysisConfig[]>(`${basePath(workspaceId, projectId)}/configs`);
}

export async function getConfig(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<AnalysisConfig> {
	return api<AnalysisConfig>(`${basePath(workspaceId, projectId)}/configs/${id}`);
}

export async function createConfig(
	workspaceId: string,
	projectId: string,
	input: {
		name: string;
		targetNiche?: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	},
): Promise<AnalysisConfig> {
	return api<AnalysisConfig>(`${basePath(workspaceId, projectId)}/configs`, {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export async function updateConfig(
	workspaceId: string,
	projectId: string,
	id: string,
	input: Partial<{
		name: string;
		targetNiche: string;
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
	}>,
): Promise<AnalysisConfig> {
	return api<AnalysisConfig>(`${basePath(workspaceId, projectId)}/configs/${id}`, {
		method: "PATCH",
		body: JSON.stringify(input),
	});
}

export async function deleteConfig(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/configs/${id}`, { method: "DELETE" });
}

export async function replaceConfigCreators(
	workspaceId: string,
	projectId: string,
	configId: string,
	creatorIds: string[],
): Promise<void> {
	await api(`${basePath(workspaceId, projectId)}/configs/${configId}/creators`, {
		method: "PUT",
		body: JSON.stringify({ creatorIds }),
	});
}

// ─── Runs ──────────────────────────────────────────────────────

export async function listRuns(
	workspaceId: string,
	projectId: string,
): Promise<PipelineRun[]> {
	return api<PipelineRun[]>(`${basePath(workspaceId, projectId)}/runs`);
}

export async function getRun(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<PipelineRunDetail> {
	return api<PipelineRunDetail>(`${basePath(workspaceId, projectId)}/runs/${id}`);
}

export async function createRun(
	workspaceId: string,
	projectId: string,
	input: {
		configId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	},
): Promise<PipelineRun> {
	return api<PipelineRun>(`${basePath(workspaceId, projectId)}/runs`, {
		method: "POST",
		body: JSON.stringify(input),
	});
}

export async function cancelRun(
	workspaceId: string,
	projectId: string,
	id: string,
): Promise<PipelineRun> {
	return api<PipelineRun>(`${basePath(workspaceId, projectId)}/runs/${id}/cancel`, {
		method: "POST",
	});
}
