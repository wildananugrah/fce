import { Hono } from "hono";
import type { IBrandService } from "../interfaces/services/brand.service.interface";
import type { IGenerationService } from "../interfaces/services/generation.service.interface";
import type { ILibraryService } from "../interfaces/services/library.service.interface";
import type { IProductService } from "../interfaces/services/product.service.interface";
import type { ITopicService } from "../interfaces/services/topic.service.interface";
import type { TrashService } from "../services/trash.service";
import { requireWorkspaceAdmin } from "../middlewares/rbac.middleware";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
	isSuperadmin: boolean;
};

/**
 * Workspace-scoped trash routes. Only admins (workspace admin or superadmin)
 * can see or act on trash — members shouldn't be able to nuke other people's
 * work, and they shouldn't see archived items outside their granted menus.
 *
 * Each restore/permanent route dispatches to the appropriate entity service
 * based on `?type=brand|product|topic|content`, so the frontend can drive
 * the whole trash UI with two generic endpoints.
 */
export function createTrashRoutes(
	trashService: TrashService,
	brandService: IBrandService,
	productService: IProductService,
	topicService: ITopicService,
	libraryService: ILibraryService,
	generationService: IGenerationService,
) {
	const app = new Hono<{ Variables: Variables }>();

	app.use("*", requireWorkspaceAdmin());

	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const items = await trashService.list(workspaceId);
		return c.json({ data: items });
	});

	// POST /:type/:id/restore
	app.post("/:type/:id/restore", async (c) => {
		const workspaceId = c.get("workspaceId");
		const type = c.req.param("type");
		const id = c.req.param("id");
		try {
			switch (type) {
				case "brand":
					await brandService.restore(id);
					break;
				case "product":
					await productService.restore(workspaceId, id);
					break;
				case "topic":
					await topicService.restoreMany(workspaceId, [id]);
					break;
				case "content":
					await libraryService.restoreMany(workspaceId, [id]);
					break;
				default:
					return c.json({ error: `Unknown trash type: ${type}` }, 400);
			}
			return c.json({ data: { success: true } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Restore failed" }, 400);
		}
	});

	// DELETE /:type/:id — permanent (hard) delete.
	app.delete("/:type/:id", async (c) => {
		const workspaceId = c.get("workspaceId");
		const type = c.req.param("type");
		const id = c.req.param("id");
		try {
			switch (type) {
				case "brand":
					await brandService.permanentDelete(id);
					break;
				case "product":
					await productService.permanentDelete(workspaceId, id);
					break;
				case "topic":
					await topicService.permanentDeleteMany(workspaceId, [id]);
					break;
				case "content":
					await libraryService.permanentDeleteMany(workspaceId, [id]);
					break;
				default:
					return c.json({ error: `Unknown trash type: ${type}` }, 400);
			}
			return c.json({ data: { success: true } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Delete failed" }, 400);
		}
	});

	return app;
}
