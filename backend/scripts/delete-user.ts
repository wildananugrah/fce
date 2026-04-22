/**
 * Delete a user by email. Cleans up every relation that would otherwise
 * block the delete (invitations they issued, audit logs) and lets Prisma's
 * onDelete: Cascade handle the rest (workspace roles, project memberships,
 * email verification tokens, research runs).
 *
 * Use this mostly to re-test signup flows:
 *
 *   bun run scripts/delete-user.ts <email>
 *
 * Example:
 *   bun run scripts/delete-user.ts test@example.com
 *
 * Flags:
 *   --dry-run   Print what would be deleted without deleting.
 *
 * Refuses to delete a user who is the creator of a workspace (the creator
 * FK is SetNull on delete, so Prisma would let it through — but silently
 * orphaning a workspace is a bigger mistake than this script should make).
 * Use scripts/force-delete-workspace.ts first if you really want to.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const positional = args.filter((a) => !a.startsWith("--"));
const [email] = positional;

if (!email) {
	console.error("Usage: bun run scripts/delete-user.ts <email> [--dry-run]");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	const normalized = email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email: normalized } });
	if (!user) {
		console.error(`No user found with email ${normalized}`);
		process.exit(1);
	}

	// Count what will go.
	const [
		verificationTokens,
		workspaceRoles,
		projectMemberships,
		researchRuns,
		issuedInvitations,
		auditLogs,
		createdWorkspaces,
	] = await Promise.all([
		prisma.emailVerificationToken.count({ where: { userId: user.id } }),
		prisma.userWorkspaceRole.count({ where: { userId: user.id } }),
		prisma.userProjectMembership.count({ where: { userId: user.id } }),
		prisma.researchRun.count({ where: { userId: user.id } }),
		prisma.workspaceInvitation.count({ where: { invitedBy: user.id } }),
		prisma.auditLog.count({ where: { userId: user.id } }),
		prisma.workspace.count({ where: { createdBy: user.id } }),
	]);

	console.log(`User: ${normalized} (id: ${user.id})`);
	console.log(`  emailVerifiedAt:       ${user.emailVerifiedAt?.toISOString() ?? "null"}`);
	console.log(`  verification tokens:   ${verificationTokens}  (cascade)`);
	console.log(`  workspace roles:       ${workspaceRoles}  (cascade)`);
	console.log(`  project memberships:   ${projectMemberships}  (cascade)`);
	console.log(`  research runs:         ${researchRuns}  (cascade)`);
	console.log(`  invitations issued:    ${issuedInvitations}  (manual delete)`);
	console.log(`  audit logs:            ${auditLogs}  (manual delete)`);
	console.log(`  workspaces created:    ${createdWorkspaces}  (creator set null, workspace kept)`);

	if (createdWorkspaces > 0) {
		console.error(
			`\nRefusing to delete: user is the creator of ${createdWorkspaces} workspace(s).\n` +
				`Reassign or force-delete those first (scripts/force-delete-workspace.ts).`,
		);
		process.exit(1);
	}

	if (dryRun) {
		console.log("\n--dry-run: nothing deleted.");
		return;
	}

	await prisma.$transaction(async (tx) => {
		// Clear blocking relations first (those without onDelete: Cascade).
		await tx.workspaceInvitation.deleteMany({ where: { invitedBy: user.id } });
		await tx.auditLog.deleteMany({ where: { userId: user.id } });
		// User delete — remaining relations cascade per schema:
		//   UserWorkspaceRole, UserProjectMembership, EmailVerificationToken,
		//   ResearchRun. CampaignChatMessage.userId is SetNull.
		await tx.user.delete({ where: { id: user.id } });
	});

	console.log(`\nDeleted user ${normalized}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
