import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import {
	ALL_MEMBER_MENUS,
	DEFAULT_MEMBER_MENUS,
	MENU_KEYS,
	WORKSPACE_ROLES,
	isMenuKey,
	type MenuKey,
} from "../constants/roles";
import { QuotaExceededError } from "../errors/quota-exceeded-error";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
import { requireWorkspaceAdmin } from "../middlewares/rbac.middleware";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
	isSuperadmin: boolean;
};

function sanitizeMenuAccess(raw: unknown): MenuKey[] {
	if (!Array.isArray(raw)) return [];
	return Array.from(new Set(raw.filter(isMenuKey)));
}

function slugify(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

export function createProjectRoutes(prisma: PrismaClient, auditService: IAuditService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list projects. Members see the projects they belong to; workspace
	// admins and superadmins see every non-archived project in the workspace.
	//
	// Each row includes the caller's own membership (or `null` for admins /
	// superadmins who bypass project-level gating). The frontend uses this to
	// build menu + approver state without a second round-trip.
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const isSuperadmin = c.get("isSuperadmin");
		const workspaceRole = c.get("workspaceRole");
		const isAdmin = isSuperadmin || workspaceRole === WORKSPACE_ROLES.ADMIN;

		const projects = await prisma.project.findMany({
			where: {
				workspaceId,
				archivedAt: null,
				...(isAdmin
					? {}
					: { memberships: { some: { userId } } }),
			},
			orderBy: { createdAt: "asc" },
			select: {
				id: true,
				name: true,
				slug: true,
				description: true,
				createdAt: true,
				_count: { select: { memberships: true, brands: true } },
				memberships: {
					where: { userId },
					select: { isApprover: true, menuAccess: true },
					take: 1,
				},
			},
		});

		return c.json({
			data: projects.map((p) => ({
				id: p.id,
				name: p.name,
				slug: p.slug,
				description: p.description,
				createdAt: p.createdAt,
				_count: p._count,
				myMembership: p.memberships[0]
					? {
							isApprover: p.memberships[0].isApprover,
							menuAccess: sanitizeMenuAccess(p.memberships[0].menuAccess),
						}
					: null,
			})),
		});
	});

	// POST / — create project (admin only).
	app.post("/", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const isSuperadmin = c.get("isSuperadmin");
		const body = (await c.req.json()) as { name?: unknown; slug?: unknown; description?: unknown };
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (!name) return c.json({ error: "Name is required" }, 400);
		const slug =
			typeof body.slug === "string" && body.slug.trim()
				? slugify(body.slug)
				: slugify(name);
		const description = typeof body.description === "string" ? body.description : null;

		// Quota check: count projects this user has created across all workspaces.
		// Superadmins bypass. Legacy rows with createdById = null don't count.
		if (!isSuperadmin) {
			const user = await prisma.user.findUnique({
				where: { id: userId },
				select: { maxProjects: true },
			});
			if (!user) return c.json({ error: "User not found" }, 404);
			const current = await prisma.project.count({ where: { createdById: userId } });
			if (current >= user.maxProjects) {
				const err = new QuotaExceededError("projects", user.maxProjects, current);
				return c.json(
					{
						error: err.message,
						quotaExceeded: true,
						resource: err.resource,
						limit: err.limit,
						current: err.current,
					},
					403,
				);
			}
		}

		const existing = await prisma.project.findUnique({
			where: { workspaceId_slug: { workspaceId, slug } },
			select: { id: true },
		});
		if (existing) {
			return c.json({ error: `A project with slug "${slug}" already exists` }, 409);
		}

		const project = await prisma.project.create({
			data: { workspaceId, name, slug, description, createdById: userId },
		});
		await auditService.log({
			workspaceId,
			userId,
			action: "project.create",
			entityType: "project",
			entityId: project.id,
			metadata: { name: project.name, slug: project.slug },
		});
		return c.json({ data: project }, 201);
	});

	// GET /:projectId — single project
	app.get("/:projectId", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.req.param("projectId");
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: {
				id: true,
				workspaceId: true,
				name: true,
				slug: true,
				description: true,
				archivedAt: true,
				createdAt: true,
				_count: { select: { memberships: true, brands: true } },
			},
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}
		return c.json({ data: project });
	});

	// PATCH /:projectId — rename or describe (admin only).
	app.patch("/:projectId", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const projectId = c.req.param("projectId");
		const existing = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true, name: true, description: true },
		});
		if (!existing || existing.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}

		const body = (await c.req.json()) as { name?: unknown; description?: unknown };
		const data: { name?: string; description?: string | null } = {};
		if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
		if (body.description === null || typeof body.description === "string") {
			data.description = body.description as string | null;
		}
		if (Object.keys(data).length === 0) return c.json({ error: "No valid fields to update" }, 400);

		const project = await prisma.project.update({ where: { id: projectId }, data });

		const changes: Record<string, { from: unknown; to: unknown }> = {};
		if (typeof data.name === "string" && data.name !== existing.name) {
			changes.name = { from: existing.name, to: data.name };
		}
		if ("description" in data && data.description !== existing.description) {
			changes.description = { from: existing.description, to: data.description };
		}

		if (Object.keys(changes).length > 0) {
			await auditService.log({
				workspaceId,
				userId,
				action: "project.update",
				entityType: "project",
				entityId: projectId,
				metadata: { name: existing.name, changes },
			});
		}
		return c.json({ data: project });
	});

	// DELETE /:projectId — soft delete (move to Trash). Cascades the
	// archive to the project's brand so the whole tree disappears
	// together. Restoring (or permanent-deleting) the project is done
	// from the Trash UI.
	app.delete("/:projectId", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const projectId = c.req.param("projectId");
		const existing = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true, slug: true, name: true },
		});
		if (!existing || existing.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}
		if (existing.slug === "default") {
			return c.json({ error: "The Default project cannot be archived" }, 400);
		}
		const now = new Date();
		await prisma.$transaction([
			prisma.project.update({ where: { id: projectId }, data: { archivedAt: now } }),
			prisma.brand.updateMany({
				where: { projectId, archivedAt: null },
				data: { archivedAt: now },
			}),
		]);
		await auditService.log({
			workspaceId,
			userId,
			action: "project.archive",
			entityType: "project",
			entityId: projectId,
			metadata: { name: existing.name },
		});
		return c.body(null, 204);
	});

	// GET /:projectId/members — list project memberships (admin only for now;
	// members have no need to see other members' menu access).
	app.get("/:projectId/members", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.req.param("projectId");
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true },
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}

		const memberships = await prisma.userProjectMembership.findMany({
			where: { projectId },
			include: {
				user: { select: { id: true, email: true, fullName: true, avatarUrl: true } },
			},
			orderBy: { createdAt: "asc" },
		});

		return c.json({
			data: memberships.map((m) => ({
				id: m.id,
				userId: m.userId,
				user: m.user,
				isApprover: m.isApprover,
				menuAccess: sanitizeMenuAccess(m.menuAccess),
				createdAt: m.createdAt,
			})),
		});
	});

	// POST /:projectId/members — add a member (admin only).
	// Body: { userId: string, isApprover?: boolean, menuAccess?: MenuKey[] }
	app.post("/:projectId/members", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const actorUserId = c.get("userId");
		const projectId = c.req.param("projectId");
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true, name: true },
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}

		const body = (await c.req.json()) as {
			userId?: unknown;
			isApprover?: unknown;
			menuAccess?: unknown;
		};
		const userId = typeof body.userId === "string" ? body.userId : "";
		if (!userId) return c.json({ error: "userId is required" }, 400);

		// User must already exist AND be a member of this workspace somehow
		// (either UserWorkspaceRole row or another project membership).
		const user = await prisma.user.findUnique({
			where: { id: userId },
			select: { id: true, email: true },
		});
		if (!user) return c.json({ error: "User not found" }, 404);

		const workspaceRow = await prisma.userWorkspaceRole.findUnique({
			where: { userId_workspaceId: { userId, workspaceId } },
			select: { id: true },
		});
		if (!workspaceRow) {
			return c.json(
				{ error: "User is not a member of this workspace. Invite them first." },
				400,
			);
		}

		const menuAccess =
			body.menuAccess === undefined
				? DEFAULT_MEMBER_MENUS
				: sanitizeMenuAccess(body.menuAccess);
		const isApprover = body.isApprover === true;

		const membership = await prisma.userProjectMembership.upsert({
			where: { userId_projectId: { userId, projectId } },
			update: { isApprover, menuAccess: menuAccess as unknown as object },
			create: {
				userId,
				projectId,
				isApprover,
				menuAccess: menuAccess as unknown as object,
			},
		});

		await auditService.log({
			workspaceId,
			userId: actorUserId,
			action: "project.member_add",
			entityType: "project_member",
			entityId: userId,
			metadata: {
				projectId,
				projectName: project.name,
				targetEmail: user.email,
				isApprover: membership.isApprover,
				menuAccess,
			},
		});

		return c.json({ data: { ...membership, menuAccess } }, 201);
	});

	// PATCH /:projectId/members/:userId — update isApprover and/or menuAccess.
	app.patch("/:projectId/members/:userId", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const actorUserId = c.get("userId");
		const projectId = c.req.param("projectId");
		const userId = c.req.param("userId");
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true, name: true },
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}

		const body = (await c.req.json()) as { isApprover?: unknown; menuAccess?: unknown };
		const patch: { isApprover?: boolean; menuAccess?: object } = {};
		if (typeof body.isApprover === "boolean") patch.isApprover = body.isApprover;
		if (body.menuAccess !== undefined) {
			patch.menuAccess = sanitizeMenuAccess(body.menuAccess) as unknown as object;
		}
		if (Object.keys(patch).length === 0) {
			return c.json({ error: "No valid fields to update" }, 400);
		}

		const before = await prisma.userProjectMembership.findUnique({
			where: { userId_projectId: { userId, projectId } },
			select: { isApprover: true, menuAccess: true },
		});

		try {
			const membership = await prisma.userProjectMembership.update({
				where: { userId_projectId: { userId, projectId } },
				data: patch,
			});

			const beforeMenuAccess = before ? sanitizeMenuAccess(before.menuAccess) : [];
			const afterMenuAccess = sanitizeMenuAccess(membership.menuAccess);
			const changes: Record<string, { from: unknown; to: unknown }> = {};
			if (
				before &&
				typeof patch.isApprover === "boolean" &&
				patch.isApprover !== before.isApprover
			) {
				changes.isApprover = { from: before.isApprover, to: patch.isApprover };
			}
			if (
				before &&
				patch.menuAccess !== undefined &&
				JSON.stringify(afterMenuAccess) !== JSON.stringify(beforeMenuAccess)
			) {
				changes.menuAccess = { from: beforeMenuAccess, to: afterMenuAccess };
			}

			if (Object.keys(changes).length > 0) {
				const target = await prisma.user.findUnique({
					where: { id: userId },
					select: { email: true },
				});
				await auditService.log({
					workspaceId,
					userId: actorUserId,
					action: "project.member_update",
					entityType: "project_member",
					entityId: userId,
					metadata: {
						projectId,
						projectName: project.name,
						targetEmail: target?.email ?? null,
						changes,
					},
				});
			}

			return c.json({
				data: { ...membership, menuAccess: afterMenuAccess },
			});
		} catch {
			return c.json({ error: "Membership not found" }, 404);
		}
	});

	// DELETE /:projectId/members/:userId — remove a member.
	app.delete("/:projectId/members/:userId", requireWorkspaceAdmin(), async (c) => {
		const workspaceId = c.get("workspaceId");
		const actorUserId = c.get("userId");
		const projectId = c.req.param("projectId");
		const userId = c.req.param("userId");
		const project = await prisma.project.findUnique({
			where: { id: projectId },
			select: { workspaceId: true, name: true },
		});
		if (!project || project.workspaceId !== workspaceId) {
			return c.json({ error: "Project not found" }, 404);
		}
		const target = await prisma.user.findUnique({
			where: { id: userId },
			select: { email: true },
		});
		try {
			await prisma.userProjectMembership.delete({
				where: { userId_projectId: { userId, projectId } },
			});
			await auditService.log({
				workspaceId,
				userId: actorUserId,
				action: "project.member_remove",
				entityType: "project_member",
				entityId: userId,
				metadata: {
					projectId,
					projectName: project.name,
					targetEmail: target?.email ?? null,
				},
			});
			return c.body(null, 204);
		} catch {
			return c.json({ error: "Membership not found" }, 404);
		}
	});

	// GET /menu-keys — exposes the canonical list for the admin UI dropdown.
	app.get("/menu-keys", async (c) => {
		return c.json({ data: { all: MENU_KEYS, allGranted: ALL_MEMBER_MENUS } });
	});

	return app;
}
