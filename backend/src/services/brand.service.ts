import type { Brand, BrandBrainVersion } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";
import type { IBrandService } from "../interfaces/services/brand.service.interface";
import type {
	CreateBrainVersionInput,
	CreateBrandInput,
	UpdateBrandInput,
} from "../types/brand.types";

export class BrandService implements IBrandService {
	constructor(private brandRepository: IBrandRepository) {}

	async list(workspaceId: string, projectId?: string): Promise<Brand[]> {
		return this.brandRepository.findByWorkspace(workspaceId, projectId);
	}

	async getById(id: string): Promise<Brand & { brainVersions: BrandBrainVersion[] }> {
		const brand = await this.brandRepository.findById(id);
		if (!brand) {
			throw new Error("Brand not found");
		}
		return brand;
	}

	async create(workspaceId: string, input: CreateBrandInput): Promise<Brand> {
		if (!input.projectId) {
			throw new Error(
				"projectId is required — pick or create a project before creating a brand",
			);
		}

		// Pre-check kept for the friendly error message; DB partial unique
		// catches the same condition under race.
		if (await this.brandRepository.projectHasBrand(input.projectId)) {
			throw new Error(
				"This project already has a brand. Each project can contain only one brand — create a new project to add another.",
			);
		}

		try {
			return await this.brandRepository.create({
				workspaceId,
				projectId: input.projectId,
				name: input.name,
				slug: input.slug,
				category: input.category,
				websiteUrl: input.websiteUrl,
				language: input.language,
			});
		} catch (e) {
			// P2002 on (project_id, slug) fires when an archived brand with the
			// same slug still sits in this project (archivedAt doesn't nullify
			// the unique constraint), or when a rapid double-submit races past
			// projectHasBrand. Surface a clear 400 so the UI can show a useful
			// message instead of a generic 500.
			if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
				throw new Error(
					"A brand with this name is already in this project — possibly in Workspace Settings → Trash. Restore it, permanently delete it from Trash, or pick a different name.",
				);
			}
			throw e;
		}
	}

	async update(id: string, input: UpdateBrandInput): Promise<Brand> {
		return this.brandRepository.update(id, input);
	}

	async delete(id: string): Promise<void> {
		const brand = await this.brandRepository.findById(id);
		if (!brand) {
			throw new Error("Brand not found");
		}
		await this.brandRepository.archive(id);
	}

	async restore(id: string): Promise<void> {
		const brand = await this.brandRepository.findById(id);
		if (!brand) {
			throw new Error("Brand not found");
		}
		await this.brandRepository.restore(id);
	}

	async permanentDelete(id: string): Promise<void> {
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
