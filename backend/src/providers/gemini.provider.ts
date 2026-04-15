import { GoogleGenAI } from "@google/genai";
import type {
	BrandScrapingInput,
	BrandScrapingOutput,
	IBrandScraper,
} from "../interfaces/providers/brand-scraper.interface";
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
	BriefSummaryInput,
	BriefSummaryOutput,
	ICampaignBriefSummarizer,
} from "../interfaces/providers/campaign-brief-summarizer.interface";
import type {
	IInspirationSummarizer,
	InspirationSummary,
} from "../interfaces/providers/inspiration-summarizer.interface";
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
import { extractOgImage, fetchMultipleUrls, fetchUrlContent } from "../utils/url-fetcher";

// Map a language code from the UI to a directive sentence appended to AI
// scraping prompts. Defaults to Bahasa Indonesia.
function languageDirective(language?: string): string {
	const normalized = (language ?? "indonesian").toLowerCase();
	if (normalized === "english" || normalized === "en") {
		return "Write all extracted text fields in English.";
	}
	return "Write all extracted text fields in Bahasa Indonesia.";
}

function parseJsonResponse(text: string): any {
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

export class GeminiProvider
	implements
		IContentGenerator,
		ICampaignGenerator,
		ICampaignBriefSummarizer,
		ITopicGenerator,
		IBrandScraper,
		IInspirationSummarizer
{
	private ai: GoogleGenAI;
	public lastUsage: { inputTokens: number; outputTokens: number } | null = null;
	// Exposed after each call so callers can log the exact prompts and response
	// sent to / received from the AI. Used by UrlInspirationService to log to
	// AiProviderLog for dispute resolution and token tracking.
	public lastPrompts: { systemPrompt: string; userPrompt: string } | null = null;
	public lastResponseText: string | null = null;

	constructor(
		apiKey: string,
		private model: string,
	) {
		this.ai = new GoogleGenAI({ apiKey });
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

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: {
				temperature: 0,
				systemInstruction: systemPrompt,
			},
			contents: input.referenceImages?.length
				? [
						...input.referenceImages.map((url) => ({
							fileData: { fileUri: url, mimeType: "image/jpeg" },
						})),
						{ text: userPrompt },
					]
				: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text) as ContentGenerationOutput;
		} catch (_err) {
			throw new Error(
				`GeminiProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateCampaign(
		input: CampaignGenerationInput,
	): Promise<CampaignGenerationOutput> {
		const { systemPrompt, userPrompt } = buildCampaignGenerationPrompt(input);

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: {
				temperature: 0,
				systemInstruction: systemPrompt,
			},
			contents: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text) as CampaignGenerationOutput;
		} catch (_err) {
			throw new Error(
				`GeminiProvider: Failed to parse campaign generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
		const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: {
				temperature: 0,
				systemInstruction: systemPrompt,
			},
			contents: input.referenceImages?.length
				? [
						...input.referenceImages.map((url) => ({
							fileData: { fileUri: url, mimeType: "image/jpeg" },
						})),
						{ text: userPrompt },
					]
				: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text) as TopicGenerationOutput;
		} catch (_err) {
			throw new Error(
				`GeminiProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
			);
		}
	}

	async generateProductBrain(input: {
		productName: string;
		brandName: string;
		productType?: string;
		priceTier?: string;
		summary?: string;
	}): Promise<{
		usp?: string;
		rtb?: string;
		functionalBenefits?: string[];
		emotionalBenefits?: string[];
		targetAudience?: string;
		summary?: string;
	}> {
		const context = [
			`Product: ${input.productName}`,
			`Brand: ${input.brandName}`,
			input.productType ? `Type: ${input.productType}` : "",
			input.priceTier ? `Price Tier: ${input.priceTier}` : "",
			input.summary ? `Description: ${input.summary}` : "",
		]
			.filter(Boolean)
			.join("\n");

		const systemPrompt =
			"You are a product marketing expert. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";
		const userPrompt = `Based on the following product information, generate product brain content for AI-powered content generation.

${context}

Return JSON with these fields:
- summary (string): A compelling product summary if not already provided
- usp (string): Unique selling proposition — what makes this product uniquely valuable
- rtb (string): Reason to believe — evidence or proof points that support the USP
- functionalBenefits (array of strings): Practical benefits (e.g. "Saves 10 hours/week")
- emotionalBenefits (array of strings): Emotional benefits (e.g. "Feel confident", "Peace of mind")
- targetAudience (string): Who this product is for — demographics, pain points, goals`;

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: { temperature: 0, systemInstruction: systemPrompt },
			contents: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text);
		} catch {
			throw new Error("Failed to parse AI response for product brain generation");
		}
	}

	async scrapeProduct(input: {
		url?: string;
		urls?: string[];
		language?: string;
	}): Promise<{
		name?: string;
		type?: string;
		priceTier?: string;
		summary?: string;
		usp?: string;
		rtb?: string;
		functionalBenefits?: string[];
		emotionalBenefits?: string[];
		targetAudience?: string;
		imageUrl?: string;
	}> {
		// Collect all source URLs. Supports both legacy { url } and the
		// multi-source { urls } form so callers can pass a brand website plus
		// social profiles for richer extraction.
		const sourceUrls =
			input.urls && input.urls.length > 0 ? input.urls : input.url ? [input.url] : [];
		if (sourceUrls.length === 0) {
			throw new Error("GeminiProvider: at least one URL is required for product scraping");
		}

		// Fetch page text and the og:image hero in parallel — image extraction
		// uses the raw HTML that Jina Reader strips out.
		const [{ combined, results }, ogImageUrl] = await Promise.all([
			fetchMultipleUrls(sourceUrls),
			extractOgImage(sourceUrls[0]),
		]);
		const anySuccess = results.some((r) => r.source !== "failed" && r.content);
		if (!anySuccess) {
			throw new Error(
				`GeminiProvider: Could not fetch content from any of: ${sourceUrls.join(", ")}`,
			);
		}

		const systemPrompt =
			"You are a product analyst. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";
		const userPrompt = `You are a product analyst. Based on the extracted website and social media content below, extract structured product information.

Return ONLY a valid JSON object with these exact fields (use empty string "" or empty array [] if not found):
{
  "name": "Product name",
  "type": "Type of product (e.g. SaaS, Physical Product, Service, Mobile App, Insurance)",
  "priceTier": "Pricing positioning (e.g. Premium, Mid-range, Budget, Freemium, Enterprise)",
  "summary": "2-3 sentence description of what this product does and who it's for",
  "usp": "The single most compelling reason to choose this product over alternatives",
  "rtb": "Evidence or proof points backing up the USP (e.g. stats, awards, testimonials, certifications)",
  "functionalBenefits": ["Tangible benefit #1", "Tangible benefit #2", "Tangible benefit #3"],
  "emotionalBenefits": ["Emotional benefit #1", "Emotional benefit #2"],
  "targetAudience": "Description of the primary target customer (demographics, psychographics, job role, pain points)"
}

Do not hallucinate. If the content does not support a field, leave it as "" or [].

${languageDirective(input.language)}

=== EXTRACTED WEBSITE AND SOCIAL MEDIA CONTENT ===
${combined}`;

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: { temperature: 0, systemInstruction: systemPrompt },
			contents: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastPrompts = { systemPrompt, userPrompt };
		this.lastResponseText = response.text ?? "";

		const text = response.text ?? "";
		try {
			const parsed = parseJsonResponse(text) as Record<string, unknown>;
			if (ogImageUrl) parsed.imageUrl = ogImageUrl;
			return parsed;
		} catch {
			throw new Error("Failed to parse AI response for product scraping");
		}
	}

	async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		// Fetch actual page content via Jina Reader (with HTML fallback).
		// Without this, the AI has no real data to analyze — it can only
		// guess based on training knowledge of the brand name.
		const fetched = await fetchUrlContent(input.url);
		if (fetched.source === "failed" || !fetched.content) {
			throw new Error(
				`GeminiProvider: Could not fetch content from ${input.url}: ${fetched.error ?? "unknown error"}`,
			);
		}

		const systemPrompt =
			"You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";

		const userPrompt = `Based on the extracted website content below, extract structured brand information.

Use empty string "" or empty array [] for fields you cannot determine from the content. Do not hallucinate facts.

Return JSON with these exact fields:
- name (string): Brand name
- category (string): Industry or product category (e.g. "SaaS", "F&B", "Fashion", "Healthcare", "Insurance")
- summary (string): 2-3 sentence brand description covering what they do, who they serve, and their mission
- personality (string): Brand personality traits (e.g. "The Trusted Expert", "Bold Disruptor", "Friendly Guide")
- tone (string): Communication tone and style (e.g. "Professional, Conversational", "Bold, Playful", "Empathetic, Informative")
- targetAudience (string): Description of primary target audience — demographics, pain points, goals
- brandPromise (string): Core brand promise or positioning statement
- usp (string): Unique selling points and key differentiators vs competitors
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

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: { temperature: 0, systemInstruction: systemPrompt },
			contents: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastPrompts = { systemPrompt, userPrompt };
		this.lastResponseText = response.text ?? "";

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text) as BrandScrapingOutput;
		} catch (_err) {
			throw new Error(
				`GeminiProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
			);
		}
	}

	async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
		const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: { temperature: 0, systemInstruction: systemPrompt },
			contents: userPrompt,
		});
		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastPrompts = { systemPrompt, userPrompt };
		this.lastResponseText = response.text ?? "";

		const text = response.text ?? "";
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
				`GeminiProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
			);
		}
	}

	async summarizeInspiration(rawData: unknown): Promise<InspirationSummary> {
		const systemPrompt = `You are a content strategist. Analyze social media posts and articles to extract their creative essence so another creator can generate similar ideas.

You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

		const userPrompt = `Analyze the following source data and extract its creative essence.

SOURCE DATA:
${JSON.stringify(rawData).slice(0, 6000)}

Return JSON with these fields:
- angle (string): What is this post about? What's the hook?
- tone (string): Tone and style (e.g., "Educational, warm, confident")
- keyPoints (array of strings): 2-5 core claims or messages from the post
- format (string): Format clues — carousel, reel, article, short video, long-form post, etc.
- hashtags (array of strings, optional): Top hashtags used if present in source data
- engagementSignal (string, optional): Only include if engagement metrics suggest a standout post (e.g., "High engagement: 50k+ likes")`;

		const response = await this.ai.models.generateContent({
			model: this.model,
			config: {
				temperature: 0,
				systemInstruction: systemPrompt,
			},
			contents: userPrompt,
		});

		this.lastUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastPrompts = { systemPrompt, userPrompt };
		this.lastResponseText = response.text ?? "";

		const text = response.text ?? "";
		try {
			return parseJsonResponse(text) as InspirationSummary;
		} catch (_err) {
			throw new Error(
				`GeminiProvider: Failed to parse inspiration summary. Raw: ${text}`,
			);
		}
	}
}
