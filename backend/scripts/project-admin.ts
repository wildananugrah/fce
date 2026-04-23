/**
 * Workspace / project admin tool.
 *
 *   bun run scripts/project-admin.ts list
 *     List every workspace (id, name, slug, created-by, project count).
 *
 *   bun run scripts/project-admin.ts list-projects [workspace]
 *     List projects. If `workspace` (id, slug, or name) is given, restrict
 *     to that workspace; otherwise list projects across all workspaces.
 *
 *   bun run scripts/project-admin.ts move <project> <target-workspace>
 *     Move a project to a different workspace. Updates every
 *     workspaceId-bearing row tied to the project (brand + its products,
 *     documents, topics, requests, research, AI logs; creators, analysis
 *     configs, competitor runs; the project row itself). Runs inside one
 *     transaction. Refuses if the target workspace already has a project
 *     with the same slug. `project` and `target-workspace` accept id, slug,
 *     or name.
 *
 * The script resolves a workspace argument by trying, in order: id match,
 * slug match, case-insensitive name match. Ambiguous names require using
 * the id or slug to disambiguate.
 *
 * Memberships (UserProjectMembership rows) are preserved. If a member of
 * the moved project isn't also a member of the target workspace, the
 * project route middleware will block them — clean up manually via
 * Workspace Settings if that's a concern.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
	const [command, ...args] = process.argv.slice(2);
	switch (command) {
		case "list":
			await listWorkspaces();
			break;
		case "list-projects":
			await listProjects(args[0]);
			break;
		case "move":
			if (!args[0] || !args[1]) {
				console.error("Usage: bun run scripts/project-admin.ts move <project> <target-workspace>");
				process.exit(1);
			}
			await moveProject(args[0], args[1]);
			break;
		default:
			printUsage();
			process.exit(command ? 1 : 0);
	}
}

function printUsage(): void {
	console.log(
		[
			"",
			"Usage:",
			"  bun run scripts/project-admin.ts list",
			"  bun run scripts/project-admin.ts list-projects [workspace]",
			"  bun run scripts/project-admin.ts move <project> <target-workspace>",
			"",
			"Arguments accept id, slug, or case-insensitive name.",
			"",
		].join("\n"),
	);
}

// ─── list workspaces ─────────────────────────────────────────────

async function listWorkspaces(): Promise<void> {
	const workspaces = await prisma.workspace.findMany({
		orderBy: { createdAt: "asc" },
		include: {
			creator: { select: { email: true } },
			_count: { select: { projects: true } },
		},
	});
	if (workspaces.length === 0) {
		console.log("(no workspaces)");
		return;
	}
	console.log(`\nWorkspaces (${workspaces.length}):\n`);
	for (const ws of workspaces) {
		console.log(`  ${ws.id}  ${ws.name}`);
		console.log(
			`    slug=${ws.slug}  projects=${ws._count.projects}  creator=${ws.creator?.email ?? "—"}`,
		);
	}
	console.log("");
}

// ─── list projects ──────────────────────────────────────────────

async function listProjects(workspaceArg?: string): Promise<void> {
	let workspaceId: string | undefined;
	let workspaceLabel = "all workspaces";
	if (workspaceArg) {
		const ws = await resolveWorkspace(workspaceArg);
		workspaceId = ws.id;
		workspaceLabel = `${ws.name} (${ws.slug})`;
	}

	const projects = await prisma.project.findMany({
		where: workspaceId ? { workspaceId } : {},
		orderBy: [{ workspaceId: "asc" }, { createdAt: "asc" }],
		include: {
			workspace: { select: { name: true, slug: true } },
			_count: {
				select: { brands: true, memberships: true, creators: true, analysisConfigs: true },
			},
		},
	});
	if (projects.length === 0) {
		console.log(`(no projects in ${workspaceLabel})`);
		return;
	}
	console.log(`\nProjects in ${workspaceLabel} (${projects.length}):\n`);
	for (const p of projects) {
		console.log(`  ${p.id}  ${p.name}`);
		console.log(
			`    slug=${p.slug}  workspace=${p.workspace.name}(${p.workspace.slug})  ` +
				`brands=${p._count.brands}  members=${p._count.memberships}  ` +
				`creators=${p._count.creators}  configs=${p._count.analysisConfigs}  ` +
				`archived=${p.archivedAt ? "yes" : "no"}`,
		);
	}
	console.log("");
}

// ─── move project ───────────────────────────────────────────────

async function moveProject(projectArg: string, workspaceArg: string): Promise<void> {
	const project = await resolveProject(projectArg);
	const targetWs = await resolveWorkspace(workspaceArg);

	if (project.workspaceId === targetWs.id) {
		console.log(
			`Project "${project.name}" is already in workspace "${targetWs.name}". Nothing to do.`,
		);
		return;
	}

	// Slug uniqueness guard. Project has @@unique([workspaceId, slug]) — if the
	// target workspace already uses this slug, the move will fail. Detect up
	// front so the user can either rename first or pick a different target.
	const conflict = await prisma.project.findFirst({
		where: { workspaceId: targetWs.id, slug: project.slug },
		select: { id: true, name: true },
	});
	if (conflict) {
		console.error(
			`\nERROR: target workspace "${targetWs.name}" already has a project with slug "${project.slug}"` +
				` (id=${conflict.id}, name="${conflict.name}").\n` +
				`Rename one of them before moving.`,
		);
		process.exit(1);
	}

	const sourceWs = await prisma.workspace.findUnique({
		where: { id: project.workspaceId },
		select: { name: true, slug: true },
	});

	// Preview counts so the operator knows what's about to get rewritten.
	const preview = await previewMove(project.id);
	console.log(
		[
			"",
			`Move project:   ${project.name}  (id=${project.id}, slug=${project.slug})`,
			`  from:         ${sourceWs?.name ?? "?"}  (${project.workspaceId})`,
			`    to:         ${targetWs.name}  (${targetWs.id})`,
			"",
			`Rows that will have their workspaceId rewritten:`,
			`  brands                   ${preview.brands}`,
			`  products                 ${preview.products}`,
			`  brand documents          ${preview.brandDocuments}`,
			`  content topics           ${preview.topics}`,
			`  generation requests      ${preview.generationRequests}`,
			`  research runs            ${preview.researchRuns}`,
			`  research results         ${preview.researchResults}`,
			`  AI provider logs         ${preview.aiLogs}`,
			`  creators                 ${preview.creators}`,
			`  analysis configs         ${preview.analysisConfigs}`,
			`  competitor pipeline runs ${preview.competitorRuns}`,
			`  project memberships      ${preview.memberships}  (preserved — check workspace access manually)`,
			"",
		].join("\n"),
	);

	if (!(await confirm("Proceed with move? [y/N] "))) {
		console.log("Aborted.");
		return;
	}

	await prisma.$transaction(async (tx) => {
		// Brand-linked rows (updated by joining on the project's brand ids).
		const brandIds = await tx.brand
			.findMany({ where: { projectId: project.id }, select: { id: true } })
			.then((rows) => rows.map((r) => r.id));

		if (brandIds.length > 0) {
			await tx.brand.updateMany({
				where: { projectId: project.id },
				data: { workspaceId: targetWs.id },
			});
			await tx.product.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
			await tx.brandDocument.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
			await tx.contentTopic.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
			await tx.generationRequest.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
			await tx.researchRun.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
			// research_results link to ResearchRun; rewrite via runId lookup.
			const runIds = await tx.researchRun
				.findMany({ where: { brandId: { in: brandIds } }, select: { id: true } })
				.then((rows) => rows.map((r) => r.id));
			if (runIds.length > 0) {
				await tx.researchResult.updateMany({
					where: { runId: { in: runIds } },
					data: { workspaceId: targetWs.id },
				});
			}
			await tx.aiProviderLog.updateMany({
				where: { brandId: { in: brandIds } },
				data: { workspaceId: targetWs.id },
			});
		}

		// Project-direct tables.
		await tx.creator.updateMany({
			where: { projectId: project.id },
			data: { workspaceId: targetWs.id },
		});
		await tx.analysisConfig.updateMany({
			where: { projectId: project.id },
			data: { workspaceId: targetWs.id },
		});
		await tx.competitorPipelineRun.updateMany({
			where: { projectId: project.id },
			data: { workspaceId: targetWs.id },
		});

		// The project row last — if anything above fails we don't end up with a
		// half-migrated project pointing at the new workspace.
		await tx.project.update({
			where: { id: project.id },
			data: { workspaceId: targetWs.id },
		});
	});

	console.log(`\n✔ Moved project "${project.name}" → "${targetWs.name}".\n`);
}

interface MovePreview {
	brands: number;
	products: number;
	brandDocuments: number;
	topics: number;
	generationRequests: number;
	researchRuns: number;
	researchResults: number;
	aiLogs: number;
	creators: number;
	analysisConfigs: number;
	competitorRuns: number;
	memberships: number;
}

async function previewMove(projectId: string): Promise<MovePreview> {
	const brandIds = await prisma.brand
		.findMany({ where: { projectId }, select: { id: true } })
		.then((r) => r.map((b) => b.id));

	const byBrand = brandIds.length > 0 ? { brandId: { in: brandIds } } : { brandId: "__never__" };
	const runIds =
		brandIds.length > 0
			? await prisma.researchRun
					.findMany({ where: byBrand, select: { id: true } })
					.then((r) => r.map((x) => x.id))
			: [];
	const byRun = runIds.length > 0 ? { runId: { in: runIds } } : { runId: "__never__" };

	const [
		products,
		brandDocuments,
		topics,
		generationRequests,
		researchRuns,
		researchResults,
		aiLogs,
		creators,
		analysisConfigs,
		competitorRuns,
		memberships,
	] = await Promise.all([
		prisma.product.count({ where: byBrand }),
		prisma.brandDocument.count({ where: byBrand }),
		prisma.contentTopic.count({ where: byBrand }),
		prisma.generationRequest.count({ where: byBrand }),
		prisma.researchRun.count({ where: byBrand }),
		prisma.researchResult.count({ where: byRun }),
		prisma.aiProviderLog.count({ where: byBrand }),
		prisma.creator.count({ where: { projectId } }),
		prisma.analysisConfig.count({ where: { projectId } }),
		prisma.competitorPipelineRun.count({ where: { projectId } }),
		prisma.userProjectMembership.count({ where: { projectId } }),
	]);

	return {
		brands: brandIds.length,
		products,
		brandDocuments,
		topics,
		generationRequests,
		researchRuns,
		researchResults,
		aiLogs,
		creators,
		analysisConfigs,
		competitorRuns,
		memberships,
	};
}

// ─── resolvers ──────────────────────────────────────────────────

async function resolveWorkspace(arg: string) {
	// Try id → slug → case-insensitive name.
	const byId = await prisma.workspace.findUnique({ where: { id: arg } });
	if (byId) return byId;
	const bySlug = await prisma.workspace.findUnique({ where: { slug: arg } });
	if (bySlug) return bySlug;
	const byName = await prisma.workspace.findMany({
		where: { name: { equals: arg, mode: "insensitive" } },
	});
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) {
		console.error(
			`Ambiguous workspace name "${arg}" (${byName.length} matches). Use the id or slug.`,
		);
		process.exit(1);
	}
	console.error(`No workspace found matching "${arg}".`);
	process.exit(1);
}

async function resolveProject(arg: string) {
	const byId = await prisma.project.findUnique({
		where: { id: arg },
		include: { workspace: true },
	});
	if (byId) return byId;
	// Project slug isn't globally unique — we'd need workspaceId too. So for
	// slug/name lookups scan across workspaces; ambiguous results require the
	// id to disambiguate.
	const matches = await prisma.project.findMany({
		where: {
			OR: [{ slug: arg }, { name: { equals: arg, mode: "insensitive" } }],
		},
		include: { workspace: true },
	});
	if (matches.length === 1) return matches[0];
	if (matches.length > 1) {
		console.error(
			`Ambiguous project "${arg}" (${matches.length} matches across workspaces). Use the id.`,
		);
		for (const p of matches) {
			console.error(`  ${p.id}  ${p.name}  (workspace=${p.workspace.name})`);
		}
		process.exit(1);
	}
	console.error(`No project found matching "${arg}".`);
	process.exit(1);
}

// ─── prompt helper ──────────────────────────────────────────────

async function confirm(question: string): Promise<boolean> {
	const rl = readline.createInterface({ input, output });
	const answer = (await rl.question(question)).trim().toLowerCase();
	rl.close();
	return answer === "y" || answer === "yes";
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
