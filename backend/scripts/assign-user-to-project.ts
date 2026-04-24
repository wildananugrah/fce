/**
 * Assign a user to a project — creates (or updates) their project
 * membership so they can actually open the project in the UI. If the user
 * doesn't already have a workspace role, a "member" role is created so
 * the project membership isn't orphaned behind a missing workspace ACL.
 *
 * Usage:
 *   bun run scripts/assign-user-to-project.ts <email> <workspace> <project> [flags]
 *
 * Lookups:
 *   - <workspace> matches either workspace.id OR workspace.name (case-sensitive)
 *   - <project>   matches either project.id OR project.name (within the workspace),
 *                 OR project.slug — whichever hits first
 *
 * Examples:
 *   bun run scripts/assign-user-to-project.ts alice@floothink.com Floothink Demo
 *   bun run scripts/assign-user-to-project.ts alice@floothink.com Floothink Demo --approver
 *   bun run scripts/assign-user-to-project.ts alice@floothink.com Floothink Demo \
 *       --menus=brand-brain,topic-generator,content-generator
 *
 * Flags:
 *   --approver            Give the user approver rights on this project
 *                         (can change topic/content status).
 *   --menus=<list|all>    Comma-separated MenuKey list, or "all" for every
 *                         menu. Defaults to "all" because scripts-level
 *                         access usually means full member access.
 *                         Valid keys: brand-brain, product-brain,
 *                         topic-generator, content-generator,
 *                         campaign-generator, topic-library, content-library,
 *                         learning-center, research-hub.
 *   --dry-run             Print what would change without writing.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import {
	ALL_MEMBER_MENUS,
	isMenuKey,
	MENU_KEYS,
	WORKSPACE_ROLES,
	type MenuKey,
} from "../src/constants/roles";

const args = process.argv.slice(2);
const flagApprover = args.includes("--approver");
const flagDryRun = args.includes("--dry-run");
const menusFlag = args.find((a) => a.startsWith("--menus="))?.slice("--menus=".length);
const positional = args.filter((a) => !a.startsWith("--"));
const [email, workspaceRef, projectRef] = positional;

if (!email || !workspaceRef || !projectRef) {
	console.error(
		"Usage: bun run scripts/assign-user-to-project.ts <email> <workspace> <project> [--approver] [--menus=all|a,b,c] [--dry-run]",
	);
	process.exit(1);
}

let menuAccess: MenuKey[];
if (!menusFlag || menusFlag === "all") {
	menuAccess = ALL_MEMBER_MENUS;
} else {
	const requested = menusFlag.split(",").map((s) => s.trim()).filter(Boolean);
	const invalid = requested.filter((s) => !isMenuKey(s));
	if (invalid.length > 0) {
		console.error(
			`Unknown menu keys: ${invalid.join(", ")}\nValid keys: ${MENU_KEYS.join(", ")}`,
		);
		process.exit(1);
	}
	menuAccess = Array.from(new Set(requested.filter(isMenuKey)));
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
	const normalizedEmail = email.trim().toLowerCase();

	// 1. Resolve user.
	const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
	if (!user) {
		console.error(`No user with email ${normalizedEmail}`);
		process.exit(1);
	}

	// 2. Resolve workspace by id or name.
	const workspace =
		(await prisma.workspace.findFirst({ where: { id: workspaceRef } })) ??
		(await prisma.workspace.findFirst({ where: { name: workspaceRef } }));
	if (!workspace) {
		console.error(`No workspace matching "${workspaceRef}" (tried id + name)`);
		process.exit(1);
	}

	// 3. Resolve project by id, name, or slug — scoped to the workspace.
	const project =
		(await prisma.project.findFirst({
			where: { workspaceId: workspace.id, id: projectRef },
		})) ??
		(await prisma.project.findFirst({
			where: { workspaceId: workspace.id, name: projectRef },
		})) ??
		(await prisma.project.findFirst({
			where: { workspaceId: workspace.id, slug: projectRef },
		}));
	if (!project) {
		console.error(
			`No project matching "${projectRef}" in workspace "${workspace.name}" (tried id, name, slug)`,
		);
		process.exit(1);
	}
	if (project.archivedAt) {
		console.error(
			`Project "${project.name}" is archived (archivedAt=${project.archivedAt.toISOString()}).\nRestore it before assigning members.`,
		);
		process.exit(1);
	}

	// 4. Check existing workspace role + project membership.
	const [existingWorkspaceRole, existingMembership] = await Promise.all([
		prisma.userWorkspaceRole.findUnique({
			where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
		}),
		prisma.userProjectMembership.findUnique({
			where: { userId_projectId: { userId: user.id, projectId: project.id } },
		}),
	]);

	console.log(`User:      ${normalizedEmail} (${user.id})`);
	console.log(`Workspace: ${workspace.name} (${workspace.id})`);
	console.log(`Project:   ${project.name} (${project.id})`);
	console.log(
		`Workspace role: ${existingWorkspaceRole ? existingWorkspaceRole.role : `(none) → will create "${WORKSPACE_ROLES.MEMBER}"`}`,
	);
	console.log(
		`Project membership: ${existingMembership ? "already present → will update" : "(none) → will create"}`,
	);
	console.log(`  isApprover: ${flagApprover}`);
	console.log(`  menuAccess: ${menuAccess.length === MENU_KEYS.length ? "all" : menuAccess.join(", ")}`);

	if (flagDryRun) {
		console.log("\n--dry-run: nothing written.");
		return;
	}

	// 5. Apply in a transaction so we don't leave half-state behind.
	await prisma.$transaction(async (tx) => {
		if (!existingWorkspaceRole) {
			await tx.userWorkspaceRole.create({
				data: {
					userId: user.id,
					workspaceId: workspace.id,
					role: WORKSPACE_ROLES.MEMBER,
				},
			});
		}
		await tx.userProjectMembership.upsert({
			where: { userId_projectId: { userId: user.id, projectId: project.id } },
			create: {
				userId: user.id,
				projectId: project.id,
				isApprover: flagApprover,
				menuAccess: menuAccess as unknown as object,
			},
			update: {
				isApprover: flagApprover,
				menuAccess: menuAccess as unknown as object,
			},
		});
	});

	console.log(`\nAssigned ${normalizedEmail} to project "${project.name}".`);
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
