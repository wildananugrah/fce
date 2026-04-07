import { Hono } from "hono";
import type { ICampaignService } from "../interfaces/services/campaign.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createCampaignRoutes(campaignService: ICampaignService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list campaigns
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const campaigns = await campaignService.list(workspaceId);
		return c.json({ data: campaigns });
	});

	// POST / — create campaign (optionally generate)
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const body = await c.req.json();
		const { brandId, name, description, objective, budget, channelMix, culturalContext, generate } =
			body;
		if (!name) {
			return c.json({ error: "name is required" }, 400);
		}
		const campaign = await campaignService.create(workspaceId, userId, {
			brandId,
			name,
			description,
			objective,
			budget,
			channelMix,
			culturalContext,
			generate,
		});
		return c.json({ data: campaign }, 201);
	});

	// GET /:id — get campaign with outputs
	app.get("/:id", async (c) => {
		const campaign = await campaignService.getById(c.req.param("id"));
		return c.json({ data: campaign });
	});

	// PATCH /:id — update campaign
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const campaign = await campaignService.update(c.req.param("id"), body);
		return c.json({ data: campaign });
	});

	return app;
}
