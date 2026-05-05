/**
 * One-shot migration for the project-scoped RBAC rollout.
 *
 *   bun run scripts/migrate-rbac.ts [--dry-run]
 *
 * What it does, per workspace:
 *   1. Ensure a "Default" project exists (idempotent via slug "default").
 *   2. Backfill every Brand.projectId to that default project.
 *   3. Walk UserWorkspaceRole rows:
 *        - role == "admin"  → leave as-is (workspace admin in new model).
 *        - role == anything else ("editor" / "viewer" / unexpected) → create
 *          a UserProjectMembership on the default project with every menu
 *          granted and isApprover = false (admins flip approvers afterward).
 *   4. Superadmins are left alone — `User.isSuperadmin` is already the
 *      global flag and doesn't need any migration.
 *
 * Safe to re-run. Prints a summary at the end.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { ALL_MEMBER_MENUS, WORKSPACE_ROLES } from "../src/constants/roles";

const DRY_RUN = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface Stats {
	workspacesProcessed: number;
	projectsCreated: number;
	brandsBackfilled: number;
	membershipsCreated: number;
	adminRolesKept: number;
}

async function main() {
	const stats: Stats = {
		workspacesProcessed: 0,
		projectsCreated: 0,
		brandsBackfilled: 0,
		membershipsCreated: 0,
		adminRolesKept: 0,
	};

	const workspaces = await prisma.workspace.findMany({
		include: {
			roles: true,
			brands: { select: { id: true, projectId: true } },
			projects: { select: { id: true, slug: true } },
		},
	});

	for (const ws of workspaces) {
		stats.workspacesProcessed += 1;

		// 1. Default project
		let defaultProject = ws.projects.find((p) => p.slug === "default");
		if (!defaultProject) {
			if (DRY_RUN) {
				console.log(`[dry-run] Would create default project for workspace ${ws.name}`);
				defaultProject = { id: "dry-run-default", slug: "default" };
			} else {
				const created = await prisma.project.create({
					data: {
						workspaceId: ws.id,
						name: "Default",
						slug: "default",
						description: "Default project created during RBAC migration.",
					},
					select: { id: true, slug: true },
				});
				defaultProject = created;
				stats.projectsCreated += 1;
			}
		}

		// 2. Backfill Brand.projectId
		const brandsToBackfill = ws.brands.filter((b) => b.projectId === null);
		if (brandsToBackfill.length > 0) {
			if (DRY_RUN) {
				console.log(
					`[dry-run] Would backfill ${brandsToBackfill.length} brands for workspace ${ws.name}`,
				);
			} else {
				// Raw SQL: the Prisma client now types projectId as non-null
				// (per schema), so a typed updateMany with `projectId: null`
				// in the where clause is rejected before the query is sent.
				// The DB column is still nullable until `prisma db push`
				// succeeds, so raw SQL is the correct escape hatch.
				await prisma.$executeRaw`UPDATE brands SET project_id = ${defaultProject.id} WHERE workspace_id = ${ws.id} AND project_id IS NULL`;
			}
			stats.brandsBackfilled += brandsToBackfill.length;
		}

		// 3. Walk workspace roles
		for (const role of ws.roles) {
			if (role.role === WORKSPACE_ROLES.ADMIN) {
				stats.adminRolesKept += 1;
				continue;
			}
			// Non-admin role → create project membership on default project.
			const existing = await prisma.userProjectMembership.findUnique({
				where: {
					userId_projectId: { userId: role.userId, projectId: defaultProject.id },
				},
			});
			if (existing) continue;

			if (DRY_RUN) {
				console.log(
					`[dry-run] Would create membership for user ${role.userId} on default project of ${ws.name} (previous role: ${role.role})`,
				);
			} else {
				await prisma.userProjectMembership.create({
					data: {
						userId: role.userId,
						projectId: defaultProject.id,
						isApprover: false,
						menuAccess: ALL_MEMBER_MENUS as unknown as object,
					},
				});
			}
			stats.membershipsCreated += 1;
		}
	}

	console.log("─── RBAC migration summary ───");
	console.log(`Workspaces processed: ${stats.workspacesProcessed}`);
	console.log(`Default projects created: ${stats.projectsCreated}`);
	console.log(`Brands backfilled with projectId: ${stats.brandsBackfilled}`);
	console.log(`Workspace admin roles kept: ${stats.adminRolesKept}`);
	console.log(`Project memberships created: ${stats.membershipsCreated}`);
	if (DRY_RUN) console.log("(dry-run — no changes written)");
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(() => prisma.$disconnect());
