/**
 * Per-generator AI tuning. Provider-agnostic — each provider translates
 * these into its own SDK parameter names (see `anthropicParams` /
 * `geminiConfig` helpers in the corresponding provider files).
 *
 * Tune these numbers freely; this is the single source of truth.
 */

export type ThinkingLevel = "low" | "medium" | "high";

/**
 * Map level → token budget. Tweak these to taste; both providers' minimums
 * are 1024 (Anthropic) so all three values stay safely above that.
 */
export const THINKING_LEVEL_BUDGETS: Record<ThinkingLevel, number> = {
	low: 2000,
	medium: 5000,
	high: 10000,
};

export interface GeneratorTuning {
	/** Hard cap on response length. Maps to Anthropic max_tokens / Gemini maxOutputTokens. */
	maxOutputTokens: number;
	/** 0 = deterministic, 1 = creative. Both providers use the same scale. */
	temperature: number;
	/**
	 * Extended-thinking budget in tokens. Explicit override. 0 (or omit) disables.
	 * If both `thinkingBudget` and `thinkingLevel` are set, this wins.
	 * - Anthropic: maps to thinking.budget_tokens; only Sonnet/Opus 4+ honor it.
	 *   When enabled, the SDK requires temperature: 1 and max_tokens > budget_tokens —
	 *   the adapter forces both, so the configured `temperature` is ignored.
	 * - Gemini: maps to thinkingConfig.thinkingBudget; only Gemini 2.5+ honors it.
	 *   Older models silently ignore.
	 */
	thinkingBudget?: number;
	/**
	 * Convenience knob — pick a level instead of a token count.
	 * Resolved to a budget via THINKING_LEVEL_BUDGETS. Ignored if `thinkingBudget`
	 * is also set (explicit beats convenience).
	 */
	thinkingLevel?: ThinkingLevel;
}

/**
 * Resolve the effective thinking budget for a tuning entry.
 *   - explicit `thinkingBudget` wins
 *   - else look up `thinkingLevel` in THINKING_LEVEL_BUDGETS
 *   - else 0 (no thinking)
 * Used by both `anthropicParams` and `geminiConfig`.
 */
export function resolveThinkingBudget(t: GeneratorTuning): number {
	if (t.thinkingBudget !== undefined) return t.thinkingBudget;
	if (t.thinkingLevel !== undefined) return THINKING_LEVEL_BUDGETS[t.thinkingLevel];
	return 0;
}

export type GeneratorKey =
	| "content" // generateContent — final post copy
	| "campaign" // generateCampaign — multi-post campaign brief
	| "topic" // generateTopics — bulk topic ideation (and topic regen, count=1)
	| "productBrain" // generateProductBrain — manual "Generate with AI" on product form
	| "productScraper" // scrapeProduct — product page → product brain auto-fill
	| "brandScraper" // scrape — site → brand DNA
	| "briefSummary" // summarizeBrief — campaign PDF synthesis text
	| "urlInspiration" // summarizeInspiration — URL inspiration summarizer (Gemini-only call site)
	| "urlInspirationVideo" // NEW — Gemini Video Analyzer call inside enrichWithVideo
	| "chat"; // ChatService (campaign chat) via *-chat.provider.ts

export const generatorTuning: Record<GeneratorKey, GeneratorTuning> = {
	content: { maxOutputTokens: 4096, temperature: 0.7, thinkingBudget: 4000 },
	campaign: { maxOutputTokens: 4096, temperature: 0.5, thinkingBudget: 6000 },
	topic: { maxOutputTokens: 4096, temperature: 0.8, thinkingBudget: 3000 },
	productBrain: { maxOutputTokens: 2500, temperature: 0.4 },
	productScraper: { maxOutputTokens: 3000, temperature: 0.2 },
	brandScraper: { maxOutputTokens: 3000, temperature: 0.2 },
	briefSummary: { maxOutputTokens: 4096, temperature: 0.3 },
	urlInspiration: { maxOutputTokens: 2000, temperature: 0.3 },
	urlInspirationVideo: { maxOutputTokens: 3000, temperature: 0.3 },
	chat: { maxOutputTokens: 4096, temperature: 0.5 },
};
