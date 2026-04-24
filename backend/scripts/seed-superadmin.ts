/**
 * Flip a user's `isSuperadmin` flag. Superadmin is global — they can CRUD
 * workspaces, projects, users, and toggle other users' superadmin bit.
 *
 *   bun run scripts/seed-superadmin.ts <email> [--revoke]
 *
 * Examples:
 *   bun run scripts/seed-superadmin.ts wildananugrah@gmail.com
 *   bun run scripts/seed-superadmin.ts wildananugrah@gmail.com --revoke
 *
 * The user must already exist — this script does NOT create accounts.
 * Signup happens through the normal UI flow; promote an existing user here.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"));
const revoke = args.includes("--revoke");

if (!email) {
	console.error("Usage: bun run scripts/seed-superadmin.ts <email> [--revoke]");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const user = await prisma.user.findUnique({ where: { email: email as string } });
	if (!user) {
		console.error(`No user found with email ${email}. Have them sign up first.`);
		process.exit(1);
	}

	const nextValue = !revoke;
	if (user.isSuperadmin === nextValue) {
		console.log(
			`${email} is already ${nextValue ? "a superadmin" : "not a superadmin"} — nothing to do.`,
		);
		return;
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { isSuperadmin: nextValue },
	});

	console.log(
		revoke
			? `Revoked superadmin from ${email}`
			: `Promoted ${email} to superadmin`,
	);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
