import type { Product, ProductBrainVersion } from "@prisma/client";
import type {
	IProductRepository,
	ProductWithRelations,
} from "../interfaces/repositories/product.repository.interface";
import type { IProductService } from "../interfaces/services/product.service.interface";
import type {
	CreateProductBrainVersionInput,
	CreateProductInput,
	UpdateProductInput,
} from "../types/product.types";

export class ProductService implements IProductService {
	constructor(private productRepository: IProductRepository) {}

	async list(workspaceId: string): Promise<ProductWithRelations[]> {
		return this.productRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<Product & { brainVersions: ProductBrainVersion[] }> {
		const product = await this.productRepository.findById(id);
		if (!product) {
			throw new Error("Product not found");
		}
		return product;
	}

	async create(workspaceId: string, input: CreateProductInput): Promise<Product> {
		return this.productRepository.create({
			workspaceId,
			brandId: input.brandId,
			name: input.name,
			slug: input.slug,
			type: input.type,
			priceTier: input.priceTier,
			summary: input.summary,
			imageUrl: input.imageUrl,
		});
	}

	async update(id: string, input: UpdateProductInput): Promise<Product> {
		return this.productRepository.update(id, input);
	}

	async delete(workspaceId: string, id: string): Promise<void> {
		const product = await this.assertProductInWorkspace(workspaceId, id);
		await this.productRepository.archive(product.id);
	}

	async restore(workspaceId: string, id: string): Promise<void> {
		const product = await this.assertProductInWorkspace(workspaceId, id);
		await this.productRepository.restore(product.id);
	}

	async permanentDelete(workspaceId: string, id: string): Promise<void> {
		const product = await this.assertProductInWorkspace(workspaceId, id);
		await this.productRepository.delete(product.id);
	}

	private async assertProductInWorkspace(workspaceId: string, id: string) {
		const product = await this.productRepository.findById(id);
		if (!product || product.workspaceId !== workspaceId) {
			throw new Error("Product not found");
		}
		return product;
	}

	async createBrainVersion(
		productId: string,
		input: CreateProductBrainVersionInput,
	): Promise<ProductBrainVersion> {
		const version = await this.productRepository.getNextVersionNumber(productId);
		return this.productRepository.createBrainVersion(productId, version, input);
	}
}
