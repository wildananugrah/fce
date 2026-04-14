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

	const skillIds = skillMappings.map((m) => m.skill.id);
	const skillNames = skillMappings.map((m) => m.skill.name);

	let context = "";
	let charCount = 0;
	let includedCount = 0;

	for (const mapping of skillMappings) {
		if (charCount >= MAX_SKILL_CONTEXT_CHARS) break;

		const skill = mapping.skill;
		const block = `### Skill: ${skill.name}\n${skill.content}`;
		const separator = includedCount === 0 ? "" : "\n\n---\n\n";
		const addition = separator + block;

		const remaining = MAX_SKILL_CONTEXT_CHARS - charCount;
		if (addition.length <= remaining) {
			context += addition;
			charCount += addition.length;
			includedCount += 1;
		} else {
			// Truncate this skill to fit the remaining budget
			context += addition.slice(0, remaining);
			charCount = MAX_SKILL_CONTEXT_CHARS;
			includedCount += 1;
			break;
		}
	}

	const truncatedCount = skillMappings.length - includedCount;

	return {
		context,
		skillIds,
		skillNames,
		includedCount,
		truncatedCount,
	};
}
