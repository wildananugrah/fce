import { Hono } from "hono";
import type { IAdminService } from "../interfaces/services/admin.service.interface";

export function createAdminRoutes(adminService: IAdminService) {
	const app = new Hono();

	app.get("/users", async (c) => {
		const users = await adminService.listUsers();
		return c.json({ data: users });
	});

	app.patch("/users/:id", async (c) => {
		const userId = c.req.param("id");
		const body = await c.req.json();
		const user = await adminService.updateUser(userId, body);
		return c.json({ data: user });
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
