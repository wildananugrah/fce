/**
 * One-shot migration: assign every brand with project_id = NULL to its
 * workspace's Default project.
 *
 *   bun run scripts/backfill-brand-default-project.ts [--dry-run]
 *
 * Background: Brand.projectId was nullable for legacy compat. The
 * project-required-for-brand work makes it non-null. Any brand still
 * pointing at NULL needs to land somewhere first; the workspace's
 * Default project is the natural home (every workspace has one per the
 * RBAC migration).
 *
 * Refuses to run if any workspace lacks a Default project — that surfaces
 * "migrate-rbac.ts was never run" loudly instead of silently corrupting.
 *
 * Idempotent. Safe to re-run.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	// Raw SQL: the Prisma client now types projectId as non-null (per schema),
	// so the typed `findMany({ where: { projectId: null } })` is rejected
	// before the query is sent. The DB column is still nullable until
	// `prisma db push` succeeds, so raw SQL is the correct escape hatch.
	const orphanedBrands = await prisma.$queryRaw<
		{ id: string; name: string; workspaceId: string }[]
	>`SELECT id, name, workspace_id AS "workspaceId" FROM brands WHERE project_id IS NULL`;

	if (orphanedBrands.length === 0) {
		console.log("✓ No brands with null projectId. Nothing to do.");
		return;
	}

	console.log(`Found ${orphanedBrands.length} brand(s) with project_id = NULL.`);

	// Group by workspace, look up each workspace's Default project, refuse
	// if any workspace is missing one.
	const workspaceIds = [...new Set(orphanedBrands.map((b) => b.workspaceId))];
	const defaults = await prisma.project.findMany({
		where: { workspaceId: { in: workspaceIds }, slug: "default" },
		select: { id: true, workspaceId: true },
	});
	const defaultByWorkspace = new Map(defaults.map((p) => [p.workspaceId, p.id]));

	const missingDefaults = workspaceIds.filter((wsId) => !defaultByWorkspace.has(wsId));
	if (missingDefaults.length > 0) {
		console.error(
			`✗ ${missingDefaults.length} workspace(s) are missing a Default project: ${missingDefaults.join(", ")}`,
		);
		console.error(`  Run 'bun run scripts/migrate-rbac.ts' first, then re-run this script.`);
		process.exit(1);
	}

	if (DRY_RUN) {
		console.log("DRY RUN — would assign:");
		for (const brand of orphanedBrands) {
			console.log(
				`  ${brand.id} (${brand.name}) → ${defaultByWorkspace.get(brand.workspaceId)}`,
			);
		}
		return;
	}

	let updated = 0;
	for (const brand of orphanedBrands) {
		const projectId = defaultByWorkspace.get(brand.workspaceId)!;
		await prisma.brand.update({
			where: { id: brand.id },
			data: { projectId },
		});
		updated += 1;
	}

	console.log(`✓ Updated ${updated} brand(s).`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
		await pool.end();
	});
