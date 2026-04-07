import { Hono } from "hono";
import type { ILibraryService } from "../interfaces/services/library.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createLibraryRoutes(libraryService: ILibraryService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list outputs
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const outputs = await libraryService.list(workspaceId);
		return c.json({ data: outputs });
	});

	// PATCH /:id — update status (approve/reject)
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const { status } = body;
		if (!status) {
			return c.json({ error: "status is required" }, 400);
		}
		const output = await libraryService.updateStatus(c.req.param("id"), status);
		return c.json({ data: output });
	});

	// POST /:id/feedback — add feedback event
	app.post("/:id/feedback", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { eventType, before, after } = body;
		if (!eventType) {
			return c.json({ error: "eventType is required" }, 400);
		}
		const feedback = await libraryService.addFeedback(
			c.req.param("id"),
			eventType,
			userId,
			before,
			after,
		);
		return c.json({ data: feedback }, 201);
	});

	return app;
}
