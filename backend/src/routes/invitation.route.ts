import { Hono } from "hono";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
};

/**
 * Public: GET /:token — returns invitation metadata without auth so the
 * accept page can render before the user has logged in.
 */
export function createPublicInvitationRoutes(workspaceService: IWorkspaceService) {
	const app = new Hono();

	app.get("/:token", async (c) => {
		const token = c.req.param("token");
		const info = await workspaceService.getInvitationByToken(token);
		if (!info) return c.json({ error: "Invitation not found" }, 404);
		return c.json({ data: info });
	});

	return app;
}

/**
 * Authenticated: POST /:token/accept.
 */
export function createAuthenticatedInvitationRoutes(workspaceService: IWorkspaceService) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/:token/accept", async (c) => {
		const userId = c.get("userId");
		const userEmail = c.get("userEmail");
		const token = c.req.param("token");
		await workspaceService.acceptInvitation(token, userId, userEmail);
		const info = await workspaceService.getInvitationByToken(token);
		return c.json({ data: info });
	});

	return app;
}

export function createMeInvitationRoutes(workspaceService: IWorkspaceService) {
	const app = new Hono<{ Variables: Variables }>();

	app.get("/invitations", async (c) => {
		const email = c.get("userEmail");
		const invitations = await workspaceService.listPendingForEmail(email);
		return c.json({ data: invitations });
	});

	return app;
}
