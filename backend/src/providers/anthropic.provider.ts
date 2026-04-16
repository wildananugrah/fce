import Anthropic from "@anthropic-ai/sdk";
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
import { extractOgImage, fetchMultipleUrls, fetchUrlContent } from "../utils/url-fetcher";

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

export class AnthropicProvider
	implements IContentGenerator, ICampaignGenerator, ICampaignBriefSummarizer, ITopicGenerator, IBrandScraper
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
		const sourceUrls =
			input.urls && input.urls.length > 0 ? input.urls : input.url ? [input.url] : [];
		if (sourceUrls.length === 0) {
			throw new Error("AnthropicProvider: at least one URL is required for product scraping");
		}

		const [{ combined, results }, ogImageUrl] = await Promise.all([
			fetchMultipleUrls(sourceUrls),
			extractOgImage(sourceUrls[0]),
		]);
		const anySuccess = results.some((r) => r.source !== "failed" && r.content);
		if (!anySuccess) {
			throw new Error(
				`AnthropicProvider: Could not fetch content from any of: ${sourceUrls.join(", ")}`,
			);
		}

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

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 1500,
			temperature: 0,
			system:
				"You are a product analyst. You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.",
			messages: [{ role: "user", content: userPrompt }],
		});
		this.lastUsage = {
			inputTokens: response.usage.input_tokens,
			outputTokens: response.usage.output_tokens,
		};

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			const parsed = parseJsonResponse(text) as Record<string, unknown>;
			if (ogImageUrl) parsed.imageUrl = ogImageUrl;
			return parsed;
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

	async summarizeBrief(input: BriefSummaryInput): Promise<BriefSummaryOutput> {
		const { systemPrompt, userPrompt } = buildBriefSummaryPrompt(input);

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
				`AnthropicProvider: Failed to parse brief summary response as JSON. Raw: ${text}`,
			);
		}
	}
}
