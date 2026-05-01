import {
	type GeneratorTuning,
	generatorTuning,
	resolveThinkingBudget,
} from "../config/generator-tuning";
import { OpenRouterApiError } from "../errors/openrouter-api-error";
import type {
	BrandScrapingInput,
	BrandScrapingOutput,
	IBrandScraper,
} from "../interfaces/providers/brand-scraper.interface";
import type {
	BriefSummaryInput,
	BriefSummaryOutput,
	ICampaignBriefSummarizer,
} from "../interfaces/providers/campaign-brief-summarizer.interface";
import type {
	CampaignGenerationInput,
	CampaignGenerationOutput,
	ICampaignGenerator,
} from "../interfaces/providers/campaign-generator.interface";
import type {
	ContentGenerationInput,
	ContentGenerationOutput,
	IContentGenerator,
} from "../interfaces/providers/content-generator.interface";
import type {
	ITopicGenerator,
	TopicGenerationInput,
	TopicGenerationOutput,
} from "../interfaces/providers/topic-generator.interface";
import {
	buildBriefSummaryPrompt,
	buildCampaignGenerationPrompt,
	buildContentGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../utils/prompt-builder";
import { fetchUrlContent } from "../utils/url-fetcher";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

type TextContentPart = { type: "text"; text: string };
type ImageUrlContentPart = { type: "image_url"; image_url: { url: string } };
type MessageContentPart = TextContentPart | ImageUrlContentPart;

interface ChatCompletionMessage {
	role: "system" | "user" | "assistant";
	content: string | MessageContentPart[];
}

interface ChatCompletionResponse {
	choices: Array<{ message: { content: string } }>;
	usage?: { prompt_tokens: number; completion_tokens: number };
}

function parseJsonResponse(text: string): unknown {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) {
		cleaned = cleaned.slice(7);
	} else if (cleaned.startsWith("```")) {
		cleaned = cleaned.slice(3);
	}
	if (cleaned.endsWith("```")) {
		cleaned = cleaned.slice(0, -3);
	}
	return JSON.parse(cleaned.trim());
}

function languageDirective(language?: string): string {
	const normalized = (language ?? "indonesian").toLowerCase();
	if (normalized === "english" || normalized === "en") {
		return "Write all extracted text fields in English.";
	}
	return "Write all extracted text fields in Bahasa Indonesia.";
}

export class OpenRouterProvider
	implements
		IContentGenerator,
		ICampaignGenerator,
		ICampaignBriefSummarizer,
		ITopicGenerator,
		IBrandScraper
{
	public lastUsage: { inputTokens: number; outputTokens: number } | null = null;

	constructor(
		private apiKey: string,
		private model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	private async callOpenRouter(
		systemPrompt: string,
		userContent: ChatCompletionMessage["content"],
		tuning: GeneratorTuning,
	): Promise<string> {
		const messages: ChatCompletionMessage[] = [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userContent },
		];

		const body: Record<string, unknown> = {
			model: this.model,
			messages,
			max_tokens: tuning.maxOutputTokens,
			temperature: tuning.temperature,
		};

		const reasoningBudget = resolveThinkingBudget(tuning);
		if (reasoningBudget > 0) {
			body.reasoning = { max_tokens: reasoningBudget };
			body.max_tokens = tuning.maxOutputTokens + reasoningBudget;
		}

		const response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw await OpenRouterApiError.fromResponse(response);
		}

		const json = (await response.json()) as ChatCompletionResponse;
		this.lastUsage = json.usage
			? {
					inputTokens: json.usage.prompt_tokens,
					outputTokens: json.usage.completion_tokens,
				}
			: null;
		const content = json.choices[0]?.message?.content;
		if (!content) {
			throw new Error(
				`OpenRouterProvider: empty or missing content in response. Full response: ${JSON.stringify(json)}`,
			);
		}
		return content;
	}

	async generate(input: ContentGenerationInput): Promise<ContentGenerationOutput>;
	async generate(input: CampaignGenerationInput): Promise<CampaignGenerationOutput>;
	async generate(input: TopicGenerationInput): Promise<TopicGenerationOutput>;
	async generate(
		input: ContentGenerationInput | CampaignGenerationInput | TopicGenerationInput,
	): Promise<ContentGenerationOutput | CampaignGenerationOutput | TopicGenerationOutput> {
		if ("platform" in input && "contentType" in input) {
			return this.generateContent(input as ContentGenerationInput);
		} else if (
			"channelMix" in input ||
			("brandContext" in input && !("count" in input) && !("platform" in input))
		) {
			return this.generateCampaign(input as CampaignGenerationInput);
		} else {
			return this.generateTopics(input as TopicGenerationInput);
		}
	}

	private async generateContent(input: ContentGenerationInput): Promise<ContentGenerationOutput> {
		const { systemPrompt, userPrompt } = buildContentGenerationPrompt(input);

		const userContent: ChatCompletionMessage["content"] = input.referenceImages?.length
			? [
					...input.referenceImages.map(
						(url): ImageUrlContentPart => ({
							type: "image_url",
							image_url: { url },
						}),
					),
					{ type: "text", text: userPrompt },
				]
			: userPrompt;

		const text = await this.callOpenRouter(systemPrompt, userContent, generatorTuning.content);
		try {
			return parseJsonResponse(text) as ContentGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateCampaign(
		input: CampaignGenerationInput,
	): Promise<CampaignGenerationOutput> {
		const { systemPrompt, userPrompt } = buildCampaignGenerationPrompt(input);
		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.campaign);
		try {
			return parseJsonResponse(text) as CampaignGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse campaign generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
		const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);

		const userContent: ChatCompletionMessage["content"] = input.referenceImages?.length
			? [
					...input.referenceImages.map(
						(url): ImageUrlContentPart => ({
							type: "image_url",
							image_url: { url },
						}),
					),
					{ type: "text", text: userPrompt },
				]
			: userPrompt;

		const text = await this.callOpenRouter(systemPrompt, userContent, generatorTuning.topic);
		try {
			return parseJsonResponse(text) as TopicGenerationOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
			);
		}
	}

	async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
		const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);
		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.briefSummary);
		try {
			const parsed = parseJsonResponse(text) as BriefSummaryOutput;
			return {
				summary: parsed.summary ?? "",
				objective: parsed.objective ?? "",
				audienceHint: parsed.audienceHint ?? "",
				keyMessage: parsed.keyMessage ?? "",
				budgetHint: parsed.budgetHint ?? "",
				channelHint: Array.isArray(parsed.channelHint) ? parsed.channelHint : [],
				durationHint: {
					start: parsed.durationHint?.start ?? null,
					end: parsed.durationHint?.end ?? null,
				},
			};
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
			);
		}
	}

	async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		// Fetch actual page content via Jina Reader (with HTML fallback)
		const fetched = await fetchUrlContent(input.url);
		if (fetched.source === "failed" || !fetched.content) {
			throw new Error(
				`OpenRouterProvider: Could not fetch content from ${input.url}: ${fetched.error ?? "unknown error"}`,
			);
		}

		const baseSystemPrompt = `You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information.
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;
		const systemPrompt = input.skillContext
			? `${input.skillContext}\n\n${baseSystemPrompt}`
			: baseSystemPrompt;

		const userPrompt = `Based on the extracted website content below, extract structured brand information.

