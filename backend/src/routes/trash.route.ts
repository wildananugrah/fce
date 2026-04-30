import type { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import type { IAuditService } from "../interfaces/services/audit.service.interface";
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
	prisma: PrismaClient,
	trashService: TrashService,
	brandService: IBrandService,
	productService: IProductService,
	topicService: ITopicService,
	libraryService: ILibraryService,
	generationService: IGenerationService,
	auditService: IAuditService,
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
				case "project":
					await prisma.$transaction([
						prisma.project.update({
							where: { id },
							data: { archivedAt: null },
						}),
						prisma.brand.updateMany({
							where: { projectId: id, archivedAt: { not: null } },
							data: { archivedAt: null },
						}),
					]);
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
			// Capture identifying info BEFORE the row is gone, so the audit
			// metadata reflects what was deleted.
			let name: string | null = null;
			const parentMeta: Record<string, unknown> = {};

			switch (type) {
				case "brand": {
					const row = await prisma.brand.findUnique({
						where: { id },
						select: { name: true },
					});
					name = row?.name ?? null;
					await brandService.permanentDelete(id);
					break;
				}
				case "product": {
					const row = await prisma.product.findUnique({
						where: { id },
						select: { name: true, brandId: true },
					});
					name = row?.name ?? null;
					if (row?.brandId) parentMeta.brandId = row.brandId;
					await productService.permanentDelete(workspaceId, id);
					break;
				}
				case "topic": {
					const row = await prisma.contentTopic.findUnique({
						where: { id },
						select: { title: true, brandId: true },
					});
					name = row?.title ?? null;
					if (row?.brandId) parentMeta.brandId = row.brandId;
					await topicService.permanentDeleteMany(workspaceId, [id]);
					break;
				}
				case "content": {
					// GenerationOutput has no direct topic FK — it lives on the
					// parent GenerationRequest. Pull it via the relation so the
					// audit row still records the lineage.
					const row = await prisma.generationOutput.findUnique({
						where: { id },
						select: { request: { select: { contentTopicId: true } } },
					});
					// content rows don't have a user-facing name field
					if (row?.request?.contentTopicId)
						parentMeta.contentTopicId = row.request.contentTopicId;
					await libraryService.permanentDeleteMany(workspaceId, [id]);
					break;
				}
				case "project": {
					const row = await prisma.project.findUnique({
						where: { id },
						select: { name: true },
					});
					name = row?.name ?? null;
					// FK cascade does the rest: brand, brand brain versions,
					// products, products brain versions, topics, generation
					// requests/outputs, memberships, analysis configs,
					// competitor pipeline runs, creators.
					await prisma.project.delete({ where: { id } });
					break;
				}
				default:
					return c.json({ error: `Unknown trash type: ${type}` }, 400);
			}

			await auditService.log({
				workspaceId,
				userId: c.get("userId"),
				action: "trash.permanent_delete",
				entityType: type,
				entityId: id,
				metadata: { name, ...parentMeta },
			});

			return c.json({ data: { success: true } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Delete failed" }, 400);
		}
	});

	return app;
}
