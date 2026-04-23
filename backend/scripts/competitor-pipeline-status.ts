/**
 * Pretty-print competitor analyzer operational state: failed runs in the
 * last 24h, stuck runs (>45 min since start without completion), and the
 * creator enrichment queue distribution.
 *
 *   bun run scripts/competitor-pipeline-status.ts
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	console.log("\n=== Recent failed runs (last 24h) ===");
	const failed = await prisma.competitorPipelineRun.findMany({
		where: {
			status: "failed",
			createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
		},
		orderBy: { createdAt: "desc" },
		take: 20,
	});
	for (const r of failed) {
		console.log(`  ${r.id} stage=${r.stage ?? "-"} error=${r.errorMessage ?? "-"}`);
	}
	if (failed.length === 0) console.log("  (none)");

	console.log("\n=== Stuck runs (started >45 min ago) ===");
	const cutoff = new Date(Date.now() - 45 * 60 * 1000);
	const stuck = await prisma.competitorPipelineRun.findMany({
		where: {
			status: { notIn: ["completed", "failed"] },
			startedAt: { lt: cutoff },
		},
	});
	for (const r of stuck) {
		console.log(
			`  ${r.id} status=${r.status} stage=${r.stage ?? "-"} started=${r.startedAt?.toISOString()}`,
		);
	}
	if (stuck.length === 0) console.log("  (none)");

	console.log("\n=== Enrichment queue health ===");
	const queue = await prisma.creator.groupBy({
		by: ["enrichmentStatus"],
		where: { archivedAt: null },
		_count: { _all: true },
	});
	for (const row of queue) {
		console.log(`  ${row.enrichmentStatus}: ${row._count._all}`);
	}

	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
