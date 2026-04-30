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
			const user = await adminService.createUser(c.get("userId"), {
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
		const user = await adminService.updateUser(c.get("userId"), userId, body);
		return c.json({ data: user });
	});

	app.delete("/users/:id", async (c) => {
		const userId = c.req.param("id");
		// Prevent a superadmin from deleting their own row by accident.
		const actingUserId = c.get("userId");
		if (actingUserId === userId) {
			return c.json({ error: "You cannot delete your own account from this page" }, 400);
		}
		await adminService.deleteUser(c.get("userId"), userId);
		return c.body(null, 204);
	});

	app.post("/users/:id/password", async (c) => {
		const userId = c.req.param("id");
		const body = (await c.req.json()) as { password?: unknown };
		if (typeof body.password !== "string") {
			return c.json({ error: "password is required" }, 400);
		}
		try {
			await adminService.resetPassword(c.get("userId"), userId, body.password);
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
		await adminService.setUserWorkspaceRole(c.get("userId"), userId, workspaceId, role);
		return c.json({ data: { ok: true } });
	});

	app.delete("/users/:id/workspaces/:workspaceId", async (c) => {
		const userId = c.req.param("id");
		const workspaceId = c.req.param("workspaceId");
		await adminService.removeUserFromWorkspace(c.get("userId"), userId, workspaceId);
		return c.body(null, 204);
	});

	app.get("/audit-logs", async (c) => {
		const workspaceId = c.req.query("workspaceId");
		const limit = parseInt(c.req.query("limit") || "50");
		const logs = await adminService.listAuditLogs(workspaceId || undefined, limit);
		return c.json({ data: logs });
	});

	return app;
}
