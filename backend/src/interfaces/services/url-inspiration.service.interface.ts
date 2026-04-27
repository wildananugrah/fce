import type { InspirationSummary } from "../providers/inspiration-summarizer.interface";

export interface InspirationResult {
	url: string;
	kind: string;
	summary: InspirationSummary | null;
	status: "cached" | "scraped" | "fallback" | "failed";
	error?: string;
	media?: InspirationMedia;
}

export interface IUrlInspirationService {
	getInspiration(
		workspaceId: string,
		url: string,
		userId?: string,
	): Promise<InspirationResult>;
	getInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]>;
	/**
	 * Like getInspiration, but for video URLs additionally downloads the
	 * video (or passes a fileUri for YouTube), runs Gemini video analysis,
	 * and merges the analysis into the inspiration summary. Always returns
	 * at least a text-only result; never throws on video-stage failures.
	 */
	enrichWithVideo(workspaceId: string, url: string, userId?: string): Promise<InspirationResult>;
	/**
	 * Bulk variant for the topic/content generation jobs. Processes URLs
	 * extracted from the prompt SEQUENTIALLY (not in parallel) to bound
	 * worst-case latency.
	 */
	enrichInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]>;
}

export interface MediaSkipped {
	reason:
		| "size cap exceeded"
		| "duration cap exceeded"
		| "duration unknown"
		| "fetch failed"
		| "analysis failed"
		| "video analysis requires Gemini";
	sizeMb?: number;
	durationSeconds?: number;
	capMb?: number;
	capSeconds?: number;
}

export interface InspirationMedia {
	hasVideo: boolean;
	durationSeconds?: number;
	sizeMb?: number;
	skipped?: MediaSkipped;
}
