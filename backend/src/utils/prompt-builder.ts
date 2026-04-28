import { getContentFormatCategory } from "../config/content-formats";
import type { BriefSummaryInput } from "../interfaces/providers/campaign-brief-summarizer.interface";
import type { CampaignGenerationInput } from "../interfaces/providers/campaign-generator.interface";
import type { ContentGenerationInput } from "../interfaces/providers/content-generator.interface";
import type { TopicGenerationInput } from "../interfaces/providers/topic-generator.interface";

export interface PromptPair {
	systemPrompt: string;
	userPrompt: string;
}

const JSON_ONLY_INSTRUCTION =
	"You MUST respond with ONLY valid JSON. No markdown, no code blocks, no explanations.";

function normalizeLanguage(raw?: string): string {
	const v = (raw ?? "").toLowerCase().trim();
	if (v === "en" || v === "english") return "English";
	return "Bahasa Indonesia";
}

const CONTENT_TYPE_FORMAT_INSTRUCTIONS: Record<string, string> = {
	single_image: `Return JSON with fields: contentTitle (string), content (object with: hook (string - attention-grabbing opening line shown on the image), caption (string - the post caption shown below the image), cta (string - call to action), hashtags (array of strings), visualDirection (string - concrete description of what is shown in the image))`,
	carousel: `Return JSON with fields: contentTitle (string), content (object with: hook (string - attention-grabbing opening line shown on first slide), caption (string - the post caption shown below the carousel), hashtags (array of strings), cta (string - call to action), slides (array of objects with: headline, body, visualDirection))`,
	video: `Return JSON with fields: contentTitle (string), content (object with:
- hook (string — attention-grabbing opening line)
- caption (string — the post caption)
- hashtags (array of strings)
- cta (string — call to action)
- scenes (array of 4–8 objects — one per shot/beat in the video). Each scene MUST contain:
  - timeRange (string — "MM:SS – MM:SS" format indicating when this scene plays, starting from 00:00)
  - visualDirection (string — concrete, vivid description of what is shown on screen in this scene)
  - voiceover (string — narration or dialogue spoken during this scene, in the requested content language)
  - onScreenText (string — the caption/text overlay that appears on screen during this scene)
  - visualReference (string — a concise image-generation prompt, max 25 words, describing the single hero frame of this scene so an image generator can visualise it. Write this field in English regardless of the content language. Include subject, setting, mood, lighting, framing.)
)`,
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
	// Resolve the canonical contentType (e.g. "reels", "tiktok_video") to a
	// format category ("video", "carousel", "story", "single_image") so the
	// prompt matches the actual output shape the AI should produce.
	const formatCategory = getContentFormatCategory(input.contentType);
	const formatInstruction =
		CONTENT_TYPE_FORMAT_INSTRUCTIONS[formatCategory] ||
		CONTENT_TYPE_FORMAT_INSTRUCTIONS.single_image;

	const humanLanguage = normalizeLanguage(input.language);

	// The language directive sits at the very top of the system prompt — before
	// the brand context — so the model receives it as the first instruction.
	// Otherwise, when the brand brain fields are written in another language
	// (common when a user flips the language toggle without re-translating the
	// brain), the model defaults to the dominant language of the context.
	const systemPrompt = `You are an expert content creator.

OUTPUT LANGUAGE — NON-NEGOTIABLE: Every user-facing string in your output (contentTitle, hook, caption, CTA, hashtags, slide/scene text, on-screen text, voiceover) MUST be written in ${humanLanguage}. This rule applies regardless of the language used in the brand context below — the brand context is informational only and does not dictate output language. Do NOT switch languages mid-output.

Brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const pillars = input.pillars ?? [];
	const pillarLine =
		pillars.length === 0
			? ""
			: pillars.length === 1
				? `\nThis content should reinforce the brand pillar: "${pillars[0]}".`
				: `\nAlign this content with one of the brand's content pillars: ${pillars.map((p) => `"${p}"`).join(", ")}. Pick the one that best fits the requested platform, format, and objective.`;

	const userPrompt = `Write all output in ${humanLanguage} (per the system prompt's non-negotiable rule).

Create ${input.contentType} content for ${input.platform} platform.
Framework: ${input.framework}
Hook type: ${input.hookType}
Language: ${humanLanguage}${pillarLine}
${input.prompt ? `\nAdditional instructions: ${input.prompt}` : ""}

${formatInstruction}

Apply the ${input.framework} framework and use a ${input.hookType} hook style.`;

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

	const humanLanguage = normalizeLanguage(input.language);

	// Same rationale as buildContentGenerationPrompt — language directive must
	// precede the brand context so the model can't drift to the brand brain's
	// dominant language when the user has flipped the toggle without
	// re-translating the brain text fields.
	const systemPrompt = `You are an expert content strategist.

OUTPUT LANGUAGE — NON-NEGOTIABLE: Every topic's "title" and "description" MUST be written in ${humanLanguage}. This rule applies regardless of the language used in the brand context below — the brand context is informational only and does not dictate output language. Do NOT mix languages within a single topic.

Brand context:
${contextBlock}

${JSON_ONLY_INSTRUCTION}`;

	const multiProductLine =
		input.productContexts && input.productContexts.length > 1
			? "The topics should bridge or combine the provided products where relevant."
			: "";

	const platformInstruction = input.platform
		? `Set "platform" to "${input.platform}" for every topic.`
		: `Set "platform" to the most appropriate social media platform (instagram, tiktok, youtube, twitter, linkedin, or facebook) for each topic.`;

	const objectiveInstruction = input.objective
		? `Set "objective" to "${input.objective}" for every topic.`
		: `Set "objective" to one of: awareness, engagement, education, conversion, retention.`;

	const formatInstruction =
		input.formats && input.formats.length > 0
			? `Set "format" to one of: ${input.formats.join(", ")}. Distribute formats across the ${count} topics.`
			: `Set "format" to the most appropriate content format (e.g., single_image, carousel, reels, story, video).`;

	const pillars = input.pillars ?? [];
	const pillarInstruction =
		pillars.length === 0
			? `Pick one appropriate pillar from the brand's pillar list in the brand context. Distribute topics across multiple pillars for variety. Never leave empty.`
			: pillars.length === 1
				? `Use EXACTLY this pillar for every topic: "${pillars[0]}". Every topic's "pillar" field must be the exact string "${pillars[0]}". Do not invent other pillars.`
				: `For every topic, set the pillar field to exactly one of: ${pillars.map((p) => `"${p}"`).join(", ")}. Distribute topics across these pillars for variety. Do not invent or use any other pillars.`;

	const dateInstruction =
		input.dateFrom && input.dateTo
			? `Set "publishDate" as an ISO 8601 date (YYYY-MM-DD) between ${input.dateFrom} and ${input.dateTo}. Distribute the ${count} publishDate values EVENLY across this range.`
			: `Set "publishDate" to an ISO 8601 date (YYYY-MM-DD) within the next 30 days.`;

	const userPrompt = `Write every topic's "title" and "description" in ${humanLanguage} (per the system prompt's non-negotiable rule).

Generate ${count} content topic ideas.
${multiProductLine}
${input.prompt ? `\nAdditional user instructions: ${input.prompt}` : ""}

Return JSON with a single field:
- topics: array of ${count} objects

EVERY topic object MUST contain ALL of these fields. Do NOT leave any field empty or null:

1. "title" (string, REQUIRED): A compelling, specific topic title (5-12 words). Never empty.
2. "description" (string, REQUIRED): 2-3 sentences describing what the content will cover and why it matters to the audience. Never empty.
3. "pillar" (string, REQUIRED): ${pillarInstruction}
4. "platform" (string, REQUIRED): ${platformInstruction}
5. "format" (string, REQUIRED): ${formatInstruction}
6. "objective" (string, REQUIRED): ${objectiveInstruction}
7. "publishDate" (string, REQUIRED): ${dateInstruction}

CRITICAL: Every field above is MANDATORY for every topic. If you cannot determine a value from the brand context, make a reasonable, on-brand choice — but never leave a field empty, null, or missing.

Make topics diverse, engaging, and aligned with the brand voice.`;

	return { systemPrompt, userPrompt };
}

