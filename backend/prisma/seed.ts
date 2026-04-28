import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL environment variable is not set");
}

const pool = new Pool({ connectionString: databaseUrl });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

	console.log("Seed completed: frameworks, hook types, tone presets, and visual styles");
}

main()
	.catch((e) => {
		console.error("Seed failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
