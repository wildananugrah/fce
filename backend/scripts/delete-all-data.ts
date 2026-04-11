import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	console.error("DATABASE_URL environment variable is required");
	process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function deleteAllData() {
	console.log("Deleting all data...\n");

	// Delete in order respecting foreign key constraints (children first)
	const counts = {
		outputFeedbackEvents: await prisma.outputFeedbackEvent.deleteMany(),
		generationOutputs: await prisma.generationOutput.deleteMany(),
		generationRequests: await prisma.generationRequest.deleteMany(),
		campaignOutputs: await prisma.campaignOutput.deleteMany(),
		campaigns: await prisma.campaign.deleteMany(),
		contentTopics: await prisma.contentTopic.deleteMany(),
		recommendationProfiles: await prisma.recommendationProfile.deleteMany(),
		productBrainVersions: await prisma.productBrainVersion.deleteMany(),
		products: await prisma.product.deleteMany(),
		brandBrainVersions: await prisma.brandBrainVersion.deleteMany(),
		brands: await prisma.brand.deleteMany(),
		hookTypes: await prisma.hookType.deleteMany(),
		frameworks: await prisma.framework.deleteMany(),
		auditLogs: await prisma.auditLog.deleteMany(),
		workspaceInvitations: await prisma.workspaceInvitation.deleteMany(),
		userWorkspaceRoles: await prisma.userWorkspaceRole.deleteMany(),
		workspaces: await prisma.workspace.deleteMany(),
		users: await prisma.user.deleteMany(),
	};

	for (const [table, result] of Object.entries(counts)) {
		console.log(`  ${table}: ${result.count} rows deleted`);
	}

	console.log("\nDone.");
}

deleteAllData()
	.catch((e) => {
		console.error("Failed to delete data:", e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
