import type { PrismaClient } from "@prisma/client";
import { createMiddleware } from "hono/factory";
import { WORKSPACE_ROLES, isMenuKey, type MenuKey } from "../constants/roles";

/**
 * Context keys this file contributes (via project middleware):
 *   - projectId: string | null   (null when the route is workspace-scoped with no specific project)
 *   - isProjectMember: boolean
 *   - isApprover: boolean
 *   - menuAccess: MenuKey[]
 *
 * Pre-existing context keys this file reads:
 *   - userId:         from auth middleware
 *   - isSuperadmin:   from auth middleware (JWT claim)
 *   - workspaceId:    from workspace middleware
 *   - workspaceRole:  from workspace middleware
 */

type RbacVariables = {
	userId?: string;
	isSuperadmin?: boolean;
	workspaceId?: string;
	workspaceRole?: string;
	projectId?: string | null;
	isProjectMember?: boolean;
	isApprover?: boolean;
	menuAccess?: MenuKey[];
};

/** Superadmin bypass + workspace admin bypass — both are implicitly allowed for every project action. */
function hasWorkspaceBypass(isSuperadmin: boolean | undefined, workspaceRole: string | undefined): boolean {
	return Boolean(isSuperadmin) || workspaceRole === WORKSPACE_ROLES.ADMIN;
}

function sanitizeMenuAccess(raw: unknown): MenuKey[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter(isMenuKey);
}

/**
 * Resolves project membership for the current user + `:projectId` route param.
 *
 * Flow:
 *   1. If no `:projectId` in the route, this middleware is a no-op (the guard
 *      factories below still work — they check `workspaceRole` as fallback).
 *   2. Verifies the project belongs to the workspace on the context.
 *   3. Superadmin / workspace admin bypass → treated as if they were a member
 *      with all menus + approver.
 *   4. Otherwise, loads the UserProjectMembership and injects it.
 */
export function createProjectMiddleware(prisma: PrismaClient) {
	return createMiddleware<{ Variables: RbacVariables }>(async (c, next) => {
		const projectId = c.req.param("projectId");
		if (!projectId) {
			// Route is not project-scoped; guards can still run against the
			// workspace role. Leave context fields unset.
			await next();
			return;
		}

		const workspaceId = c.get("workspaceId");
		if (!workspaceId) {
			return c.json({ error: "Project routes require a workspace context" }, 400);
		}

		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { id: true, workspaceId: true },
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}

		const userId = c.get("userId");
		const isSuperadmin = c.get("isSuperadmin");
		const workspaceRole = c.get("workspaceRole");

		c.set("projectId", projectId);

		if (hasWorkspaceBypass(isSuperadmin, workspaceRole)) {
			// Admins implicitly have full access to every project in their workspace.
			c.set("isProjectMember", true);
			c.set("isApprover", true);
			c.set("menuAccess", [] as MenuKey[]); // unused when bypass is true
			await next();
			return;
		}

		const membership = await prisma.userProjectMembership.findUnique({
			where: { userId_projectId: { userId: userId as string, projectId } },
			select: { isApprover: true, menuAccess: true },
		});
		if (!membership) {
			return c.json({ error: "Not a member of this project" }, 403);
		}

		c.set("isProjectMember", true);
		c.set("isApprover", membership.isApprover);
		c.set("menuAccess", sanitizeMenuAccess(membership.menuAccess));
		await next();
	});
}

/** Guard factory: allows superadmin, workspace admin, or a member that has `menuKey` in their `menuAccess`. */
export function requireMenu(menuKey: MenuKey) {
	return createMiddleware<{ Variables: RbacVariables }>(async (c, next) => {
		const isSuperadmin = c.get("isSuperadmin");
		const workspaceRole = c.get("workspaceRole");
		if (hasWorkspaceBypass(isSuperadmin, workspaceRole)) {
			await next();
			return;
		}
		const menus = c.get("menuAccess") ?? [];
		if (!menus.includes(menuKey)) {
			return c.json({ error: `Forbidden: missing "${menuKey}" menu access` }, 403);
		}
		await next();
	});
}

/** Guard factory: allows superadmin, workspace admin, or a member with `isApprover=true`. */
export function requireApprover() {
	return createMiddleware<{ Variables: RbacVariables }>(async (c, next) => {
		const isSuperadmin = c.get("isSuperadmin");
		const workspaceRole = c.get("workspaceRole");
		if (hasWorkspaceBypass(isSuperadmin, workspaceRole)) {
			await next();
			return;
		}
		if (!c.get("isApprover")) {
			return c.json({ error: "Forbidden: approver access required" }, 403);
		}
		await next();
	});
}

/** Guard factory: allows superadmin or workspace admin. Members — even approvers — are rejected. */
export function requireWorkspaceAdmin() {
	return createMiddleware<{ Variables: RbacVariables }>(async (c, next) => {
		const isSuperadmin = c.get("isSuperadmin");
		const workspaceRole = c.get("workspaceRole");
		if (!hasWorkspaceBypass(isSuperadmin, workspaceRole)) {
			return c.json({ error: "Forbidden: workspace admin access required" }, 403);
		}
		await next();
	});
}

/** Guard factory: allows superadmin only. */
export function requireSuperadmin() {
	return createMiddleware<{ Variables: RbacVariables }>(async (c, next) => {
		if (!c.get("isSuperadmin")) {
			return c.json({ error: "Forbidden: superadmin access required" }, 403);
		}
		await next();
	});
}
