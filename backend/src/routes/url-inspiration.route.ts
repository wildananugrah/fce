import { Hono } from "hono";
import type { IUrlInspirationService } from "../interfaces/services/url-inspiration.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createUrlInspirationRoutes(service: IUrlInspirationService) {
	const app = new Hono<{ Variables: Variables }>();

	// POST /preview — scrape + summarize a single URL (uses 24h cache)
	app.post("/preview", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json().catch(() => ({}));
		const { url } = body as { url?: string };
		if (!url || typeof url !== "string") {
			return c.json({ error: "url is required" }, 400);
		}
		const result = await service.getInspiration(workspaceId, url, userId);
		return c.json({ data: result });
	});

	return app;
}
