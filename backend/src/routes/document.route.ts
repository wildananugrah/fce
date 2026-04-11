import { Hono } from "hono";
import type { IDocumentService } from "../interfaces/services/document.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createDocumentRoutes(documentService: IDocumentService) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/upload", async (c) => {
		const workspaceId = c.get("workspaceId");
		const formData = await c.req.parseBody();
		const file = formData.file as File;
		const brandId = formData.brandId as string;
		const productId = (formData.productId as string) || undefined;
		const sourceType = (formData.sourceType as string) || undefined;
		if (!file || !brandId) return c.json({ error: "file and brandId are required" }, 400);
		const doc = await documentService.upload(workspaceId, brandId, file, productId, sourceType);
		return c.json({ data: doc }, 201);
	});

	app.get("/brand/:brandId", async (c) => {
		const brandId = c.req.param("brandId");
		const docs = await documentService.listByBrand(brandId);
		return c.json({ data: docs });
	});

	app.get("/:id", async (c) => {
		const id = c.req.param("id");
		const doc = await documentService.getById(id);
		return c.json({ data: doc });
	});

	app.get("/:id/chunks", async (c) => {
		const id = c.req.param("id");
		const chunks = await documentService.getChunks(id);
		return c.json({ data: chunks });
	});

	// GET /product/:productId — list documents for a product
	app.get("/product/:productId", async (c) => {
		const productId = c.req.param("productId");
		const docs = await documentService.listByProduct(productId);
		return c.json({ data: docs });
	});

	// POST /link — add a link reference
	app.post("/link", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { brandId, url, productId } = body;
		if (!brandId || !url) return c.json({ error: "brandId and url are required" }, 400);
		const doc = await documentService.addLink(workspaceId, brandId, url, productId);
		return c.json({ data: doc }, 201);
	});

	// DELETE /:id — delete a document
	app.delete("/:id", async (c) => {
		const id = c.req.param("id");
		await documentService.delete(id);
		return c.json({ success: true });
	});

	return app;
}
