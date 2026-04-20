import type { Brand, Product, ProductBrainVersion } from "@prisma/client";
import type {
	IProductRepository,
	ProductWithRelations,
} from "../../src/interfaces/repositories/product.repository.interface";

export class MockProductRepository implements IProductRepository {
	private products: Product[] = [];
	private brainVersions: ProductBrainVersion[] = [];
	// Minimal brand index so findByWorkspace can fake the brand: { name } include
	// and the archive-aware join filter. Tests that care about the brand side
	// can seed entries here; otherwise we synthesize a placeholder.
	private brands = new Map<string, Pick<Brand, "id" | "name" | "archivedAt">>();

	private decorate(product: Product): ProductWithRelations {
		const brand = this.brands.get(product.brandId) ?? {
			id: product.brandId,
			name: `Brand ${product.brandId.slice(0, 4)}`,
			archivedAt: null,
		};
		const versions = this.brainVersions.filter((v) => v.productId === product.id);
		return {
			...product,
			brand: { id: brand.id, name: brand.name },
			brainVersions: versions,
		};
	}

	seedBrand(brand: Pick<Brand, "id" | "name"> & { archivedAt?: Date | null }): void {
		this.brands.set(brand.id, {
			id: brand.id,
			name: brand.name,
			archivedAt: brand.archivedAt ?? null,
		});
	}

	async findByWorkspace(workspaceId: string): Promise<ProductWithRelations[]> {
		return this.products
			.filter((p) => {
				if (p.workspaceId !== workspaceId) return false;
				if (p.archivedAt !== null) return false;
				const brand = this.brands.get(p.brandId);
				if (brand?.archivedAt) return false;
				return true;
			})
			.map((p) => this.decorate(p));
	}

	async findArchivedByWorkspace(workspaceId: string): Promise<ProductWithRelations[]> {
		return this.products
			.filter((p) => {
				if (p.workspaceId !== workspaceId) return false;
				if (p.archivedAt === null) return false;
				const brand = this.brands.get(p.brandId);
				if (brand?.archivedAt) return false;
				return true;
			})
			.map((p) => this.decorate(p));
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
		priceTier?: string;
		summary?: string;
		imageUrl?: string;
	}): Promise<Product> {
		const product: Product = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			brandId: data.brandId,
			name: data.name,
			slug: data.slug,
			type: data.type ?? null,
			priceTier: data.priceTier ?? null,
			summary: data.summary ?? null,
			imageUrl: data.imageUrl ?? null,
			activeBrainVersionId: null,
			status: "draft",
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.products.push(product);
		return product;
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
		const index = this.products.findIndex((p) => p.id === id);
		if (index === -1) throw new Error("Product not found");
		this.products[index] = { ...this.products[index], ...data, updatedAt: new Date() };
		return this.products[index];
	}

	async delete(id: string): Promise<void> {
		const index = this.products.findIndex((p) => p.id === id);
		if (index === -1) throw new Error("Product not found");
		this.products.splice(index, 1);
	}

	async archive(id: string): Promise<void> {
		const index = this.products.findIndex((p) => p.id === id);
		if (index === -1) throw new Error("Product not found");
		this.products[index] = {
			...this.products[index],
			archivedAt: new Date(),
			updatedAt: new Date(),
		};
	}

	async restore(id: string): Promise<void> {
		const index = this.products.findIndex((p) => p.id === id);
		if (index === -1) throw new Error("Product not found");
		this.products[index] = { ...this.products[index], archivedAt: null, updatedAt: new Date() };
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
		this.brands.clear();
	}
}
