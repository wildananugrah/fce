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

	// DELETE /bulk — bulk delete outputs
	app.delete("/bulk", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await libraryService.deleteMany(workspaceId, ids);
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
			const updated = await libraryService.updateManyStatus(workspaceId, ids, status);
			return c.json({ updated });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Invalid status" }, 400);
		}
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

	// GET /:id/sections — get sections for an output
	app.get("/:id/sections", async (c) => {
		const sections = await libraryService.getSections(c.req.param("id"));
		return c.json({ data: sections });
	});

	// PATCH /:id/sections/:sectionId — update section content
	app.patch("/:id/sections/:sectionId", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { contentText } = body;
		if (!contentText) {
			return c.json({ error: "contentText is required" }, 400);
		}
		const section = await libraryService.updateSection(c.req.param("sectionId"), contentText, userId);
		return c.json({ data: section });
	});

	return app;
}
