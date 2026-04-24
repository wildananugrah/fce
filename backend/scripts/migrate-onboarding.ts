/**
 * One-shot migration for the onboarding tutorial rollout.
 *
 *   bun run scripts/migrate-onboarding.ts [--dry-run]
 *
 * Grandfathers every existing user so they never see a surprise tutorial:
 *   - onboardingWelcomeSeenAt:        null → now()
 *   - onboardingChecklistDismissedAt: null → now()
 *   - seenCoachMarks (if []):                 →
 *     ["dashboard","brands","products","generate","campaigns","topics","brand-new"]
 *
 * Only affects users created BEFORE the script runs (bounded by createdAt <= now).
 * Users created after this run (i.e. real new signups) go through the full
 * tutorial flow.
 *
 * Safe to re-run. Idempotent: users already flagged as "welcome seen" are
 * skipped for that flag; coach marks merge by union.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const DRY_RUN = process.argv.includes("--dry-run");
const COACH_MARK_KEYS = ["dashboard", "brands", "products", "generate", "campaigns", "topics", "brand-new"];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const cutoff = new Date();
	const total = await prisma.user.count({ where: { createdAt: { lte: cutoff } } });
	const needsWelcome = await prisma.user.count({
		where: { createdAt: { lte: cutoff }, onboardingWelcomeSeenAt: null },
	});
	const needsChecklist = await prisma.user.count({
		where: { createdAt: { lte: cutoff }, onboardingChecklistDismissedAt: null },
	});

	console.log(`Users existing at cutoff ${cutoff.toISOString()}: ${total}`);
	console.log(`  needs welcomeSeenAt backfill:        ${needsWelcome}`);
	console.log(`  needs checklistDismissedAt backfill: ${needsChecklist}`);

	if (DRY_RUN) {
		console.log("[dry-run] no writes performed");
		return;
	}

	if (needsWelcome > 0) {
		const r = await prisma.user.updateMany({
			where: { createdAt: { lte: cutoff }, onboardingWelcomeSeenAt: null },
			data: { onboardingWelcomeSeenAt: cutoff },
		});
		console.log(`Backfilled onboardingWelcomeSeenAt for ${r.count} user(s)`);
	}

	if (needsChecklist > 0) {
		const r = await prisma.user.updateMany({
			where: { createdAt: { lte: cutoff }, onboardingChecklistDismissedAt: null },
			data: { onboardingChecklistDismissedAt: cutoff },
		});
		console.log(`Backfilled onboardingChecklistDismissedAt for ${r.count} user(s)`);
	}

	// Merge-by-union for coach marks. updateMany can't express array
	// concat-with-dedupe, so iterate.
	const users = await prisma.user.findMany({
		where: { createdAt: { lte: cutoff } },
		select: { id: true, seenCoachMarks: true },
	});
	let coachUpdated = 0;
	for (const u of users) {
		const set = new Set<string>(u.seenCoachMarks);
		let changed = false;
		for (const k of COACH_MARK_KEYS) {
			if (!set.has(k)) {
				set.add(k);
				changed = true;
			}
		}
		if (changed) {
			await prisma.user.update({
				where: { id: u.id },
				data: { seenCoachMarks: Array.from(set) },
			});
			coachUpdated++;
		}
	}
	console.log(`Merged coach-mark keys into ${coachUpdated} user(s)`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
