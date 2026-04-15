import type { Product, ProductBrainVersion } from "@prisma/client";
import type {
	CreateProductBrainVersionInput,
	CreateProductInput,
	UpdateProductInput,
} from "../../types/product.types";
import type { ProductWithRelations } from "../repositories/product.repository.interface";

export interface IProductService {
	list(workspaceId: string): Promise<ProductWithRelations[]>;
	getById(id: string): Promise<Product & { brainVersions: ProductBrainVersion[] }>;
	create(workspaceId: string, input: CreateProductInput): Promise<Product>;
	update(id: string, input: UpdateProductInput): Promise<Product>;
	delete(workspaceId: string, id: string): Promise<void>;
	createBrainVersion(
		productId: string,
		input: CreateProductBrainVersionInput,
	): Promise<ProductBrainVersion>;
}
