/**
 * Create a user account from the CLI. Mirrors the signup flow but skips
 * invitations — use this for seeding test users, importing existing accounts,
 * or bootstrapping without opening the UI.
 *
 *   bun run scripts/create-user.ts <email> <password> [fullName] [--superadmin]
 *   bun run scripts/create-user.ts iqbal@floothink.com secret123 Iqbal
 *
 * Examples:
 *   bun run scripts/create-user.ts wildananugrah@gmail.com ChangeMe123
 *   bun run scripts/create-user.ts alice@example.com ChangeMe123 "Alice Lee"
 *   bun run scripts/create-user.ts boss@example.com ChangeMe123 "Boss" --superadmin
 *
 * If the email already exists the script exits with a clear message. It does
 * NOT add the user to a workspace — do that via the Admin UI or the
 * fix-workspace-admin.ts script.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/utils/password";

const args = process.argv.slice(2);
const flagSuperadmin = args.includes("--superadmin");
const positional = args.filter((a) => !a.startsWith("--"));
const [email, password, ...nameParts] = positional;
const fullName = nameParts.length > 0 ? nameParts.join(" ") : undefined;

if (!email || !password) {
	console.error("Usage: bun run scripts/create-user.ts <email> <password> [fullName] [--superadmin]");
	process.exit(1);
}
if (password.length < 8) {
	console.error("Password must be at least 8 characters.");
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	const normalized = email.trim().toLowerCase();
	const existing = await prisma.user.findUnique({ where: { email: normalized } });
	if (existing) {
		console.error(`User already exists: ${normalized} (id: ${existing.id})`);
		console.error(
			"Use scripts/seed-superadmin.ts to toggle the superadmin flag, or delete the user first.",
		);
		process.exit(1);
	}

	const passwordHash = await hashPassword(password);
	const user = await prisma.user.create({
		data: {
			email: normalized,
			passwordHash,
			fullName: fullName ?? null,
			isSuperadmin: flagSuperadmin,
			// CLI-created users skip the email verification flow — creating them
			// from the shell is already a trusted action.
			emailVerifiedAt: new Date(),
		},
		select: { id: true, email: true, fullName: true, isSuperadmin: true, createdAt: true },
	});

	console.log("Created user:");
	console.log(`  id:           ${user.id}`);
	console.log(`  email:        ${user.email}`);
	console.log(`  fullName:     ${user.fullName ?? "(none)"}`);
	console.log(`  isSuperadmin: ${user.isSuperadmin}`);
	console.log("");
	console.log("Next steps (pick whichever applies):");
	console.log(`  • Add to a workspace as admin:`);
	console.log(`      bun run scripts/fix-workspace-admin.ts ${user.email} <workspace-name-or-id>`);
	console.log(`  • Promote an existing user to superadmin later:`);
	console.log(`      bun run scripts/seed-superadmin.ts ${user.email}`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
