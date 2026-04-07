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
		const systemPrompt = `You are an expert content creator. You have the following brand context:
${input.brandContext}
${input.productContext ? `\nProduct context:\n${input.productContext}` : ""}

You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

		const contentTypeInstructions: Record<string, string> = {
			single_image: `Return JSON with fields: contentTitle (string), content (object with: hook, headline, body, cta, hashtags (array), visualDirection)`,
			carousel: `Return JSON with fields: contentTitle (string), content (object with: slides (array of objects with: headline, body, visualDirection))`,
			video: `Return JSON with fields: contentTitle (string), content (object with: scenes (array of objects with: visualDirection, voiceover, onScreenText))`,
			story: `Return JSON with fields: contentTitle (string), content (object with: frames (array of objects with: visual, textOverlay))`,
		};

		const formatInstruction =
			contentTypeInstructions[input.contentType] || contentTypeInstructions.single_image;

		const userPrompt = `Create ${input.contentType} content for ${input.platform} platform.
Framework: ${input.framework}
Hook type: ${input.hookType}
Language: ${input.language}
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}

${formatInstruction}

Apply the ${input.framework} framework and use a ${input.hookType} hook style. Write all copy in ${input.language}.`;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

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
		const systemPrompt = `You are an expert marketing strategist. You have the following brand context:
${input.brandContext}

You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

		const userPrompt = `Create a comprehensive marketing campaign strategy.
${input.objective ? `Objective: ${input.objective}` : ""}
${input.budget ? `Budget: ${input.budget}` : ""}
${input.channelMix && input.channelMix.length > 0 ? `Channel mix: ${input.channelMix.join(", ")}` : ""}
${input.culturalContext ? `Cultural context: ${input.culturalContext}` : ""}

Return JSON with fields:
- bigIdea (string): The overarching campaign concept
- messagingPillars (array of objects with: name, description): 3-5 key messaging pillars
- funnelJourney (object): Awareness, consideration, and conversion stage strategies
- channelRoles (object): Role and tactics for each channel`;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

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
		const count = input.count ?? 10;
		const systemPrompt = `You are an expert content strategist. You have the following brand context:
${input.brandContext}
${input.productContext ? `\nProduct context:\n${input.productContext}` : ""}

You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

		const userPrompt = `Generate ${count} content topic ideas${input.platform ? ` for ${input.platform}` : ""}.

Return JSON with a single field:
- topics (array of ${count} objects, each with: title, description, pillar, platform, format, objective, publishDate)

Make topics diverse, engaging, and aligned with the brand voice.`;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 2048,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

		const text = response.content[0].type === "text" ? response.content[0].text : "";
		try {
			return parseJsonResponse(text) as TopicGenerationOutput;
		} catch (_err) {
			throw new Error(
				`AnthropicProvider: Failed to parse topic generation response as JSON. Raw: ${text}`,
			);
		}
	}

	async scrape(input: BrandScrapingInput): Promise<BrandScrapingOutput> {
		const systemPrompt = `You are a brand analyst expert. Analyze the provided URL and extract brand identity information.
You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.`;

		const userPrompt = `Analyze this brand URL and extract brand identity information: ${input.url}

Return JSON with fields:
- name (string): Brand name
- category (string): Industry or product category
- personality (string): Brand personality traits
- tone (string): Communication tone and style
- values (array of strings): Core brand values
- vocabulary (object with: preferred (array of strings), avoided (array of strings)): Brand vocabulary guidelines`;

		const response = await this.client.messages.create({
			model: this.model,
			max_tokens: 1024,
			system: systemPrompt,
			messages: [{ role: "user", content: userPrompt }],
		});

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