export function buildBriefSummaryPrompt(input: BriefSummaryInput): PromptPair {
	const truncated =
		input.extractedText.length > 60000
			? `${input.extractedText.slice(0, 60000)}\n\n[…document truncated to fit context window…]`
			: input.extractedText;

	const systemPrompt = `You are an expert marketing strategist analyzing a client brief. You have the following brand context:
${input.brandContext}
${input.productContext ? `\nProduct context:\n${input.productContext}` : ""}

${JSON_ONLY_INSTRUCTION}`;

	const userPrompt = `Read the client brief document below and extract a structured summary.

Return JSON with these exact fields:
- summary (string): 3-5 sentence description of what this brief is asking for — the campaign purpose, goals, and any critical constraints.
- objective (string): The primary marketing objective (e.g. "awareness", "engagement", "conversion", "retention", "education"). Infer from the brief if not stated.
- audienceHint (string): One-sentence description of the target audience — demographics, role, pain points.
- keyMessage (string): The single most important message the campaign should communicate.
- budgetHint (string): Budget range if mentioned in the brief, else empty string "".
- channelHint (array of strings): Array of channel codes mentioned or clearly implied. Use only these codes: "instagram", "tiktok", "youtube", "twitter", "linkedin", "facebook". Empty array if nothing is implied.
- durationHint (object with: start, end): Campaign start and end dates in ISO format (YYYY-MM-DD) if mentioned. Use null for fields not found.

Do NOT invent facts that are not grounded in the brief or the brand context. If something is not stated, use an empty string, empty array, or null as appropriate.

=== CLIENT BRIEF DOCUMENT ===
${truncated}`;

	return { systemPrompt, userPrompt };
}
