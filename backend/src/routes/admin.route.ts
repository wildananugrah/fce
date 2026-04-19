import { Hono } from "hono";
import type { IAdminService } from "../interfaces/services/admin.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	isSuperadmin: boolean;
};

export function createAdminRoutes(adminService: IAdminService) {
	const app = new Hono<{ Variables: Variables }>();

	app.get("/users", async (c) => {
		const users = await adminService.listUsers();
		return c.json({ data: users });
	});

	app.post("/users", async (c) => {
		const body = (await c.req.json()) as {
			email?: unknown;
			password?: unknown;
			fullName?: unknown;
			isSuperadmin?: unknown;
		};
		if (typeof body.email !== "string" || typeof body.password !== "string") {
			return c.json({ error: "email and password are required" }, 400);
		}
		try {
			const user = await adminService.createUser({
				email: body.email,
				password: body.password,
				fullName: typeof body.fullName === "string" ? body.fullName : undefined,
				isSuperadmin: body.isSuperadmin === true,
			});
			return c.json({ data: user }, 201);
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Failed to create user" }, 400);
		}
	});

	app.patch("/users/:id", async (c) => {
		const userId = c.req.param("id");
		const body = await c.req.json();
		const user = await adminService.updateUser(userId, body);
		return c.json({ data: user });
	});

	app.delete("/users/:id", async (c) => {
		const userId = c.req.param("id");
		// Prevent a superadmin from deleting their own row by accident.
		const actingUserId = c.get("userId");
		if (actingUserId === userId) {
			return c.json({ error: "You cannot delete your own account from this page" }, 400);
		}
		await adminService.deleteUser(userId);
		return c.body(null, 204);
	});

	app.post("/users/:id/password", async (c) => {
		const userId = c.req.param("id");
		const body = (await c.req.json()) as { password?: unknown };
		if (typeof body.password !== "string") {
			return c.json({ error: "password is required" }, 400);
		}
		try {
			await adminService.resetPassword(userId, body.password);
			return c.json({ data: { ok: true } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Failed to reset password" }, 400);
		}
	});

	app.get("/users/:id/workspaces", async (c) => {
		const userId = c.req.param("id");
		const rows = await adminService.listUserWorkspaces(userId);
		return c.json({ data: rows });
	});

	app.put("/users/:id/workspaces/:workspaceId", async (c) => {
		const userId = c.req.param("id");
		const workspaceId = c.req.param("workspaceId");
		const body = (await c.req.json()) as { role?: unknown };
		const role = body.role === "admin" || body.role === "member" ? body.role : null;
		if (!role) {
			return c.json({ error: "role must be 'admin' or 'member'" }, 400);
		}
		await adminService.setUserWorkspaceRole(userId, workspaceId, role);
		return c.json({ data: { ok: true } });
	});

	app.delete("/users/:id/workspaces/:workspaceId", async (c) => {
		const userId = c.req.param("id");
		const workspaceId = c.req.param("workspaceId");
		await adminService.removeUserFromWorkspace(userId, workspaceId);
		return c.body(null, 204);
	});

	app.get("/audit-logs", async (c) => {
		const workspaceId = c.req.query("workspaceId");
		const limit = parseInt(c.req.query("limit") || "50");
		const logs = await adminService.listAuditLogs(workspaceId || undefined, limit);
		return c.json({ data: logs });
	});

	const taxonomyTypes = ["frameworks", "hook-types", "tone-presets", "visual-styles"];
	const typeMap: Record<string, string> = {
		frameworks: "framework",
		"hook-types": "hookType",
		"tone-presets": "tonePreset",
		"visual-styles": "visualStyle",
	};

	for (const route of taxonomyTypes) {
		const type = typeMap[route];

		app.post(`/taxonomy/${route}`, async (c) => {
			const body = await c.req.json();
			const item = await adminService.createTaxonomyItem(type as any, body);
			return c.json({ data: item }, 201);
		});

		app.patch(`/taxonomy/${route}/:id`, async (c) => {
			const id = c.req.param("id");
			const body = await c.req.json();
			const item = await adminService.updateTaxonomyItem(type as any, id, body);
			return c.json({ data: item });
		});

		app.delete(`/taxonomy/${route}/:id`, async (c) => {
			const id = c.req.param("id");
			await adminService.deleteTaxonomyItem(type as any, id);
			return c.json({ data: { success: true } });
		});
	}

	return app;
}
