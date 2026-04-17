import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { IChatService } from "../interfaces/services/chat.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createCampaignChatRoutes(chatService: IChatService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /:id/chat — list chat history chronologically.
	app.get("/:id/chat", async (c) => {
		const campaignId = c.req.param("id");
		const messages = await chatService.listMessages(campaignId);
		return c.json({ data: messages });
	});

	// POST /:id/chat — send a message; stream SSE response.
	app.post("/:id/chat", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const campaignId = c.req.param("id");
		const body = await c.req.json();
		const content = typeof body.content === "string" ? body.content : "";
		const attachments = Array.isArray(body.attachments) ? body.attachments : [];

		if (!content.trim() && attachments.length === 0) {
			return c.json({ error: "content or attachments required" }, 400);
		}

		return streamSSE(c, async (stream) => {
			try {
				for await (const evt of chatService.sendMessage({
					workspaceId,
					campaignId,
					userId,
					content,
					attachments,
				})) {
					await stream.writeSSE({
						event: evt.type,
						data: JSON.stringify(evt),
					});
				}
			} catch (e) {
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({
						type: "error",
						message: e instanceof Error ? e.message : String(e),
					}),
				});
			}
		});
	});

	// POST /:id/chat/upload — multipart file upload.
	app.post("/:id/chat/upload", async (c) => {
		const workspaceId = c.get("workspaceId");
		const campaignId = c.req.param("id");
		const form = await c.req.formData();
		const file = form.get("file");
		if (!(file instanceof File)) {
			return c.json({ error: "file is required" }, 400);
		}
		try {
			const result = await chatService.uploadAttachment({ workspaceId, campaignId, file });
			return c.json({ data: result });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Upload failed" }, 400);
		}
	});

	// GET /:id/revisions — list plan revisions.
	app.get("/:id/revisions", async (c) => {
		const campaignId = c.req.param("id");
		const revisions = await chatService.listRevisions(campaignId);
		return c.json({ data: revisions });
	});

	// POST /:id/revisions/:revId/restore — implemented in Phase 7.
	app.post("/:id/revisions/:revId/restore", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const campaignId = c.req.param("id");
		const revisionId = c.req.param("revId");

		return streamSSE(c, async (stream) => {
			try {
				for await (const evt of chatService.restoreRevision({
					workspaceId,
					campaignId,
					revisionId,
					userId,
				})) {
					await stream.writeSSE({
						event: evt.type,
						data: JSON.stringify(evt),
					});
				}
			} catch (e) {
				await stream.writeSSE({
					event: "error",
					data: JSON.stringify({
						type: "error",
						message: e instanceof Error ? e.message : String(e),
					}),
				});
			}
		});
	});

	return app;
}
