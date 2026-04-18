import type { PrismaClient } from "@prisma/client";

// Cap the total skill context at ~8000 characters to keep prompts predictable
// regardless of how many skills are mapped to a generator.
const MAX_SKILL_CONTEXT_CHARS = 8000;

// Reference files are intentionally excluded from the default prompt because
// they bloat token counts with little benefit. Skill content alone should
// describe how the AI uses them conceptually.

export interface SkillContextResult {
	context: string;
	skillIds: string[];
	skillNames: string[];
	includedCount: number;
	truncatedCount: number;
}

export async function buildSkillContext(
	prisma: PrismaClient,
	workspaceId: string,
	generator: "topic" | "content",
): Promise<SkillContextResult> {
	const skillMappings = await prisma.workspaceSkillMapping.findMany({
		where: { workspaceId, generator, isActive: true },
		include: { skill: true },
	});

	return renderSkills(skillMappings.map((m) => m.skill));
}

/**
 * Build a skill-context block from an explicit list of skill IDs (e.g. from
 * @-mentions in chat). Unknown IDs are silently dropped. Result uses the same
 * formatting + char cap as `buildSkillContext`.
 */
export async function buildSkillContextFromIds(
	prisma: PrismaClient,
	skillIds: string[],
): Promise<SkillContextResult> {
	if (skillIds.length === 0) {
		return { context: "", skillIds: [], skillNames: [], includedCount: 0, truncatedCount: 0 };
	}
	const skills = await prisma.aiSkill.findMany({
		where: { id: { in: skillIds } },
		orderBy: { name: "asc" },
	});
	return renderSkills(skills);
}

type SkillLike = { id: string; name: string; content: string };

function renderSkills(skills: SkillLike[]): SkillContextResult {
	const skillIds = skills.map((s) => s.id);
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
		skillIds,
		skillNames,
		includedCount,
		truncatedCount: skills.length - includedCount,
	};
}
