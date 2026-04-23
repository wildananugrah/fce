import type { PrismaClient, Product, ProductBrainVersion } from "@prisma/client";
import type { IProductRepository } from "../interfaces/repositories/product.repository.interface";

export class ProductRepository implements IProductRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string, projectId?: string) {
		// A product is visible if neither it nor its brand is archived.
		// Hiding descendants of an archived brand is what lets us "collapse"
		// the brand in the trash view and keep the main list clean.
		const brandFilter: any = { archivedAt: null };
		if (projectId) {
			// If asking for the Default project, also include brands without
			// a projectId (legacy rows). See BrandRepository.findByWorkspace.
			const defaultId = await this.findDefaultProjectId(workspaceId);
			if (defaultId === projectId) {
				brandFilter.OR = [{ projectId }, { projectId: null }];
			} else {
				brandFilter.projectId = projectId;
			}
		}
		return this.prisma.product.findMany({
			where: {
				workspaceId,
				archivedAt: null,
				brand: brandFilter,
			},
			orderBy: { updatedAt: "desc" },
			include: {
				brand: { select: { id: true, name: true } },
				brainVersions: {
					where: { isActive: true },
					take: 1,
				},
			},
		});
	}

	async findDefaultProjectId(workspaceId: string): Promise<string | null> {
		const project = await this.prisma.project.findFirst({
			where: { workspaceId, slug: "default" },
			select: { id: true },
		});
		return project?.id ?? null;
	}

	async findArchivedByWorkspace(workspaceId: string) {
		// Only products archived on their own — products whose *brand* is
		// archived collapse under the brand's trash entry, so we exclude them
		// here to avoid noisy duplication.
		return this.prisma.product.findMany({
			where: {
				workspaceId,
				archivedAt: { not: null },
				brand: { archivedAt: null },
			},
			orderBy: { archivedAt: "desc" },
			include: {
				brand: { select: { id: true, name: true } },
				brainVersions: {
					where: { isActive: true },
					take: 1,
				},
			},
		});
	}

	async findById(id: string): Promise<(Product & { brainVersions: ProductBrainVersion[] }) | null> {
		return this.prisma.product.findUnique({
			where: { id },
			include: {
				brainVersions: {
					orderBy: { version: "desc" },
				},
			},
		});
	}

	async create(data: {
		workspaceId: string;
		brandId: string;
		name: string;
		slug: string;
		type?: string;
		priceTier?: string;
		summary?: string;
		imageUrl?: string;
	}): Promise<Product> {
		return this.prisma.product.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<
				Product,
				"name" | "type" | "priceTier" | "summary" | "imageUrl" | "status" | "activeBrainVersionId"
			>
		>,
	): Promise<Product> {
		return this.prisma.product.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.product.delete({ where: { id } });
	}

	async archive(id: string): Promise<void> {
		await this.prisma.product.update({
			where: { id },
			data: { archivedAt: new Date() },
		});
	}

	async restore(id: string): Promise<void> {
		await this.prisma.product.update({
			where: { id },
			data: { archivedAt: null },
		});
	}

	async findActiveBrainVersion(productId: string): Promise<ProductBrainVersion | null> {
		return this.prisma.productBrainVersion.findFirst({
			where: { productId, isActive: true },
		});
	}

	async createBrainVersion(
		productId: string,
		version: number,
		data: any,
	): Promise<ProductBrainVersion> {
		await this.deactivateAllVersions(productId);

		const brainVersion = await this.prisma.productBrainVersion.create({
			data: {
				productId,
				version,
				isActive: true,
				...data,
			},
		});

		await this.prisma.product.update({
			where: { id: productId },
			data: { activeBrainVersionId: brainVersion.id },
		});

		return brainVersion;
	}

	async getNextVersionNumber(productId: string): Promise<number> {
		const count = await this.prisma.productBrainVersion.count({ where: { productId } });
		return count + 1;
	}

	async deactivateAllVersions(productId: string): Promise<void> {
		await this.prisma.productBrainVersion.updateMany({
			where: { productId },
			data: { isActive: false },
		});
	}
}
