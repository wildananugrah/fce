import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { ILibraryService } from "../interfaces/services/library.service.interface";
import type { SceneImageService } from "../services/scene-image.service";
import { requireApprover } from "../middlewares/rbac.middleware";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
	isSuperadmin: boolean;
	isApprover?: boolean;
};

export function createLibraryRoutes(
	libraryService: ILibraryService,
	prisma: PrismaClient,
	sceneImageService?: SceneImageService,
) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list outputs
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const status = c.req.query("status") || undefined;
		const projectId = c.req.query("projectId") || undefined;
		const outputs = await libraryService.list(workspaceId, status, projectId);
		return c.json({ data: outputs });
	});

	// DELETE /bulk — soft-delete (archive). Outputs move into Trash.
	app.delete("/bulk", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await libraryService.deleteMany(workspaceId, ids);
		return c.json({ deleted });
	});

	app.post("/bulk-restore", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const restored = await libraryService.restoreMany(workspaceId, ids);
		return c.json({ restored });
	});

	app.delete("/bulk-permanent", async (c) => {
		const workspaceId = c.get("workspaceId");
		const { ids } = await c.req.json<{ ids: string[] }>();
		if (!Array.isArray(ids) || ids.length === 0) {
			return c.json({ error: "ids must be a non-empty array" }, 400);
		}
		const deleted = await libraryService.permanentDeleteMany(workspaceId, ids);
		return c.json({ deleted });
	});

	// PATCH /bulk-status — bulk status change (approver-only)
	app.patch("/bulk-status", requireApprover(prisma), async (c) => {
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

	// PATCH /:id — update status (approve/reject/draft/in_review) — approver-only
	// Optional { note } carried alongside. Required when status === "rejected".
	app.patch("/:id", requireApprover(prisma), async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { status, note } = body as { status?: string; note?: string };
		if (!status) {
			return c.json({ error: "status is required" }, 400);
		}
		// Fetch current output to get oldStatus for the history event.
		const existing = await libraryService.list(c.get("workspaceId"));
		const current = existing.find((o: any) => o.id === c.req.param("id"));
		if (!current) {
			return c.json({ error: "Output not found" }, 404);
		}
		try {
			const output = await libraryService.changeStatus(
				c.req.param("id"),
				status,
				userId,
				current.status,
				note,
			);
			return c.json({ data: output });
		} catch (e) {
			return c.json(
				{ error: e instanceof Error ? e.message : "Failed to update status" },
				400,
			);
		}
	});

	// GET /:id/history — status-change history for the output (approver-only)
	app.get("/:id/history", requireApprover(prisma), async (c) => {
		const history = await libraryService.listStatusHistory(c.req.param("id"));
		return c.json({ data: history });
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

	// POST /:id/sections — create a new section lazily (for cases where an
	// older output lacks a dedicated section but has the data in content.*).
	app.post("/:id/sections", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { sectionType, contentText } = body as {
			sectionType?: string;
			contentText?: string;
		};
		if (!sectionType || typeof contentText !== "string") {
			return c.json({ error: "sectionType and contentText are required" }, 400);
		}
		const section = await libraryService.createSection(
			c.req.param("id"),
			sectionType,
			contentText,
			userId,
		);
		return c.json({ data: section }, 201);
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
		const section = await libraryService.updateSection(
			c.req.param("sectionId"),
			contentText,
			userId,
		);
		return c.json({ data: section });
	});

	// POST /:id/post-image/generate — ensure a post_image section exists for
	// single-image content (creating it lazily for older outputs), then
	// generate the image. Returns the updated section so the frontend can
	// inject it into local state.
	app.post("/:id/post-image/generate", async (c) => {
		if (!sceneImageService) {
			return c.json({ error: "Scene image generation is not configured" }, 501);
		}
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		try {
			const result = await sceneImageService.ensureAndGenerateForPostImage(
				workspaceId,
				c.req.param("id"),
				userId,
			);
			// Look up the full section so the client can add it to its list.
			const section = await libraryService.getSections(c.req.param("id"));
			const created = section.find((s) => s.id === result.sectionId);
			return c.json({ data: { ...result, section: created } });
		} catch (e) {
			return c.json(
				{ error: e instanceof Error ? e.message : "Failed to generate image" },
				400,
			);
		}
	});

	// POST /:id/sections/:sectionId/generate-image — synchronously generate an
	// image for a video-script scene via Imagen, upload to MinIO, and patch the
	// section JSON with the new referenceImageUrl.
	app.post("/:id/sections/:sectionId/generate-image", async (c) => {
		if (!sceneImageService) {
			return c.json({ error: "Scene image generation is not configured" }, 501);
		}
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		try {
			const result = await sceneImageService.generateForSection(
				workspaceId,
				c.req.param("id"),
				c.req.param("sectionId"),
				userId,
			);
			return c.json({ data: result });
		} catch (e) {
			return c.json(
				{ error: e instanceof Error ? e.message : "Failed to generate image" },
				400,
			);
		}
	});

	// PATCH /:id/sections/bulk — bulk update section texts
	app.patch("/:id/sections/bulk", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { sections } = body;
		if (!Array.isArray(sections) || sections.length === 0) {
			return c.json({ error: "sections must be a non-empty array" }, 400);
		}
		const results = [];
		for (const s of sections) {
			if (!s.id || !s.contentText) continue;
			const updated = await libraryService.updateSection(s.id, s.contentText, userId);
			results.push(updated);
		}
		return c.json({ data: results });
	});

	return app;
}
