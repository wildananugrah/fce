import { Hono } from "hono";
import type { ITopicService } from "../interfaces/services/topic.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createTopicRoutes(topicService: ITopicService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list topics
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const topics = await topicService.list(workspaceId);
		return c.json({ data: topics });
	});

	// POST /generate — generate topics via AI (enqueues job)
	app.post("/generate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productIds, platform, objective, formats, dateFrom, dateTo, count, prompt, referenceImages } = body;
		const result = await topicService.generate(workspaceId, userId, {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			dateFrom,
			dateTo,
			count,
			prompt,
			referenceImages,
		});
		return c.json({ data: result }, 202);
	});

	// POST /regenerate-preview — regenerate a single topic in preview (before save)
	app.post("/regenerate-preview", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productIds, platform, format, objective, hint } = body;
		const result = await topicService.regeneratePreview(
			workspaceId,
			userId,
			{ brandId, productIds, platform, format, objective },
			hint,
		);
		return c.json({ data: result }, 202);
	});

	// DELETE /bulk — bulk delete topics
	app.delete("/bulk", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await topicService.deleteMany(workspaceId, ids);
		return c.json({ deleted });
	});

	// PATCH /bulk-status — bulk status change
	app.patch("/bulk-status", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids, status } = await c.req.json<{ ids: string[]; status: string }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		if (!status) {
			return c.json({ error: "status is required" }, 400);
		}
		try {
			const updated = await topicService.updateManyStatus(workspaceId, ids, status);
			return c.json({ updated });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Invalid status" }, 400);
		}
	});

	// POST / — create single topic
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const {
			brandId,
			productIds,
			title,
			description,
			pillar,
			platform,
			format,
			objective,
			publishDate,
		} = body;
		if (!title) {
			return c.json({ error: "title is required" }, 400);
		}
		const topic = await topicService.create(workspaceId, {
			brandId,
			productIds,
			title,
			description,
			pillar,
			platform,
			format,
			objective,
			publishDate,
		});
		return c.json({ data: topic }, 201);
	});

	// GET /:id — get topic
	app.get("/:id", async (c) => {
		const topic = await topicService.getById(c.req.param("id"));
		return c.json({ data: topic });
	});

	// PATCH /:id — update topic
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const topic = await topicService.update(c.req.param("id"), body);
		return c.json({ data: topic });
	});

	// POST /:id/regenerate — regenerate a single saved topic
	app.post("/:id/regenerate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const topicId = c.req.param("id");
		const body = await c.req.json().catch(() => ({}));
		const { hint } = body;
		const result = await topicService.regenerate(workspaceId, userId, topicId, hint);
		return c.json({ data: result }, 202);
	});

	return app;
}
