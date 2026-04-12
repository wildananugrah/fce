import { Hono } from "hono";
import type { IResearchService } from "../interfaces/services/research.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createResearchRoutes(researchService: IResearchService) {
	const app = new Hono<{ Variables: Variables }>();

	// ── Settings ──────────────────────────────────────────────

	app.get("/settings", async (c) => {
		const workspaceId = c.get("workspaceId");
		const settings = await researchService.getSettings(workspaceId);
		return c.json({ data: settings });
	});

	app.put("/settings/apify", async (c) => {
		const workspaceId = c.get("workspaceId");
		const role = c.get("workspaceRole");
		if (role !== "admin") {
			return c.json({ error: "Only admins can manage integrations" }, 403);
		}
		const { apiKey } = await c.req.json<{ apiKey: string }>();
		if (!apiKey || typeof apiKey !== "string") {
			return c.json({ error: "apiKey is required" }, 400);
		}
		await researchService.setApifyKey(workspaceId, apiKey);
		return c.json({ data: { success: true } });
	});

	app.post("/settings/apify/test", async (c) => {
		const workspaceId = c.get("workspaceId");
		const connected = await researchService.testApifyKey(workspaceId);
		return c.json({ data: { connected } });
	});

	app.delete("/settings/apify", async (c) => {
		const workspaceId = c.get("workspaceId");
		const role = c.get("workspaceRole");
		if (role !== "admin") {
			return c.json({ error: "Only admins can manage integrations" }, 403);
		}
		await researchService.removeApifyKey(workspaceId);
		return c.json({ data: { success: true } });
	});

	// ── Runs ─────────────────────────────────────────────────

	app.post("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const run = await researchService.createRun(workspaceId, userId, {
			actorType: body.actorType,
			input: body.input,
			brandId: body.brandId,
		});
		return c.json({ data: run }, 201);
	});

	app.get("/runs", async (c) => {
		const workspaceId = c.get("workspaceId");
		const actorType = c.req.query("actorType") || undefined;
		const status = c.req.query("status") || undefined;
		const brandId = c.req.query("brandId") || undefined;
		const runs = await researchService.listRuns(workspaceId, { actorType, status, brandId });
		return c.json({ data: runs });
	});

	app.get("/runs/:runId", async (c) => {
		const run = await researchService.getRun(c.req.param("runId"));
		return c.json({ data: run });
	});

	app.get("/runs/:runId/results", async (c) => {
		const runId = c.req.param("runId");
		const skip = Number(c.req.query("skip") || "0");
		const take = Number(c.req.query("take") || "50");
		const results = await researchService.getRunResults(runId, skip, take);
		return c.json({ data: results });
	});

	app.get("/runs/:runId/results/:resultId", async (c) => {
		const result = await researchService.getResult(c.req.param("resultId"));
		return c.json({ data: result });
	});

	app.get("/runs/:runId/results/:resultId/as-context", async (c) => {
		const context = await researchService.getResultAsContext(c.req.param("resultId"));
		return c.json({ data: { context } });
	});

	return app;
}
