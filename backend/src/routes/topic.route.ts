import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { ITopicService } from "../interfaces/services/topic.service.interface";
import { WORKSPACE_ROLES } from "../constants/roles";
import { requireApprover } from "../middlewares/rbac.middleware";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
	isSuperadmin: boolean;
	isApprover?: boolean;
};

/**
 * A non-approver member can still edit topic metadata (title, description,
 * pillar, etc.) — only the `status` field is gated behind the approver
 * attribute. Workspace admins and superadmins bypass this.
 *
 * Topic status endpoints are workspace-scoped (no `:projectId` in URL) so we
 * look for "any approver membership in this workspace" via prisma. Matches
 * the pragmatic v1 behavior defined in `requireApprover(prisma)`.
 */
async function canChangeStatus(
	prisma: PrismaClient,
	isSuperadmin: boolean | undefined,
	workspaceRole: string | undefined,
	userId: string,
	workspaceId: string,
): Promise<boolean> {
	if (isSuperadmin) return true;
	if (workspaceRole === WORKSPACE_ROLES.ADMIN) return true;
	const hit = await prisma.userProjectMembership.findFirst({
		where: { userId, isApprover: true, project: { workspaceId } },
		select: { id: true },
	});
	return Boolean(hit);
}

export function createTopicRoutes(topicService: ITopicService, prisma: PrismaClient) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list topics
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const campaignId = c.req.query("campaignId") || undefined;
		const topics = await topicService.list(workspaceId, { campaignId });
		return c.json({ data: topics });
	});

	// POST /generate — generate topics via AI (enqueues job)
	app.post("/generate", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			pillar,
			language,
			dateFrom,
			dateTo,
			count,
			prompt,
			referenceImages,
		} = body;
		const result = await topicService.generate(workspaceId, userId, {
			brandId,
			productIds,
			platform,
			objective,
			formats,
			pillar,
			language,
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
		const { brandId, productIds, platform, format, objective, pillar, language, hint } = body;
		const result = await topicService.regeneratePreview(
			workspaceId,
			userId,
			{ brandId, productIds, platform, format, objective, pillar, language },
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

	// PATCH /:id — update topic. The `status` field is approver-gated; all
	// other fields (title, description, platform, etc.) are editable by any
	// workspace member with the topic-library menu.
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		if (body && typeof body === "object" && "status" in body) {
			const ok = await canChangeStatus(
				prisma,
				c.get("isSuperadmin"),
				c.get("workspaceRole"),
				c.get("userId"),
				c.get("workspaceId"),
			);
			if (!ok) {
				return c.json(
					{ error: "Only approvers can change topic status" },
					403,
				);
			}
		}
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
