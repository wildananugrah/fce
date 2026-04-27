import { Hono } from "hono";
import type { PgBoss } from "pg-boss";
import type { IBrandService } from "../interfaces/services/brand.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createBrandRoutes(
	brandService: IBrandService,
	boss: PgBoss,
	aiFactory: AiProviderFactory,
) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list brands (optionally filtered by ?projectId=)
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const projectId = c.req.query("projectId") || undefined;
		const brands = await brandService.list(workspaceId, projectId);
		return c.json({ data: brands });
	});

	// POST / — create brand
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { name, slug, category, websiteUrl, projectId, language } = body;
		if (!name || !slug) {
			return c.json({ error: "Name and slug are required" }, 400);
		}
		const brand = await brandService.create(workspaceId, {
			name,
			slug,
			category,
			websiteUrl,
			projectId,
			language,
		});
		return c.json({ data: brand }, 201);
	});

	// GET /:id — get brand with brain versions
	app.get("/:id", async (c) => {
		const brand = await brandService.getById(c.req.param("id"));
		return c.json({ data: brand });
	});

	// PATCH /:id — update brand
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const brand = await brandService.update(c.req.param("id"), body);
		return c.json({ data: brand });
	});

	// DELETE /:id — soft delete (moves to Trash).
	app.delete("/:id", async (c) => {
		await brandService.delete(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	// POST /:id/restore — pull back out of the Trash.
	app.post("/:id/restore", async (c) => {
		await brandService.restore(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	// DELETE /:id/permanent — hard delete (cascades to products/topics/content).
	// Called from the Trash view's "Delete forever" button.
	app.delete("/:id/permanent", async (c) => {
		await brandService.permanentDelete(c.req.param("id"));
		return c.json({ data: { success: true } });
	});

	// POST /:id/brain-versions — create new brain version
	app.post("/:id/brain-versions", async (c) => {
		const body = await c.req.json();
		const brainVersion = await brandService.createBrainVersion(c.req.param("id"), body);
		return c.json({ data: brainVersion }, 201);
	});

	// POST /scrape-preview — synchronous scrape, returns AI result without saving
	app.post("/scrape-preview", async (c) => {
		const body = await c.req.json();
		const { url, language } = body as { url?: string; language?: string };
		if (!url) {
			return c.json({ error: "url is required" }, 400);
		}
		const workspaceId = c.get("workspaceId");
		const brandScraper = await aiFactory.getBrandScraper(workspaceId);
		const result = await brandScraper.scrape({ url, language });
		return c.json({ data: result });
	});

	// POST /:id/scrape — enqueue brand scraping job
	app.post("/:id/scrape", async (c) => {
		const userId = c.get("userId");
		const body = await c.req.json();
		const { url } = body;
		if (!url) {
			return c.json({ error: "url is required" }, 400);
		}
		const jobId = await boss.send("brand-scraping", {
			brandId: c.req.param("id"),
			url,
			userId,
		});
		return c.json({ data: { jobId: jobId ?? "queued" } }, 202);
	});

	return app;
}
