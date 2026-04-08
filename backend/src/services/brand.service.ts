import type { Brand, BrandBrainVersion } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";
import type { IBrandService } from "../interfaces/services/brand.service.interface";
import type {
	CreateBrainVersionInput,
	CreateBrandInput,
	UpdateBrandInput,
} from "../types/brand.types";

export class BrandService implements IBrandService {
	constructor(private brandRepository: IBrandRepository) {}

	async list(workspaceId: string): Promise<Brand[]> {
		return this.brandRepository.findByWorkspace(workspaceId);
	}

	async getById(id: string): Promise<Brand & { brainVersions: BrandBrainVersion[] }> {
		const brand = await this.brandRepository.findById(id);
		if (!brand) {
			throw new Error("Brand not found");
		}
		return brand;
	}

	async create(workspaceId: string, input: CreateBrandInput): Promise<Brand> {
		return this.brandRepository.create({
			workspaceId,
			name: input.name,
			slug: input.slug,
			category: input.category,
			websiteUrl: input.websiteUrl,
		});
	}

	async update(id: string, input: UpdateBrandInput): Promise<Brand> {
		return this.brandRepository.update(id, input);
	}

	async delete(id: string): Promise<void> {
		const brand = await this.brandRepository.findById(id);
		if (!brand) {
			throw new Error("Brand not found");
		}
		await this.brandRepository.delete(id);
	}

	async createBrainVersion(
		brandId: string,
		input: CreateBrainVersionInput,
	): Promise<BrandBrainVersion> {
		const version = await this.brandRepository.getNextVersionNumber(brandId);
		return this.brandRepository.createBrainVersion(brandId, version, input);
	}
}
