import { Hono } from "hono";
import type { IDocumentService } from "../interfaces/services/document.service.interface";

export function createDocumentRoutes(documentService: IDocumentService) {
	const app = new Hono();

	app.post("/upload", async (c) => {
		const workspaceId = c.get("workspaceId" as any);
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

	return app;
}
