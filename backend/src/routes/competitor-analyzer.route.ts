import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { createProjectMiddleware, requireMenu } from "../middlewares/rbac.middleware";
import type { IAnalysisConfigService } from "../interfaces/services/analysis-config.service.interface";
import type { ICompetitorPipelineService } from "../interfaces/services/competitor-pipeline.service.interface";
import type { ICreatorService } from "../interfaces/services/creator.service.interface";

type Variables = {
	userId: string;
	workspaceId: string;
	workspaceRole: string;
	projectId?: string | null;
	isSuperadmin?: boolean;
};

export function createCompetitorAnalyzerRoutes(
	prisma: PrismaClient,
	creatorService: ICreatorService,
	configService: IAnalysisConfigService,
	pipelineService: ICompetitorPipelineService,
) {
	const app = new Hono<{ Variables: Variables }>();

	// All routes are project-scoped. The parent router mounts this under
	// /api/workspaces/:workspaceId/projects/:projectId/competitor-analyzer
	app.use("*", createProjectMiddleware(prisma));
	app.use("*", requireMenu("competitor-analyzer"));

	// ── Creators ─────────────────────────────────────────────

	app.post("/creators", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const userId = c.get("userId");
		const body = await c.req.json();
		try {
			const creator = await creatorService.create(workspaceId, projectId, userId, {
				platform: body.platform ?? "tiktok",
				profileUrl: body.profileUrl,
				username: body.username,
				niche: body.niche,
			});
			return c.json({ data: creator });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/creators", async (c) => {
		const projectId = c.get("projectId") as string;
		const includeArchived = c.req.query("includeArchived") === "true";
		const platform = c.req.query("platform") ?? undefined;
		const niche = c.req.query("niche") ?? undefined;
		const creators = await creatorService.list(projectId, { includeArchived, platform, niche });
		return c.json({ data: creators });
	});

	app.get("/creators/:id", async (c) => {
		const creator = await creatorService.get(c.req.param("id"));
		return c.json({ data: creator });
	});

	app.patch("/creators/:id", async (c) => {
		const body = await c.req.json();
		const updated = await creatorService.update(c.req.param("id"), body);
		return c.json({ data: updated });
	});

	app.delete("/creators/:id", async (c) => {
		await creatorService.archive(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	app.post("/creators/:id/refresh", async (c) => {
		const creator = await creatorService.refreshEnrichment(c.req.param("id"));
		return c.json({ data: creator });
	});

	// ── Configs ──────────────────────────────────────────────

	app.post("/configs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const body = await c.req.json();
		try {
			const config = await configService.create(workspaceId, projectId, body);
			return c.json({ data: config });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/configs", async (c) => {
		const projectId = c.get("projectId") as string;
		const configs = await configService.list(projectId);
		return c.json({ data: configs });
	});

	app.get("/configs/:id", async (c) => {
		const config = await configService.get(c.req.param("id"));
		return c.json({ data: config });
	});

	app.patch("/configs/:id", async (c) => {
		const body = await c.req.json();
		const config = await configService.update(c.req.param("id"), body);
		return c.json({ data: config });
	});

	app.delete("/configs/:id", async (c) => {
		await configService.delete(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	app.put("/configs/:id/creators", async (c) => {
		const projectId = c.get("projectId") as string;
		const body = await c.req.json<{ creatorIds: string[] }>();
		try {
			await configService.replaceCreators(c.req.param("id"), body.creatorIds ?? [], projectId);
			return c.json({ data: { success: true } });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.delete("/configs/:id/creators/:creatorId", async (c) => {
		await configService.removeCreator(c.req.param("id"), c.req.param("creatorId"));
		return c.json({ data: { success: true } });
	});

	// ── Runs ─────────────────────────────────────────────────

	app.post("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.get("projectId") as string;
		const userId = c.get("userId");
		const body = await c.req.json();
		try {
			const run = await pipelineService.createRun(workspaceId, projectId, userId, {
				configId: body.configId,
				videosPerCreator: body.videosPerCreator,
				lookbackPool: body.lookbackPool,
				timeframeDays: body.timeframeDays,
			});
			return c.json({ data: run });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/runs", async (c) => {
		const projectId = c.get("projectId") as string;
		const runs = await pipelineService.listRuns(projectId);
		return c.json({ data: runs });
	});

	app.get("/runs/:id", async (c) => {
		const run = await pipelineService.getRun(c.req.param("id"));
		return c.json({ data: run });
	});

	app.post("/runs/:id/cancel", async (c) => {
		try {
			const run = await pipelineService.cancelRun(c.req.param("id"));
			return c.json({ data: run });
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Unknown error";
			return c.json({ error: msg }, 400);
		}
	});

	app.get("/runs/:id/scripts", async (c) => {
		const run = await pipelineService.getRun(c.req.param("id"));
		return c.json({ data: run.scripts });
	});

	return app;
}
