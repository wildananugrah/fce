import { describe, expect, it } from "bun:test";
import {
	buildContentGenerationPrompt,
	buildTopicGenerationPrompt,
} from "../../src/utils/prompt-builder";

const baseTopicInput = {
	brandContext: "{}",
	language: "en",
	count: 3,
};

describe("buildTopicGenerationPrompt — pillars", () => {
	it("uses the 'mix across all brand pillars' instruction when pillars is undefined", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput });
		expect(userPrompt).toContain("Pick one appropriate pillar from the brand's pillar list");
		expect(userPrompt).toContain("Distribute topics across multiple pillars for variety");
	});

	it("uses the 'mix across all brand pillars' instruction when pillars is an empty array", () => {
		const { userPrompt } = buildTopicGenerationPrompt({ ...baseTopicInput, pillars: [] });
		expect(userPrompt).toContain("Pick one appropriate pillar from the brand's pillar list");
	});

	it("locks every topic to a single pillar when pillars has exactly one entry", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			pillars: ["Education"],
		});
		expect(userPrompt).toContain('Use EXACTLY this pillar for every topic: "Education"');
		expect(userPrompt).toContain('Every topic\'s "pillar" field must be the exact string "Education"');
	});

	it("distributes topics across the provided pillars when pillars has 2+ entries", () => {
		const { userPrompt } = buildTopicGenerationPrompt({
			...baseTopicInput,
			pillars: ["Education", "Lifestyle", "Product Features"],
		});
		expect(userPrompt).toContain(
			'set the pillar field to exactly one of: "Education", "Lifestyle", "Product Features"',
		);
		expect(userPrompt).toContain("Distribute topics across these pillars for variety");
		expect(userPrompt).toContain("Do not invent or use any other pillars");
	});
});

const baseContentInput = {
	brandContext: "{}",
	platform: "instagram",
	contentType: "carousel",
	framework: "aida",
	hookType: "question",
	language: "en",
};

describe("buildContentGenerationPrompt — pillars", () => {
	it("omits the pillar section when pillars is undefined", () => {
		const { userPrompt } = buildContentGenerationPrompt({ ...baseContentInput });
		expect(userPrompt).not.toContain("brand pillar");
		expect(userPrompt).not.toContain("content pillar");
	});

	it("omits the pillar section when pillars is an empty array", () => {
		const { userPrompt } = buildContentGenerationPrompt({
			...baseContentInput,
			pillars: [],
		});
		expect(userPrompt).not.toContain("brand pillar");
		expect(userPrompt).not.toContain("content pillar");
	});

	it("uses the single-pillar instruction when pillars has one entry", () => {
		const { userPrompt } = buildContentGenerationPrompt({
			...baseContentInput,
			pillars: ["Education"],
		});
		expect(userPrompt).toContain(
			'This content should reinforce the brand pillar: "Education"',
		);
	});

	it("uses the multi-pillar instruction when pillars has 2+ entries", () => {
		const { userPrompt } = buildContentGenerationPrompt({
			...baseContentInput,
			pillars: ["Education", "Lifestyle"],
		});
		expect(userPrompt).toContain(
			'Align this content with one of the brand\'s content pillars: "Education", "Lifestyle"',
		);
		expect(userPrompt).toContain("Pick the one that best fits");
	});
});
