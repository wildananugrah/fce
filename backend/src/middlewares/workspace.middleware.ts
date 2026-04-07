import { createMiddleware } from "hono/factory";
import type { IWorkspaceRepository } from "../interfaces/repositories/workspace.repository.interface";

export function createWorkspaceMiddleware(workspaceRepo: IWorkspaceRepository) {
	return createMiddleware(async (c, next) => {
		const workspaceId = c.req.param("workspaceId");
		if (!workspaceId) {
			return c.json({ error: "Workspace ID required" }, 400);
		}

		const userId = c.get("userId");
		const role = await workspaceRepo.findRole(userId, workspaceId);
		if (!role) {
			return c.json({ error: "Not a member of this workspace" }, 403);
		}

		c.set("workspaceId", workspaceId);
		c.set("workspaceRole", role.role);
		await next();
	});
}
