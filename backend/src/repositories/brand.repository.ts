import type { Brand, BrandBrainVersion, PrismaClient } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";

export class BrandRepository implements IBrandRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string): Promise<(Brand & { brainVersions: BrandBrainVersion[] })[]> {
		return this.prisma.brand.findMany({
			where: { workspaceId },
			orderBy: { updatedAt: "desc" },
			include: {
				brainVersions: {
					where: { isActive: true },
					take: 1,
				},
			},
		});
	}

	async findById(id: string): Promise<(Brand & { brainVersions: BrandBrainVersion[] }) | null> {
		return this.prisma.brand.findUnique({
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
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
	}): Promise<Brand> {
		return this.prisma.brand.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId">
		>,
	): Promise<Brand> {
		return this.prisma.brand.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.brand.delete({ where: { id } });
	}

	async findActiveBrainVersion(brandId: string): Promise<BrandBrainVersion | null> {
		return this.prisma.brandBrainVersion.findFirst({
			where: { brandId, isActive: true },
		});
	}

	async createBrainVersion(
		brandId: string,
		version: number,
		data: any,
	): Promise<BrandBrainVersion> {
		await this.deactivateAllVersions(brandId);

		const brainVersion = await this.prisma.brandBrainVersion.create({
			data: {
				brandId,
				version,
				isActive: true,
				...data,
			},
		});

		await this.prisma.brand.update({
			where: { id: brandId },
			data: { activeBrainVersionId: brainVersion.id },
		});

		return brainVersion;
	}

	async getNextVersionNumber(brandId: string): Promise<number> {
		const count = await this.prisma.brandBrainVersion.count({ where: { brandId } });
		return count + 1;
	}

	async deactivateAllVersions(brandId: string): Promise<void> {
		await this.prisma.brandBrainVersion.updateMany({
			where: { brandId },
			data: { isActive: false },
		});
	}
}
