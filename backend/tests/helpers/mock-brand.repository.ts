import type { Brand, BrandBrainVersion } from "@prisma/client";
import type { IBrandRepository } from "../../src/interfaces/repositories/brand.repository.interface";

export class MockBrandRepository implements IBrandRepository {
	private brands: Brand[] = [];
	private brainVersions: BrandBrainVersion[] = [];

	async findByWorkspace(workspaceId: string): Promise<Brand[]> {
		return this.brands.filter((b) => b.workspaceId === workspaceId && b.archivedAt === null);
	}

	async findArchivedByWorkspace(workspaceId: string): Promise<Brand[]> {
		return this.brands.filter((b) => b.workspaceId === workspaceId && b.archivedAt !== null);
	}

	async findById(id: string): Promise<(Brand & { brainVersions: BrandBrainVersion[] }) | null> {
		const brand = this.brands.find((b) => b.id === id);
		if (!brand) return null;
		const versions = this.brainVersions.filter((v) => v.brandId === id);
		return { ...brand, brainVersions: versions };
	}

	async create(data: {
		workspaceId: string;
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
	}): Promise<Brand> {
		const brand: Brand = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: null,
			name: data.name,
			slug: data.slug,
			category: data.category ?? null,
			websiteUrl: data.websiteUrl ?? null,
			activeBrainVersionId: null,
			status: "draft",
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.brands.push(brand);
		return brand;
	}

	async update(
		id: string,
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId">
		>,
	): Promise<Brand> {
		const index = this.brands.findIndex((b) => b.id === id);
		if (index === -1) throw new Error("Brand not found");
		this.brands[index] = { ...this.brands[index], ...data, updatedAt: new Date() };
		return this.brands[index];
	}

	async delete(id: string): Promise<void> {
		const index = this.brands.findIndex((b) => b.id === id);
		if (index === -1) throw new Error("Brand not found");
		this.brands.splice(index, 1);
	}

	async archive(id: string): Promise<void> {
		const index = this.brands.findIndex((b) => b.id === id);
		if (index === -1) throw new Error("Brand not found");
		this.brands[index] = { ...this.brands[index], archivedAt: new Date(), updatedAt: new Date() };
	}

	async restore(id: string): Promise<void> {
		const index = this.brands.findIndex((b) => b.id === id);
		if (index === -1) throw new Error("Brand not found");
		this.brands[index] = { ...this.brands[index], archivedAt: null, updatedAt: new Date() };
	}

	async findActiveBrainVersion(brandId: string): Promise<BrandBrainVersion | null> {
		return this.brainVersions.find((v) => v.brandId === brandId && v.isActive) ?? null;
	}

	async createBrainVersion(
		brandId: string,
		version: number,
		data: any,
	): Promise<BrandBrainVersion> {
		const brainVersion: BrandBrainVersion = {
			id: crypto.randomUUID(),
			brandId,
			version,
			personality: data.personality ?? null,
			tone: data.tone ?? null,
			audiencePersonas: data.audiencePersonas ?? null,
			values: data.values ?? null,
			messagingRules: data.messagingRules ?? null,
			vocabulary: data.vocabulary ?? null,
			isActive: true,
			status: "draft",
			createdAt: new Date(),
		};
		this.brainVersions.push(brainVersion);
		return brainVersion;
	}

	async getNextVersionNumber(brandId: string): Promise<number> {
		const versions = this.brainVersions.filter((v) => v.brandId === brandId);
		if (versions.length === 0) return 1;
		return Math.max(...versions.map((v) => v.version)) + 1;
	}

	async deactivateAllVersions(brandId: string): Promise<void> {
		this.brainVersions = this.brainVersions.map((v) =>
			v.brandId === brandId ? { ...v, isActive: false } : v,
		);
	}

	clear(): void {
		this.brands = [];
		this.brainVersions = [];
	}
}
