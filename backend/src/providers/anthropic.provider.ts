import Anthropic from "@anthropic-ai/sdk";
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

export class AnthropicProvider
	implements IContentGenerator, ICampaignGenerator, ITopicGenerator, IBrandScraper
{
	private client: Anthropic;
	public lastUsage: { inputTokens: number; outputTokens: number } | null = null;

	constructor(
		apiKey: string,
		private model: string,
	) {
		this.client = new Anthropic({ apiKey });
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

		const userContent = input.referenceImages?.length
			? [
					...input.referenceImages.map((url) => ({
						type: "image" as const,
						source: { type: "url" as const, url },
					})),
					{ type: "text" as const, text: userPrompt },
				]
			: userPrompt;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			temperature: 0,
			system: systemPrompt,
			messages: [{ role: "user", content: userContent }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text) as ContentGenerationOutput;
		} catch (_err) {
			throw new Error(
				`AnthropicProvider: Failed to parse content generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateCampaign(
		input: CampaignGenerationInput,
	): Promise<CampaignGenerationOutput> {
		const { systemPrompt, userPrompt } = buildCampaignGenerationPrompt(input);

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			temperature: 0,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text) as CampaignGenerationOutput;
		} catch (_err) {
			throw new Error(
				`AnthropicProvider: Failed to parse campaign generation response as JSON. Raw: ${text}`,
			);
		}
	}

	private async generateTopics(input: TopicGenerationInput): Promise<TopicGenerationOutput> {
		const { systemPrompt, userPrompt } = buildTopicGenerationPrompt(input);

		const userContent = input.referenceImages?.length
			? [
					...input.referenceImages.map((url) => ({
						type: "image" as const,
						source: { type: "url" as const, url },
					})),
					{ type: "text" as const, text: userPrompt },
				]
			: userPrompt;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			temperature: 0,
			system: systemPrompt,
			messages: [{ role: "user", content: userContent }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text) as TopicGenerationOutput;
		} catch (_err) {
			throw new Error(
				`AnthropicProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
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

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 1024,
			temperature: 0,
			system:
				"You are a product marketing expert. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.",
			messages: [
				{
					role: "user",
					content: `Based on the following product information, generate product brain content for AI-powered content generation.

${context}

Return JSON with these fields:
- summary (string): A compelling product summary if not already provided
- usp (string): Unique selling proposition — what makes this product uniquely valuable
- rtb (string): Reason to believe — evidence or proof points that support the USP
- functionalBenefits (array of strings): Practical benefits (e.g. "Saves 10 hours/week")
- emotionalBenefits (array of strings): Emotional benefits (e.g. "Feel confident", "Peace of mind")
- targetAudience (string): Who this product is for — demographics, pain points, goals`,
				},
			],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
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
				`AnthropicProvider: Could not fetch content from ${input.url}: ${fetched.error ?? "unknown error"}`,
			);
		}

		const userPrompt = `Based on the extracted product page content below, extract structured product information.

Use empty string "" or empty array [] for fields you cannot determine from the content. Do not hallucinate facts.

Return JSON with these exact fields:
- name (string): Product name
- type (string): Product type (e.g. "Service", "SaaS", "Physical", "Insurance")
- priceTier (string): Price tier if detectable (e.g. "Premium", "Mid-range", "Budget")
- summary (string): What this product does, who it's for, key value proposition (2-3 sentences)
- usp (string): Unique selling proposition — what makes it uniquely valuable
- rtb (string): Reason to believe — evidence, proof points, credentials
- functionalBenefits (array of strings): 3-6 practical benefits
- emotionalBenefits (array of strings): 3-6 emotional benefits
- targetAudience (string): Who this product is for — demographics, pain points, goals

=== EXTRACTED PRODUCT PAGE CONTENT ===
=== Source: ${fetched.url} (fetched via ${fetched.source}) ===
${fetched.content}`;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 1500,
			temperature: 0,
			system:
				"You are a product marketing expert. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.",
			messages: [{ role: "user", content: userPrompt }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text);
		} catch {
			throw new Error("Failed to parse AI response for product scraping");
		}
	}

	async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		// Fetch actual page content via Jina Reader (with HTML fallback)
		const fetched = await fetchUrlContent(input.url);
		if (fetched.source === "failed" || !fetched.content) {
			throw new Error(
				`AnthropicProvider: Could not fetch content from ${input.url}: ${fetched.error ?? "unknown error"}`,
			);
		}

		const systemPrompt = `You are a brand analyst expert. Analyze the provided website content and extract structured brand identity information.
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

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

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			temperature: 0,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text) as BrandScrapingOutput;
		} catch (_err) {
			throw new Error(
				`AnthropicProvider: Failed to parse brand scraping response as JSON. Raw: ${text}`,
			);
		}
	}
}
