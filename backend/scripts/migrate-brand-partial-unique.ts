/**
 * One-shot migration: make brand uniqueness constraints respect soft-delete.
 *
 *   bun run scripts/migrate-brand-partial-unique.ts [--dry-run]
 *
 * Background: `Brand` has two uniqueness rules baked in:
 *   1. UNIQUE(project_id, slug)  — slug is unique per-project
 *   2. UNIQUE(project_id)        — a project can hold at most one brand
 *
 * Both were full unique indexes that include archived (soft-deleted) rows.
 * That means a trashed brand still "owns" its slug and project slot, so
 * the user sees "no brands" in the UI but gets a P2002 when trying to
 * create a brand with the same name — even though the live count is 0.
 * The symptom users hit: "Unique constraint failed on (project_id, slug)"
 * when the Demo project appeared empty.
 *
 * Fix: replace each full unique index with a PARTIAL unique index that
 * only applies when `archived_at IS NULL`. Live rows are still protected;
 * archived rows no longer block name reuse. This matches the intent of
 * soft-delete — hidden rows shouldn't affect uniqueness checks the user
 * can see.
 *
 * Prisma schema cannot express partial uniqueness, so the `@@unique(...)`
 * directives are being removed from `schema.prisma` and these constraints
 * are managed here. `prisma db push` will still be run after this migration
 * so any other schema drift is resolved normally.
 *
 * Idempotent. Safe to re-run. Safe for prod: creates the new partial
 * indexes BEFORE dropping the old ones, so the table is never
 * unprotected against duplicate live rows during the migration.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const OLD_SLUG_INDEX = "brands_project_id_slug_key";
const OLD_PROJECT_INDEX = "brands_project_id_key";
const NEW_SLUG_INDEX = "brands_project_id_slug_active_key";
const NEW_PROJECT_INDEX = "brands_project_id_active_key";

async function main() {
	// ─── Safety checks ─────────────────────────────────────────────
	// If the new indexes would violate uniqueness against current data,
	// refuse to proceed. The only way this can happen is if the DB was
	// already in a weird state — shouldn't happen on a normal install.
	const dupeSlugs = await prisma.$queryRawUnsafe<{ project_id: string; slug: string; count: bigint }[]>(
		`SELECT project_id, slug, COUNT(*) AS count
		 FROM brands
		 WHERE archived_at IS NULL
		 GROUP BY project_id, slug
		 HAVING COUNT(*) > 1;`,
	);
	if (dupeSlugs.length > 0) {
		console.error("Cannot migrate — live duplicate (project_id, slug) rows exist:");
		for (const r of dupeSlugs) console.error("  ", r);
		process.exit(1);
	}

	const dupeProjects = await prisma.$queryRawUnsafe<{ project_id: string; count: bigint }[]>(
		`SELECT project_id, COUNT(*) AS count
		 FROM brands
		 WHERE archived_at IS NULL AND project_id IS NOT NULL
		 GROUP BY project_id
		 HAVING COUNT(*) > 1;`,
	);
	if (dupeProjects.length > 0) {
		console.error("Cannot migrate — live duplicate project_id rows exist:");
		for (const r of dupeProjects) console.error("  ", r);
		process.exit(1);
	}

	// ─── Current state report ──────────────────────────────────────
	const indexes = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
		`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'brands';`,
	);
	const byName = Object.fromEntries(indexes.map((i) => [i.indexname, i.indexdef]));

	const hasOldSlug = OLD_SLUG_INDEX in byName;
	const hasOldProject = OLD_PROJECT_INDEX in byName;
	const hasNewSlug = NEW_SLUG_INDEX in byName;
	const hasNewProject = NEW_PROJECT_INDEX in byName;

	console.log("Current state:");
	console.log(`  ${OLD_SLUG_INDEX}:     ${hasOldSlug ? "present" : "missing"}`);
	console.log(`  ${OLD_PROJECT_INDEX}:          ${hasOldProject ? "present" : "missing"}`);
	console.log(`  ${NEW_SLUG_INDEX}:     ${hasNewSlug ? "present" : "missing"}`);
	console.log(`  ${NEW_PROJECT_INDEX}:          ${hasNewProject ? "present" : "missing"}`);

	if (hasNewSlug && hasNewProject && !hasOldSlug && !hasOldProject) {
		console.log("Already migrated. Nothing to do.");
		return;
	}

	if (DRY_RUN) {
		console.log("[dry-run] Would execute the following (in order):");
		if (!hasNewSlug)
			console.log(
				`  CREATE UNIQUE INDEX ${NEW_SLUG_INDEX} ON brands (project_id, slug) WHERE archived_at IS NULL;`,
			);
		if (!hasNewProject)
			console.log(
				`  CREATE UNIQUE INDEX ${NEW_PROJECT_INDEX} ON brands (project_id) WHERE archived_at IS NULL;`,
			);
		if (hasOldSlug) console.log(`  DROP INDEX ${OLD_SLUG_INDEX};`);
		if (hasOldProject) console.log(`  DROP INDEX ${OLD_PROJECT_INDEX};`);
		return;
	}

	// ─── Apply changes ─────────────────────────────────────────────
	// Create NEW partial indexes first, then drop OLD ones. This way
	// the table is never left without uniqueness protection for live rows.
	if (!hasNewSlug) {
		console.log(`Creating ${NEW_SLUG_INDEX}…`);
		await prisma.$executeRawUnsafe(
			`CREATE UNIQUE INDEX ${NEW_SLUG_INDEX} ON brands (project_id, slug) WHERE archived_at IS NULL;`,
		);
	}
	if (!hasNewProject) {
		console.log(`Creating ${NEW_PROJECT_INDEX}…`);
		await prisma.$executeRawUnsafe(
			`CREATE UNIQUE INDEX ${NEW_PROJECT_INDEX} ON brands (project_id) WHERE archived_at IS NULL;`,
		);
	}
	if (hasOldSlug) {
		console.log(`Dropping ${OLD_SLUG_INDEX}…`);
		await prisma.$executeRawUnsafe(`DROP INDEX ${OLD_SLUG_INDEX};`);
	}
	if (hasOldProject) {
		console.log(`Dropping ${OLD_PROJECT_INDEX}…`);
		await prisma.$executeRawUnsafe(`DROP INDEX ${OLD_PROJECT_INDEX};`);
	}

	console.log("Migration complete.");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
