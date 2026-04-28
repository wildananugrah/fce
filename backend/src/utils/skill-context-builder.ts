import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";
import type { GeneratorName } from "../config/skills/manifests";

// Cap the total skill context at ~8000 characters to keep prompts predictable
// regardless of how many skills are mapped to a generator. Unchanged from the
// previous implementation.
const MAX_SKILL_CONTEXT_CHARS = 8000;

export interface SkillContextResult {
	context: string;
	skillSlugs: string[];
	skillNames: string[];
	includedCount: number;
	truncatedCount: number;
}

/**
 * Build the skill-context block for a generator. Reads from the in-memory
 * registry filtered by the manifest entry for that generator.
 */
export function buildSkillContext(
	registry: SkillRegistry,
	generator: GeneratorName,
): SkillContextResult {
	return renderSkills(filterByManifest(registry, generator));
}

/**
 * Build the skill-context block from an explicit list of skill slugs (e.g.
 * @-mentions in chat). Unknown slugs are silently dropped. Same formatting +
 * char cap as `buildSkillContext`.
 */
export function buildSkillContextFromSlugs(
	registry: SkillRegistry,
	slugs: string[],
): SkillContextResult {
	if (slugs.length === 0) {
		return { context: "", skillSlugs: [], skillNames: [], includedCount: 0, truncatedCount: 0 };
	}
	const skills = slugs
		.map((slug) => registry.get(slug))
		.filter((s): s is NonNullable<typeof s> => s !== undefined);
	return renderSkills(skills);
}

type SkillLike = { slug: string; name: string; content: string };

function renderSkills(skills: SkillLike[]): SkillContextResult {
	const skillSlugs = skills.map((s) => s.slug);
	const skillNames = skills.map((s) => s.name);

	let context = "";
	let charCount = 0;
	let includedCount = 0;

	for (const skill of skills) {
		if (charCount >= MAX_SKILL_CONTEXT_CHARS) break;

		const block = `### Skill: ${skill.name}\n${skill.content}`;
		const separator = includedCount === 0 ? "" : "\n\n---\n\n";
		const addition = separator + block;

		const remaining = MAX_SKILL_CONTEXT_CHARS - charCount;
		if (addition.length <= remaining) {
			context += addition;
			charCount += addition.length;
			includedCount += 1;
		} else {
			context += addition.slice(0, remaining);
			charCount = MAX_SKILL_CONTEXT_CHARS;
			includedCount += 1;
			break;
		}
	}

	return {
		context,
		skillSlugs,
		skillNames,
		includedCount,
		truncatedCount: skills.length - includedCount,
	};
}
