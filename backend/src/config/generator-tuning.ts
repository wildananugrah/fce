/**
 * Per-generator AI tuning. Provider-agnostic — each provider translates
 * these into its own SDK parameter names (see `anthropicParams` /
 * `geminiConfig` helpers in the corresponding provider files).
 *
 * Tune these numbers freely; this is the single source of truth.
 */

export interface GeneratorTuning {
	/** Hard cap on response length. Maps to Anthropic max_tokens / Gemini maxOutputTokens. */
	maxOutputTokens: number;
	/** 0 = deterministic, 1 = creative. Both providers use the same scale. */
	temperature: number;
	/**
	 * Extended-thinking budget in tokens. 0 (or omit) disables it.
	 * - Anthropic: maps to thinking.budget_tokens; only Sonnet/Opus 4+ honor it.
	 *   When enabled, the SDK requires temperature: 1 and max_tokens > budget_tokens —
	 *   the adapter forces both, so the configured `temperature` is ignored.
	 * - Gemini: maps to thinkingConfig.thinkingBudget; only Gemini 2.5+ honors it.
	 *   Older models silently ignore.
	 */
	thinkingBudget?: number;
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
	chat: { maxOutputTokens: 4096, temperature: 0.5 },
};
