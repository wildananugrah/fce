import { Hono } from "hono";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createWorkspaceRoutes(workspaceService: IWorkspaceService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list user's workspaces
	app.get("/", async (c) => {
		const userId = c.get("userId");
		const workspaces = await workspaceService.listByUser(userId);
		return c.json({ data: workspaces });
	});

	// POST / — create workspace
	app.post("/", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { name, slug, description } = body;
		if (!name || !slug) {
			return c.json({ error: "Name and slug are required" }, 400);
		}
		const workspace = await workspaceService.create(userId, { name, slug, description });
		return c.json({ data: workspace }, 201);
	});

	// DELETE /:id — delete workspace (admin or creator)
	app.delete("/:id", async (c) => {
		const userId = c.get("userId");
		const workspaceId = c.req.param("id");
		// If the workspace was already deleted (e.g. stale browser cache),
		// short-circuit with a 204 instead of a 403 so the UI can move on.
		const existing = await workspaceService.getByIdSafe(workspaceId);
		if (!existing) {
			return c.body(null, 204);
		}
		if (!(await workspaceService.canManage(userId, workspaceId))) {
			return c.json({ error: "Admin or creator access required" }, 403);
		}
		await workspaceService.delete(workspaceId, userId);
		return c.body(null, 204);
	});

	// GET /:id — get workspace
	app.get("/:id", async (c) => {
		const workspace = await workspaceService.getById(c.req.param("id"));
		return c.json({ data: workspace });
	});

	// PATCH /:id — update workspace
	app.patch("/:id", async (c) => {
		const userId = c.get("userId");
		const workspaceId = c.req.param("id");
		if (!(await workspaceService.canManage(userId, workspaceId))) {
			return c.json({ error: "Admin or creator access required" }, 403);
		}
		const body = await c.req.json();
		const workspace = await workspaceService.update(workspaceId, body);
		return c.json({ data: workspace });
	});

	// GET /:id/members — list members
	app.get("/:id/members", async (c) => {
		const members = await workspaceService.listMembers(c.req.param("id"));
		return c.json({ data: members });
	});

	// POST /:id/invitations — invite member
	app.post("/:id/invitations", async (c) => {
		const userId = c.get("userId");
		const workspaceId = c.req.param("id");
		const role = await workspaceService.getMemberRole(userId, workspaceId);
		if (role !== "admin") {
			return c.json({ error: "Admin access required" }, 403);
		}
		const body = await c.req.json();
		if (!body.email) {
			return c.json({ error: "Email is required" }, 400);
		}
		const invitation = await workspaceService.invite(c.req.param("id"), userId, body);
		return c.json({ data: invitation }, 201);
	});

	// GET /:id/invitations — list invitations
	app.get("/:id/invitations", async (c) => {
		const invitations = await workspaceService.listInvitations(c.req.param("id"));
		return c.json({ data: invitations });
	});

	// PATCH /:id/invitations/:invId — accept/revoke invitation
	app.patch("/:id/invitations/:invId", async (c) => {
		const body = await c.req.json();
		if (body.status === "accepted") {
			const userId = c.get("userId");
			const userEmail = c.get("userEmail");
			await workspaceService.acceptInvitation(c.req.param("invId"), userId, userEmail);
			return c.json({ data: { status: "accepted" } });
		}
		const invitation = await workspaceService.updateInvitation(c.req.param("invId"), body);
		return c.json({ data: invitation });
	});

	// DELETE /:id/members/:memberId — remove member
	app.delete("/:id/members/:memberId", async (c) => {
		const userId = c.get("userId");
		const workspaceId = c.req.param("id");
		const role = await workspaceService.getMemberRole(userId, workspaceId);
		if (role !== "admin") {
			return c.json({ error: "Admin access required" }, 403);
		}
		await workspaceService.removeMember(workspaceId, c.req.param("memberId"));
		return c.json({ data: { success: true } });
	});

	return app;
}
