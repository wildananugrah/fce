/**
 * One-shot migration: backfill Project.createdById for existing projects.
 *
 * Sets createdById = Workspace.createdBy (the user who created the workspace).
 * Projects in workspaces where createdBy is null stay null — those don't count
 * against any user's quota (legacy rows, acceptable trade-off).
 *
 *   bun run scripts/migrate-project-creator.ts            # apply
 *   bun run scripts/migrate-project-creator.ts --dry-run  # preview only
 *
 * Safe to re-run — skips projects that already have a createdById set.
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
	const pending = await prisma.project.findMany({
		where: { createdById: null },
		select: {
			id: true,
			name: true,
			workspace: { select: { id: true, name: true, createdBy: true } },
		},
	});

	console.log(`Projects missing createdById: ${pending.length}`);
	if (pending.length === 0) return;

	let updated = 0;
	let orphaned = 0;
	for (const p of pending) {
		const creatorId = p.workspace.createdBy;
		if (!creatorId) {
			orphaned++;
			console.log(`  SKIP  ${p.name} (${p.id}) — workspace "${p.workspace.name}" has no creator`);
			continue;
		}
		if (DRY_RUN) {
			console.log(`  WOULD ${p.name} (${p.id}) → createdById = ${creatorId}`);
		} else {
			await prisma.project.update({
				where: { id: p.id },
				data: { createdById: creatorId },
			});
			console.log(`  OK    ${p.name} (${p.id}) → createdById = ${creatorId}`);
		}
		updated++;
	}

	console.log("");
	console.log(`${DRY_RUN ? "Would update" : "Updated"}: ${updated}`);
	console.log(`Orphaned (left null): ${orphaned}`);
	if (DRY_RUN) console.log("Dry run — re-run without --dry-run to apply.");
}

main()
	.catch((err) => {
		console.error(err);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
