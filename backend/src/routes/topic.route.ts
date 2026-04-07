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
		const { brandId, productId, platform, count } = body;
		const result = await topicService.generate(workspaceId, userId, {
			brandId,
			productId,
			platform,
			count,
		});
		return c.json({ data: result }, 202);
	});

	// POST / — create single topic
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const {
			brandId,
			productId,
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
			productId,
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

	return app;
}
