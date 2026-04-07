import type { Product, ProductBrainVersion } from "@prisma/client";
import type {
	CreateProductBrainVersionInput,
	CreateProductInput,
	UpdateProductInput,
} from "../../types/product.types";

export interface IProductService {
	list(workspaceId: string): Promise<Product[]>;
	getById(id: string): Promise<Product & { brainVersions: ProductBrainVersion[] }>;
	create(workspaceId: string, input: CreateProductInput): Promise<Product>;
	update(id: string, input: UpdateProductInput): Promise<Product>;
	createBrainVersion(
		productId: string,
		input: CreateProductBrainVersionInput,
	): Promise<ProductBrainVersion>;
}
