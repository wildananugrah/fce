import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// System AI skills shipped with the app. Each entry becomes an AiSkill row
// with isSystem=true; slugs listed in DEFAULT_CONTENT_SKILL_SLUGS are
// auto-mapped to the content generator for every workspace (existing and
// new). To add another default skill: drop a markdown file under
// prisma/seeds/, register it here, and add the slug to the default list.
const SYSTEM_SKILLS: Array<{
	slug: string;
	name: string;
	description: string;
	category: string;
	file: string;
}> = [
	{
		slug: "humanizer",
		name: "Humanizer",
		description:
			"Removes signs of AI-generated writing — inflated symbolism, em-dash overuse, vague attributions, AI vocabulary, passive voice, filler phrases — so generated copy reads like it was written by a human. Based on Wikipedia's 'Signs of AI writing' guide (blader/humanizer).",
		category: "copywriting",
		file: "humanizer-skill.md",
	},
];

const DEFAULT_CONTENT_SKILL_SLUGS = new Set<string>(["humanizer"]);

async function main() {
	const frameworks = [
		{ name: "AIDA", description: "Attention, Interest, Desire, Action" },
		{ name: "PAS", description: "Problem, Agitate, Solution" },
		{ name: "BAB", description: "Before, After, Bridge" },
	];

	for (const framework of frameworks) {
		await prisma.framework.upsert({
			where: { name: framework.name },
			update: {},
			create: framework,
		});
	}

	const hookTypes = [
		{ name: "Curiosity", description: "Spark curiosity with unexpected questions or facts" },
		{ name: "Pain Point", description: "Address a specific pain point the audience experiences" },
		{ name: "Bold Claim", description: "Make a bold, attention-grabbing statement" },
		{ name: "Social Proof", description: "Leverage testimonials, stats, or authority" },
		{ name: "Story", description: "Open with a relatable narrative or anecdote" },
	];

	for (const hookType of hookTypes) {
		await prisma.hookType.upsert({
			where: { name: hookType.name },
			update: {},
			create: hookType,
		});
	}

	const tonePresets = [
		{ name: "Professional", description: "Formal, polished, and business-appropriate tone" },
		{ name: "Casual", description: "Relaxed, friendly, and approachable tone" },
		{ name: "Playful", description: "Fun, witty, and lighthearted tone" },
		{ name: "Authoritative", description: "Expert, confident, and commanding tone" },
		{ name: "Empathetic", description: "Understanding, caring, and emotionally aware tone" },
		{ name: "Inspirational", description: "Motivating, uplifting, and aspirational tone" },
		{ name: "Educational", description: "Informative, clear, and teaching-oriented tone" },
		{ name: "Conversational", description: "Natural, dialogue-like, and engaging tone" },
	];

	for (const tone of tonePresets) {
		await prisma.tonePreset.upsert({
			where: { name: tone.name },
			update: {},
			create: tone,
		});
	}

	const visualStyles = [
		{ name: "Minimalist", description: "Clean, simple, lots of white space" },
		{ name: "Bold & Vibrant", description: "Strong colors, high contrast, energetic" },
		{ name: "Elegant", description: "Sophisticated, refined, premium feel" },
		{ name: "Organic", description: "Natural textures, earth tones, warm feel" },
		{ name: "Modern Tech", description: "Sleek, digital, futuristic aesthetics" },
		{ name: "Lifestyle", description: "Aspirational, real-life scenarios, relatable" },
	];

	for (const style of visualStyles) {
		await prisma.visualStyle.upsert({
			where: { name: style.name },
			update: {},
			create: style,
		});
	}

	// ─── System AI Skills ───────────────────────────────────────────
	const seedsDir = join(import.meta.dir ?? __dirname, "seeds");
	for (const skill of SYSTEM_SKILLS) {
		const content = readFileSync(join(seedsDir, skill.file), "utf-8");
		const upserted = await prisma.aiSkill.upsert({
			where: { slug: skill.slug },
			update: {
				name: skill.name,
				description: skill.description,
				content,
				category: skill.category,
				isSystem: true,
			},
			create: {
				slug: skill.slug,
				name: skill.name,
				description: skill.description,
				content,
				category: skill.category,
				isSystem: true,
			},
		});
		console.log(`  ✓ AI skill: ${skill.slug}`);

		// Auto-map default content skills to every existing workspace.
		if (DEFAULT_CONTENT_SKILL_SLUGS.has(skill.slug)) {
			const workspaces = await prisma.workspace.findMany({ select: { id: true } });
			for (const ws of workspaces) {
				await prisma.workspaceSkillMapping.upsert({
					where: {
						workspaceId_skillId_generator: {
							workspaceId: ws.id,
							skillId: upserted.id,
							generator: "content",
						},
					},
					update: { isActive: true },
					create: {
						workspaceId: ws.id,
						skillId: upserted.id,
						generator: "content",
						isActive: true,
					},
				});
			}
			console.log(`    ↳ mapped to ${workspaces.length} workspaces (content generator)`);
		}
	}

	console.log("Seed completed: frameworks, hook types, tone presets, visual styles, and system skills");
}

main()
	.catch((e) => {
		console.error("Seed failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
