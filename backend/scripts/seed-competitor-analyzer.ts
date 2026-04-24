/**
 * Seed a demo AnalysisConfig + 3 TikTok creators for the given user's first
 * workspace/project. Useful for local smoke-testing without clicking through
 * the UI.
 *
 *   bun run scripts/seed-competitor-analyzer.ts <user-email>
 *
 * The user must already exist and belong to at least one workspace that has
 * a project. Creators are upserted by (projectId, platform, username), so
 * re-running is idempotent.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const email = process.argv[2];
if (!email) {
	console.error("Usage: bun run scripts/seed-competitor-analyzer.ts <user-email>");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) {
		console.error(`User not found: ${email}`);
		process.exit(1);
	}

	const membership = await prisma.userWorkspaceRole.findFirst({
		where: { userId: user.id },
		include: { workspace: true },
	});
	if (!membership) {
		console.error(`User is not a member of any workspace`);
		process.exit(1);
	}

	const workspace = membership.workspace;
	const project = await prisma.project.findFirst({ where: { workspaceId: workspace.id } });
	if (!project) {
		console.error(`No project in workspace "${workspace.name}"`);
		process.exit(1);
	}

	console.log(`Seeding for workspace "${workspace.name}" / project "${project.name}"`);

	const creators = await Promise.all(
		[
			{
				username: "khaby.lame",
				niche: "comedy",
				profileUrl: "https://tiktok.com/@khaby.lame",
			},
			{
				username: "mrbeast",
				niche: "challenges",
				profileUrl: "https://tiktok.com/@mrbeast",
			},
			{
				username: "gordonramsayofficial",
				niche: "food",
				profileUrl: "https://tiktok.com/@gordonramsayofficial",
			},
		].map((input) =>
			prisma.creator.upsert({
				where: {
					projectId_platform_username: {
						projectId: project.id,
						platform: "tiktok",
						username: input.username,
					},
				},
				update: {},
				create: {
					workspaceId: workspace.id,
					projectId: project.id,
					createdBy: user.id,
					platform: "tiktok",
					profileUrl: input.profileUrl,
					username: input.username,
					niche: input.niche,
				},
			}),
		),
	);

	const config = await prisma.analysisConfig.create({
		data: {
			workspaceId: workspace.id,
			projectId: project.id,
			name: "Demo config",
			targetNiche: "general",
			brandContext: "We are a SaaS that helps creators analyze their competitors.",
			analysisInstructions: "Analyze the hook, retention mechanisms, and CTA.",
			outputPreferences:
				"Generate 3 different short-form TikTok scripts with B-roll descriptions.",
			creators: {
				create: creators.map((c) => ({ creatorId: c.id })),
			},
		},
	});

	console.log(`Created config ${config.id} with ${creators.length} creators.`);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
