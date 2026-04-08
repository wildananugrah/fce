import type { PrismaClient, Product, ProductBrainVersion } from "@prisma/client";
import type { IProductRepository } from "../interfaces/repositories/product.repository.interface";

export class ProductRepository implements IProductRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string) {
		return this.prisma.product.findMany({
			where: { workspaceId },
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
		data: Partial<Pick<Product, "name" | "type" | "priceTier" | "summary" | "imageUrl" | "status" | "activeBrainVersionId">>,
	): Promise<Product> {
		return this.prisma.product.update({ where: { id }, data });
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
