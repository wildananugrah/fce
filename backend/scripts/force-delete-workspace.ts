/**
 * Unconditionally deletes a workspace by name or id, bypassing all auth
 * checks. Use this when a workspace is orphaned and the normal auth path
 * refuses to delete it. All related rows (roles, brands, products, topics,
 * generations, campaigns, etc.) are removed via Prisma's onDelete: Cascade.
 *
 *   bun run scripts/force-delete-workspace.ts <workspace-name-or-id>
 *
 * Example:
 *   bun run scripts/force-delete-workspace.ts Floothink
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const [nameOrId] = process.argv.slice(2);
if (!nameOrId) {
	console.error("Usage: bun run scripts/force-delete-workspace.ts <workspace-name-or-id>");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	const workspace =
		(await prisma.workspace.findFirst({ where: { id: nameOrId } })) ??
		(await prisma.workspace.findFirst({ where: { name: nameOrId } })) ??
		(await prisma.workspace.findFirst({ where: { slug: nameOrId } }));

	if (!workspace) {
		console.error(`No workspace matching "${nameOrId}"`);
		process.exit(1);
	}

	console.log(`Deleting workspace: ${workspace.name} (${workspace.id})`);
	await prisma.workspace.delete({ where: { id: workspace.id } });
	console.log("Done.");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
