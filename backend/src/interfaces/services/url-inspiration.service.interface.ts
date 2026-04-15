import type { InspirationSummary } from "../providers/inspiration-summarizer.interface";

export interface InspirationResult {
	url: string;
	kind: string;
	summary: InspirationSummary | null;
	status: "cached" | "scraped" | "fallback" | "failed";
	error?: string;
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
}
