import { Hono } from "hono";
import type { IGenerationService } from "../interfaces/services/generation.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createGenerationRoutes(generationService: IGenerationService) {
	const app = new Hono<{ Variables: Variables }>();

	// POST / — create generation request (enqueues job)
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, productId, platform, contentType, framework, hookType, language, prompt } =
			body;
		if (!brandId || !platform || !contentType || !framework || !hookType) {
			return c.json(
				{ error: "brandId, platform, contentType, framework, and hookType are required" },
				400,
			);
		}
		const request = await generationService.create(workspaceId, userId, {
			brandId,
			productId,
			platform,
			contentType,
			framework,
			hookType,
			language,
			prompt,
		});
		return c.json({ data: request }, 201);
	});

	// GET / — list generation requests
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const requests = await generationService.list(workspaceId);
		return c.json({ data: requests });
	});

	// GET /:id — get request with outputs
	app.get("/:id", async (c) => {
		const request = await generationService.getById(c.req.param("id"));
		return c.json({ data: request });
	});

	return app;
}
