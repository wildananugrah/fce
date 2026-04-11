import type { CampaignGenerationInput } from "../interfaces/providers/campaign-generator.interface";
import type { ContentGenerationInput } from "../interfaces/providers/content-generator.interface";
import type { TopicGenerationInput } from "../interfaces/providers/topic-generator.interface";

export interface PromptPair {
	systemPrompt: string;
	userPrompt: string;
}

const JSON_ONLY_INSTRUCTION =
	"You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";

const CONTENT_TYPE_FORMAT_INSTRUCTIONS: Record<string, string> = {
	single_image: `Return JSON with fields: contentTitle (string), content (object with: hook, headline, body, cta, hashtags (array), visualDirection)`,
	carousel: `Return JSON with fields: contentTitle (string), content (object with: hook (string - attention-grabbing opening line shown on first slide), caption (string - the post caption shown below the carousel), hashtags (array of strings), cta (string - call to action), slides (array of objects with: headline, body, visualDirection))`,
	video: `Return JSON with fields: contentTitle (string), content (object with: hook (string - attention-grabbing opening line), caption (string - the post caption), hashtags (array of strings), cta (string - call to action), scenes (array of objects with: visualDirection, voiceover, onScreenText))`,
	story: `Return JSON with fields: contentTitle (string), content (object with: hook (string - opening text), caption (string), frames (array of objects with: visual, textOverlay))`,
};

function buildContextBlock(input: {
	brandContext: string;
	productContext?: string;
	productContexts?: string[];
	skillContext?: string;
}): string {
	let context = input.brandContext;
	if (input.productContexts && input.productContexts.length > 0) {
		input.productContexts.forEach((pc, i) => {
			context += `\n\nProduct ${i + 1} context:\n${pc}`;
		});
	} else if (input.productContext) {
		context += `\n\nProduct context:\n${input.productContext}`;
	}
	if (input.skillContext) {
		context += `\n\nMarketing skill guidelines to follow:\n${input.skillContext}`;
	}
	return context;
}

export function buildContentGenerationPrompt(input: ContentGenerationInput): PromptPair {
	const contextBlock = buildContextBlock(input);
	const formatInstruction =
		CONTENT_TYPE_FORMAT_INSTRUCTIONS[input.contentType] ||
		CONTENT_TYPE_FORMAT_INSTRUCTIONS.single_image;

	const systemPrompt = `You are an expert content creator. You have the following brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const userPrompt = `Create ${input.contentType} content for ${input.platform} platform.
Framework: ${input.framework}
Hook type: ${input.hookType}
Language: ${input.language}
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}

${formatInstruction}

Apply the ${input.framework} framework and use a ${input.hookType} hook style. Write all copy in ${input.language}.`;

	return { systemPrompt, userPrompt };
}

export function buildCampaignGenerationPrompt(input: CampaignGenerationInput): PromptPair {
	const systemPrompt = `You are an expert marketing strategist. You have the following brand context:
${input.brandContext}

${JSON_ONLY_INSTRUCTION}`;

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

	return { systemPrompt, userPrompt };
}

export function buildTopicGenerationPrompt(input: TopicGenerationInput): PromptPair {
	const count = input.count ?? 10;
	const contextBlock = buildContextBlock({
		brandContext: input.brandContext ?? "{}",
		productContexts: input.productContexts,
		skillContext: input.skillContext,
	});

	const systemPrompt = `You are an expert content strategist. You have the following brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const formatLine =
		input.formats && input.formats.length > 0
			? `Allowed content formats: ${input.formats.join(", ")}. Assign exactly one format per topic from this list.`
			: "";

	const multiProductLine =
		input.productContexts && input.productContexts.length > 1
			? "The topics should bridge or combine the provided products where relevant."
			: "";

	const userPrompt = `Generate ${count} content topic ideas${input.platform ? ` for ${input.platform}` : ""}.
${input.objective ? `Content objective: ${input.objective}` : ""}
${input.dateFrom && input.dateTo ? `Schedule date range: ${input.dateFrom} to ${input.dateTo}. Distribute publishDate values evenly across this range.` : ""}
${formatLine}
${multiProductLine}

Return JSON with a single field:
- topics (array of ${count} objects, each with: title, description, pillar, platform, format, objective, publishDate)

${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}
Make topics diverse, engaging, and aligned with the brand voice.`;

	return { systemPrompt, userPrompt };
}
