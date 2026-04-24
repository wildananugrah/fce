/**
 * Grants the given user admin access to the given workspace.
 *
 *   bun run scripts/fix-workspace-admin.ts <email> <workspace-name-or-id>
 *
 * Example:
 *   bun run scripts/fix-workspace-admin.ts wildananugrah@gmail.com Floothink
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const [email, workspaceNameOrId] = process.argv.slice(2);
if (!email || !workspaceNameOrId) {
	console.error("Usage: bun run scripts/fix-workspace-admin.ts <email> <workspace-name-or-id>");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const user = await prisma.user.findUnique({ where: { email } });
	if (!user) throw new Error(`No user with email ${email}`);

	const workspace =
		(await prisma.workspace.findFirst({ where: { id: workspaceNameOrId } })) ??
		(await prisma.workspace.findFirst({ where: { name: workspaceNameOrId } }));
	if (!workspace) throw new Error(`No workspace matching "${workspaceNameOrId}"`);

	await prisma.$transaction(async (tx) => {
		await tx.userWorkspaceRole.upsert({
			where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
			create: { userId: user.id, workspaceId: workspace.id, role: "admin" },
			update: { role: "admin" },
		});
		// Backfill createdBy if missing so the creator-fallback auth path works
		// on orphaned workspaces created before this field existed.
		if (!workspace.createdBy) {
			await tx.workspace.update({
				where: { id: workspace.id },
				data: { createdBy: user.id },
			});
		}
	});

	console.log(`Granted admin: ${email} → ${workspace.name} (${workspace.id})`);
	if (!workspace.createdBy) {
		console.log(`Also set createdBy = ${email}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
