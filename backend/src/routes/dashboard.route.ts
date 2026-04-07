import { Hono } from "hono";
import type { IDashboardService } from "../interfaces/services/dashboard.service.interface";

export function createDashboardRoutes(dashboardService: IDashboardService) {
	const app = new Hono();

	app.get("/stats", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
		const stats = await dashboardService.getStats(workspaceId);
		return c.json({ data: stats });
	});

	return app;
}
