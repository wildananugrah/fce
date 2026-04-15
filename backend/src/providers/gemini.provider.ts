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
	IInspirationSummarizer,
	InspirationSummary,
} from "../interfaces/providers/inspiration-summarizer.interface";
import type {
	ITopicGenerator,
	TopicGenerationInput,
	TopicGenerationOutput,
} from "../interfaces/providers/topic-generator.interface";
import {
	buildCampaignGenerationPrompt,
	buildContentGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../utils/prompt-builder";
import { fetchUrlContent } from "../utils/url-fetcher";

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

	async scrapeProduct(input: { url: string }): Promise<{
		name?: string;
		type?: string;
		priceTier?: string;
		summary?: string;
		usp?: string;
		rtb?: string;
		functionalBenefits?: string[];
		emotionalBenefits?: string[];
		targetAudience?: string;
	}> {
		// Fetch actual page content via Jina Reader (with HTML fallback)
		const fetched = await fetchUrlContent(input.url);
		if (fetched.source === "failed" || !fetched.content) {
			throw new Error(
				`GeminiProvider: Could not fetch content from ${input.url}: ${fetched.error ?? "unknown error"}`,
			);
		}

		const systemPrompt =
			"You are a product marketing expert. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";
		const userPrompt = `Based on the extracted product page content below, extract structured product information.

Use empty string "" or empty array [] for fields you cannot determine from the content. Do not hallucinate facts.

Return JSON with these exact fields:
- name (string): Product name
- type (string): Product type (e.g. "Service", "SaaS", "Physical", "Insurance")
- priceTier (string): Price tier if detectable (e.g. "Premium", "Mid-range", "Budget")
- summary (string): What this product does, who it's for, key value proposition (2-3 sentences)
- usp (string): Unique selling proposition — what makes it uniquely valuable
- rtb (string): Reason to believe — evidence, proof points, credentials, certifications
- functionalBenefits (array of strings): 3-6 practical benefits (e.g. "Saves 10 hours/week", "Covers up to $1M in liability")
- emotionalBenefits (array of strings): 3-6 emotional benefits (e.g. "Feel confident", "Peace of mind", "Sense of security")
- targetAudience (string): Who this product is for — demographics, pain points, goals

=== EXTRACTED PRODUCT PAGE CONTENT ===
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
			return parseJsonResponse(text);
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
