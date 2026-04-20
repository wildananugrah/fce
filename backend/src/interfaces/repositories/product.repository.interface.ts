import type { Brand, Product, ProductBrainVersion } from "@prisma/client";

export type ProductWithRelations = Product & {
	brand: Pick<Brand, "id" | "name">;
	brainVersions: ProductBrainVersion[];
};

export interface IProductRepository {
	findByWorkspace(workspaceId: string): Promise<ProductWithRelations[]>;
	findById(id: string): Promise<(Product & { brainVersions: ProductBrainVersion[] }) | null>;
	create(data: {
		workspaceId: string;
		brandId: string;
		name: string;
		slug: string;
		type?: string;
		priceTier?: string;
		summary?: string;
		imageUrl?: string;
	}): Promise<Product>;
	update(
		id: string,
		data: Partial<
			Pick<
				Product,
				"name" | "type" | "priceTier" | "summary" | "imageUrl" | "status" | "activeBrainVersionId"
			>
		>,
	): Promise<Product>;

	delete(id: string): Promise<void>;
	archive(id: string): Promise<void>;
	restore(id: string): Promise<void>;
	findArchivedByWorkspace(workspaceId: string): Promise<ProductWithRelations[]>;
	findActiveBrainVersion(productId: string): Promise<ProductBrainVersion | null>;
	createBrainVersion(productId: string, version: number, data: any): Promise<ProductBrainVersion>;
	getNextVersionNumber(productId: string): Promise<number>;
	deactivateAllVersions(productId: string): Promise<void>;
}
