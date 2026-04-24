/**
 * Reset a user's password from the CLI. Hashes with the same bcrypt helper
 * the signup/admin flow uses, so the new password can be used immediately.
 *
 *   bun run scripts/reset-password.ts <email> <new-password>
 *
 * Example:
 *   bun run scripts/reset-password.ts wildananugrah@gmail.com secret123
 *
 * Fails if the user doesn't exist or the new password is shorter than 8
 * characters. For a random temp password, see --random below.
 *
 *   bun run scripts/reset-password.ts <email> --random
 *     → generates a 16-char URL-safe random password and prints it to stdout.
 */
import crypto from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { hashPassword } from "../src/utils/password";

const args = process.argv.slice(2);
const randomMode = args.includes("--random");
const positional = args.filter((a) => !a.startsWith("--"));
const [email, providedPassword] = positional;

if (!email) {
	console.error(
		"Usage: bun run scripts/reset-password.ts <email> <new-password>\n" +
			"       bun run scripts/reset-password.ts <email> --random",
	);
	process.exit(1);
}

function randomPassword(bytes = 12): string {
	return crypto.randomBytes(bytes).toString("base64url").slice(0, 16);
}

const password = randomMode ? randomPassword() : providedPassword;
if (!password) {
	console.error("A password is required (or pass --random to generate one).");
	process.exit(1);
}
if (password.length < 8) {
	console.error("Password must be at least 8 characters.");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const normalized = email.trim().toLowerCase();
	const user = await prisma.user.findUnique({ where: { email: normalized } });
	if (!user) {
		console.error(`No user found with email ${normalized}`);
		process.exit(1);
	}

	const passwordHash = await hashPassword(password);
	await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

	console.log(`Password reset for ${normalized}`);
	if (randomMode) {
		console.log(`New password (copy now — not shown again): ${password}`);
	}
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
