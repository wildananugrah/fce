import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	throw new Error("DATABASE_URL environment variable is not set");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
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

	console.log("Seed completed: frameworks and hook types");
}

main()
	.catch((e) => {
		console.error("Seed failed:", e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
