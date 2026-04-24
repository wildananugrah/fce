/**
 * One-shot migration for the email-verification rollout.
 *
 *   bun run scripts/migrate-email-verification.ts [--dry-run]
 *
 * Grandfathers every existing user as already-verified:
 *   - users with emailVerifiedAt = null  → set to now()
 *
 * Rationale: forcing existing users to re-verify is user-hostile — they've
 * already been using the product. New signups (after this feature ships) go
 * through the real verification flow.
 *
 * Safe to re-run — it skips any user already marked verified.
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
	const unverified = await prisma.user.count({ where: { emailVerifiedAt: null } });
	const total = await prisma.user.count();
	console.log(`Users total: ${total}`);
	console.log(`Users unverified (will be grandfathered): ${unverified}`);

	if (unverified === 0) {
		console.log("Nothing to do.");
		return;
	}

	if (DRY_RUN) {
		console.log("[dry-run] would set emailVerifiedAt = now() on all unverified users");
		return;
	}

	const res = await prisma.user.updateMany({
		where: { emailVerifiedAt: null },
		data: { emailVerifiedAt: new Date() },
	});
	console.log(`Grandfathered ${res.count} user(s).`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
