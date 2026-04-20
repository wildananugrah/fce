/**
 * Mark a user's email as verified from the CLI. Useful when a user was
 * created via scripts/create-user.ts before the pre-verified default was
 * added, or when a verification email went missing and you want to let
 * them in without another round-trip.
 *
 *   bun run scripts/verify-email.ts <email>
 *   bun run scripts/verify-email.ts --all           # verify every unverified user
 *
 * Examples:
 *   bun run scripts/verify-email.ts wildananugrah@gmail.com
 *   bun run scripts/verify-email.ts --all
 *
 * Idempotent: if the user is already verified the script just reports the
 * existing emailVerifiedAt and exits 0.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const all = args.includes("--all");
const positional = args.filter((a) => !a.startsWith("--"));
const [email] = positional;

if (!all && !email) {
	console.error(
		"Usage: bun run scripts/verify-email.ts <email>\n" +
			"       bun run scripts/verify-email.ts --all",
	);
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	if (all) {
		const res = await prisma.user.updateMany({
			where: { emailVerifiedAt: null },
			data: { emailVerifiedAt: new Date() },
		});
		console.log(`Verified ${res.count} user(s).`);
		return;
	}

	const normalized = email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email: normalized } });
	if (!user) {
		console.error(`No user found with email ${normalized}`);
		process.exit(1);
	}

	if (user.emailVerifiedAt) {
		console.log(`${normalized} is already verified (at ${user.emailVerifiedAt.toISOString()}).`);
		return;
	}

	const updated = await prisma.user.update({
		where: { id: user.id },
		data: { emailVerifiedAt: new Date() },
		select: { email: true, emailVerifiedAt: true },
	});
	console.log(`Verified ${updated.email} at ${updated.emailVerifiedAt?.toISOString()}.`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
