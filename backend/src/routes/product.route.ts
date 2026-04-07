import { Hono } from "hono";
import type { IProductService } from "../interfaces/services/product.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createProductRoutes(productService: IProductService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET / — list products
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const products = await productService.list(workspaceId);
		return c.json({ data: products });
	});

	// POST / — create product
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { brandId, name, slug, type } = body;
		if (!brandId || !name || !slug) {
			return c.json({ error: "brandId, name, and slug are required" }, 400);
		}
		const product = await productService.create(workspaceId, { brandId, name, slug, type });
		return c.json({ data: product }, 201);
	});

	// GET /:id — get product with brain versions
	app.get("/:id", async (c) => {
		const product = await productService.getById(c.req.param("id"));
		return c.json({ data: product });
	});

	// PATCH /:id — update product
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const product = await productService.update(c.req.param("id"), body);
		return c.json({ data: product });
	});

	// POST /:id/brain-versions — create new brain version
	app.post("/:id/brain-versions", async (c) => {
		const body = await c.req.json();
		const brainVersion = await productService.createBrainVersion(c.req.param("id"), body);
		return c.json({ data: brainVersion }, 201);
	});

	return app;
}