There are two groups of fields. Treat them differently:

=== TIER 1 — FACTUAL FIELDS (must be grounded in the page) ===
Only fill these if the website content actually states them. If not stated, use empty string "". Do NOT invent product names, founders, dates, metrics, claims, or quotes.
- name (string): Brand name
- category (string): Industry or product category (e.g. "SaaS", "F&B", "Fashion", "Healthcare", "Insurance")
- summary (string): 2-3 sentence brand description covering what they do, who they serve, and their mission
- brandPromise (string): Core brand promise or positioning statement (only if the page conveys one)
- usp (string): Unique selling points and key differentiators (only if stated or strongly implied by the page)

=== TIER 2 — STRATEGIC / SUBJECTIVE FIELDS (infer from Tier 1) ===
These are brand-strategy interpretations, not factual claims. Derive them from the brand's category, summary, and positioning. EVERY Tier 2 field MUST be populated with a reasonable, professional value appropriate for this kind of brand — never empty. If the page is minimal, use sensible defaults for the inferred category (e.g. a life-insurance brand → tone "Trustworthy, Reassuring, Professional"; dos "Lead with safety and peace of mind"; donts "Avoid fear-based or aggressive sales language").
- personality (string): Brand personality traits (e.g. "The Trusted Expert", "Bold Disruptor", "Friendly Guide")
- tone (string): Communication tone and style (e.g. "Professional, Conversational", "Bold, Playful", "Empathetic, Informative")
- targetAudience (string): Description of primary target audience — demographics, pain points, goals
- values (array of strings): 3-6 core brand values
- contentPillars (array of strings): 3-6 recurring content themes the brand should communicate about
- marketingStrategy (string): Overall marketing approach and focus areas
- dos (array of strings): 3-6 content rules to always follow when creating content for this brand
- donts (array of strings): 3-6 content rules to always avoid
- vocabulary (object with: preferred (array of strings), avoided (array of strings)): Brand vocabulary guidelines — preferred words/phrases and words to avoid

${languageDirective(input.language)}

=== EXTRACTED WEBSITE CONTENT ===
=== Source: ${fetched.url} (fetched via ${fetched.source}) ===
${fetched.content}`;

		const text = await this.callOpenRouter(systemPrompt, userPrompt, generatorTuning.brandScraper);
		try {
			return parseJsonResponse(text) as BrandScrapingOutput;
		} catch (_err) {
			throw new Error(
				`OpenRouterProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
			);
		}
	}
}
