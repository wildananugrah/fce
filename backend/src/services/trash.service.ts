import type { PrismaClient } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { IProductRepository } from "../interfaces/repositories/product.repository.interface";
import type { ITopicRepository } from "../interfaces/repositories/topic.repository.interface";

export type TrashItemType = "brand" | "product" | "topic" | "content" | "project";

export interface TrashItem {
	id: string;
	type: TrashItemType;
	name: string;
	archivedAt: Date;
	expiresAt: Date;
	// Context for display (e.g. "in Brand X"). Optional; only set where useful.
	context?: string;
}

/**
 * Aggregates archived items across the supported entity types and
 * annotates each with its hard-delete `expiresAt` (archivedAt + TTL).
 * The trash view in Workspace Settings consumes this.
 *
 * We intentionally collapse descendants under an archived ancestor:
 * when a project is archived, its (single) brand is archived too via
 * the route's cascade; when a brand is archived, its products / topics
 * / content are hidden from the main lists (via join filters) but we
 * don't show each as a separate trash row. Restoring the ancestor makes
 * everything reappear as if nothing happened, matching the user's
 * "move to trash / restore" mental model and keeping the trash UI
 * from becoming overwhelming.
 */
export class TrashService {
	constructor(
		private prisma: PrismaClient,
		private brandRepository: IBrandRepository,
		private productRepository: IProductRepository,
		private topicRepository: ITopicRepository,
		private generationRepository: IGenerationRepository,
		private ttlDays: number,
	) {}

	async list(workspaceId: string): Promise<TrashItem[]> {
		const [archivedProjects, brands, products, topics, outputs] = await Promise.all([
			this.prisma.project.findMany({
				where: { workspaceId, archivedAt: { not: null } },
				select: { id: true, name: true, archivedAt: true },
			}),
			this.brandRepository.findArchivedByWorkspace(workspaceId),
			this.productRepository.findArchivedByWorkspace(workspaceId),
			this.topicRepository.findArchivedByWorkspace(workspaceId),
			this.generationRepository.findArchivedOutputsByWorkspace(workspaceId),
		]);

		// Set of archived project ids — used to collapse brands whose
		// project is also archived (the project row subsumes them).
		const archivedProjectIds = new Set(archivedProjects.map((p) => p.id));

		const items: TrashItem[] = [];

		for (const project of archivedProjects) {
			if (!project.archivedAt) continue;
			items.push({
				id: project.id,
				type: "project",
				name: project.name,
				archivedAt: project.archivedAt,
				expiresAt: this.computeExpiry(project.archivedAt),
			});
		}

		for (const brand of brands) {
			if (!brand.archivedAt) continue;
			// If this brand's project is also archived, the project row
			// already represents it. Skip to avoid duplicates.
			if (brand.projectId && archivedProjectIds.has(brand.projectId)) continue;
			items.push({
				id: brand.id,
				type: "brand",
				name: brand.name,
				archivedAt: brand.archivedAt,
				expiresAt: this.computeExpiry(brand.archivedAt),
			});
		}

		for (const product of products) {
			if (!product.archivedAt) continue;
			items.push({
				id: product.id,
				type: "product",
				name: product.name,
				archivedAt: product.archivedAt,
				expiresAt: this.computeExpiry(product.archivedAt),
				context: product.brand?.name ? `Brand: ${product.brand.name}` : undefined,
			});
		}

		for (const topic of topics) {
			if (!topic.archivedAt) continue;
			items.push({
				id: topic.id,
				type: "topic",
				name: topic.title,
				archivedAt: topic.archivedAt,
				expiresAt: this.computeExpiry(topic.archivedAt),
				context: topic.brand?.name ? `Brand: ${topic.brand.name}` : undefined,
			});
		}

		for (const output of outputs) {
			if (!output.archivedAt) continue;
			const label =
				output.contentTitle ??
				`${(output as any).request?.platform ?? "content"} ${(output as any).request?.contentType ?? ""}`.trim();
			items.push({
				id: output.id,
				type: "content",
				name: label || "Untitled content",
				archivedAt: output.archivedAt,
				expiresAt: this.computeExpiry(output.archivedAt),
				context: (output as any).request?.brand?.name
					? `Brand: ${(output as any).request.brand.name}`
					: undefined,
			});
		}

		// Most recently archived first — people usually want to restore
		// what they just trashed.
		items.sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
		return items;
	}

	private computeExpiry(archivedAt: Date): Date {
		return new Date(archivedAt.getTime() + this.ttlDays * 24 * 60 * 60 * 1000);
	}
}
