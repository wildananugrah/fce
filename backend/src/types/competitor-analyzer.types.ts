import type {
	AnalysisConfig,
	CompetitorPipelineRun,
	Creator,
	PipelineContent,
	PipelineScript,
} from "@prisma/client";

// ─── Creator ───────────────────────────────────────────────────

export interface CreateCreatorInput {
	profileUrl: string;
	username: string;
	platform: string; // "tiktok" only in v1 — enforced at service layer
	niche: string;
}

export interface UpdateCreatorInput {
	profileUrl?: string;
	niche?: string;
}

export interface CreatorFilters {
	platform?: string;
	niche?: string;
	includeArchived?: boolean;
}

// ─── Analysis Config ───────────────────────────────────────────

export interface CreateAnalysisConfigInput {
	name: string;
	targetNiche?: string;
	brandContext: string;
	analysisInstructions: string;
	outputPreferences: string;
}

export interface UpdateAnalysisConfigInput {
	name?: string;
	targetNiche?: string;
	brandContext?: string;
	analysisInstructions?: string;
	outputPreferences?: string;
}

export type AnalysisConfigWithCreators = AnalysisConfig & {
	creators: (Creator & { enrichmentStatus: string })[];
	_count?: { runs: number };
};

// ─── Pipeline Run ──────────────────────────────────────────────

export interface CreatePipelineRunInput {
	configId: string;
	videosPerCreator: number;
	lookbackPool: number;
	timeframeDays: number;
}

export type PipelineRunWithVideosAndScripts = CompetitorPipelineRun & {
	videos: PipelineContent[];
	scripts: PipelineScript[];
	config: AnalysisConfig | null;
};

// Input-validation constants — enforced at service layer & re-asserted in the job.
export const PIPELINE_INPUT_LIMITS = {
	videosPerCreatorMin: 1,
	videosPerCreatorMax: 10,
	lookbackPoolMin: 5,
	lookbackPoolMax: 50,
	timeframeDaysMin: 1,
	timeframeDaysMax: 90,
} as const;

// Terminal statuses — once a run is in any of these, no further transitions.
export const PIPELINE_TERMINAL_STATUSES = new Set(["completed", "failed"]);

// ─── Gemini Video Analysis Response Shape ──────────────────────

export interface VideoAnalysisResult {
	hook: string;
	retentionMechanisms: string[];
	pacingNotes: string;
	onScreenText: string[];
	audioStyle: string;
	whyItWentViral: string;
	ctaAnalysis: string;
}

// ─── Gemini Script Generation Response Shape ───────────────────

export interface GeneratedScript {
	scriptNumber: number;
	title?: string;
	hook: string;
	body: string;
	broll?: Array<{ scene: string; description: string }>;
	cta: string;
	sourceVideoId?: string;
}
