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
		const {
			brandId,
			productId,
			name,
			description,
			objective,
			budget,
			channelMix,
			culturalContext,
			audienceSegment,
			durationStart,
			durationEnd,
			budgetMin,
			budgetMax,
			keyMessage,
			generate,
		} = body;
		if (!name) {
			return c.json({ error: "name is required" }, 400);
		}
		const campaign = await campaignService.create(workspaceId, userId, {
			brandId,
			productId,
			name,
			description,
			objective,
			budget,
			channelMix,
			culturalContext,
			audienceSegment,
			durationStart,
			durationEnd,
			budgetMin,
			budgetMax,
			keyMessage,
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

	// POST /:id/brief — create campaign brief
	app.post("/:id/brief", async (c) => {
		const campaignId = c.req.param("id");
		const body = await c.req.json();
		const brief = await campaignService.createBrief(campaignId, body);
		return c.json({ data: brief }, 201);
	});

	// GET /:id/brief — get campaign brief
	app.get("/:id/brief", async (c) => {
		const campaignId = c.req.param("id");
		const brief = await campaignService.getBrief(campaignId);
		if (!brief) {
			return c.json({ data: null });
		}
		return c.json({ data: brief });
	});

	// PATCH /:id/brief — update campaign brief
	app.patch("/:id/brief", async (c) => {
		const campaignId = c.req.param("id");
		const body = await c.req.json();
		// Find the brief for this campaign, then update it
		const existing = await campaignService.getBrief(campaignId);
		if (!existing) {
			return c.json({ error: "Brief not found" }, 404);
		}
		const brief = await campaignService.updateBrief(existing.id, body);
		return c.json({ data: brief });
	});

	// POST /:id/generate — generate strategy from brief
	app.post("/:id/generate", async (c) => {
		const campaignId = c.req.param("id");
		const userId = c.get("userId");
		await campaignService.generateFromBrief(campaignId, userId);
		return c.json({ data: { status: "queued", campaignId } });
	});

	return app;
}
