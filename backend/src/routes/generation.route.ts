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
		const workspaceId = c.get("workspaceId" as any);
		const userId = c.get("userId" as any);
		const body = await c.req.json();

		const request = await generationService.create(workspaceId, userId, {
			brandId: body.brandId,
			productId: body.productId,
			productIds: body.productIds,
			contentTopicId: body.contentTopicId,
			platform: body.platform,
			contentType: body.contentType,
			framework: body.framework,
			hookType: body.hookType,
			language: body.language,
			prompt: body.prompt,
			objective: body.objective,
			tonePreset: body.tonePreset,
			visualStyle: body.visualStyle,
			outputLength: body.outputLength,
			referenceImages: body.referenceImages,
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
