import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createAiLogRoutes(prisma: PrismaClient) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — List AI activity logs for workspace
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const generator = c.req.query("generator") ?? "";
		const status = c.req.query("status") ?? "";
		const limit = Math.min(Number.parseInt(c.req.query("limit") ?? "50"), 200);
		const offset = Number.parseInt(c.req.query("offset") ?? "0");

		const where: Record<string, unknown> = { workspaceId };
		if (generator) where.generator = generator;
		if (status) where.status = status;

		const [logs, total] = await Promise.all([
			prisma.aiProviderLog.findMany({
				where: where as any,
				orderBy: { createdAt: "desc" },
				take: limit,
				skip: offset,
				select: {
					id: true,
					generator: true,
					provider: true,
					model: true,
					requestId: true,
					brandId: true,
					productId: true,
					platform: true,
					contentType: true,
					skillNames: true,
					inputTokens: true,
					outputTokens: true,
					durationMs: true,
					estimatedCost: true,
					status: true,
					errorMessage: true,
					createdAt: true,
				},
			}),
			prisma.aiProviderLog.count({ where: where as any }),
		]);

		return c.json({ data: logs, total });
	});

	// GET /usage — Token usage summary for current user
	app.get("/usage", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");

		const logs = await prisma.aiProviderLog.findMany({
			where: { workspaceId, userId },
			select: {
				inputTokens: true,
				outputTokens: true,
				estimatedCost: true,
			},
		});

		const totalInput = logs.reduce((sum, l) => sum + (l.inputTokens ?? 0), 0);
		const totalOutput = logs.reduce((sum, l) => sum + (l.outputTokens ?? 0), 0);
		const totalCost = logs.reduce((sum, l) => sum + Number(l.estimatedCost ?? 0), 0);

		return c.json({
			data: {
				totalInputTokens: totalInput,
				totalOutputTokens: totalOutput,
				totalTokens: totalInput + totalOutput,
				totalCost,
				generationCount: logs.length,
			},
		});
	});

	// GET /:id — Get full log detail (includes prompts and response)
	app.get("/:id", async (c) => {
		const workspaceId = c.get("workspaceId");
		const log = await prisma.aiProviderLog.findFirst({
			where: { id: c.req.param("id"), workspaceId },
		});
		if (!log) return c.json({ error: "Log not found" }, 404);
		return c.json({ data: log });
	});

	// GET /stats — Aggregate stats
	app.get("/stats/summary", async (c) => {
		const workspaceId = c.get("workspaceId");

		const [totalLogs, byGenerator, byProvider, recentErrors] = await Promise.all([
			prisma.aiProviderLog.count({ where: { workspaceId } }),
			prisma.aiProviderLog.groupBy({
				by: ["generator"],
				where: { workspaceId },
				_count: true,
			}),
			prisma.aiProviderLog.groupBy({
				by: ["provider"],
				where: { workspaceId },
				_count: true,
			}),
			prisma.aiProviderLog.count({ where: { workspaceId, status: "error" } }),
		]);

		return c.json({
			data: {
				totalLogs,
				errorCount: recentErrors,
				byGenerator: Object.fromEntries(byGenerator.map((g) => [g.generator, g._count])),
				byProvider: Object.fromEntries(byProvider.map((p) => [p.provider, p._count])),
			},
		});
	});

	return app;
}
