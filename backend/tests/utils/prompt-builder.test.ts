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
