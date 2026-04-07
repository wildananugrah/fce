import type { Product, ProductBrainVersion } from "@prisma/client";
import type { IProductRepository } from "../../src/interfaces/repositories/product.repository.interface";

export class MockProductRepository implements IProductRepository {
	private products: Product[] = [];
	private brainVersions: ProductBrainVersion[] = [];

	async findByWorkspace(workspaceId: string): Promise<Product[]> {
		return this.products.filter((p) => p.workspaceId === workspaceId);
	}

	async findById(id: string): Promise<(Product & { brainVersions: ProductBrainVersion[] }) | null> {
		const product = this.products.find((p) => p.id === id);
		if (!product) return null;
		const versions = this.brainVersions.filter((v) => v.productId === id);
		return { ...product, brainVersions: versions };
	}

	async create(data: {
		workspaceId: string;
		brandId: string;
		name: string;
		slug: string;
		type?: string;
	}): Promise<Product> {
		const product: Product = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			brandId: data.brandId,
			name: data.name,
			slug: data.slug,
			type: data.type ?? null,
			activeBrainVersionId: null,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.products.push(product);
		return product;
	}

	async update(
		id: string,
		data: Partial<Pick<Product, "name" | "type" | "status" | "activeBrainVersionId">>,
	): Promise<Product> {
		const index = this.products.findIndex((p) => p.id === id);
		if (index === -1) throw new Error("Product not found");
		this.products[index] = { ...this.products[index], ...data, updatedAt: new Date() };
		return this.products[index];
	}

	async findActiveBrainVersion(productId: string): Promise<ProductBrainVersion | null> {
		return this.brainVersions.find((v) => v.productId === productId && v.isActive) ?? null;
	}

	async createBrainVersion(
		productId: string,
		version: number,
		data: any,
	): Promise<ProductBrainVersion> {
		const brainVersion: ProductBrainVersion = {
			id: crypto.randomUUID(),
			productId,
			version,
			usp: data.usp ?? null,
			rtb: data.rtb ?? null,
			functionalBenefits: data.functionalBenefits ?? null,
			emotionalBenefits: data.emotionalBenefits ?? null,
			targetAudience: data.targetAudience ?? null,
			claims: data.claims ?? null,
			disclaimers: data.disclaimers ?? null,
			isActive: true,
			status: "draft",
			createdAt: new Date(),
		};
		this.brainVersions.push(brainVersion);
		return brainVersion;
	}

	async getNextVersionNumber(productId: string): Promise<number> {
		const versions = this.brainVersions.filter((v) => v.productId === productId);
		if (versions.length === 0) return 1;
		return Math.max(...versions.map((v) => v.version)) + 1;
	}

	async deactivateAllVersions(productId: string): Promise<void> {
		this.brainVersions = this.brainVersions.map((v) =>
			v.productId === productId ? { ...v, isActive: false } : v,
		);
	}

	clear(): void {
		this.products = [];
		this.brainVersions = [];
	}
}
