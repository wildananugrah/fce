import type { Brand, BrandBrainVersion, PrismaClient } from "@prisma/client";
import type { IBrandRepository } from "../interfaces/repositories/brand.repository.interface";

export class BrandRepository implements IBrandRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(
		workspaceId: string,
		projectId?: string,
	): Promise<(Brand & { brainVersions: BrandBrainVersion[] })[]> {
		const where: { workspaceId: string; archivedAt: null; projectId?: string } = {
			workspaceId,
			archivedAt: null,
		};
		if (projectId) where.projectId = projectId;
		return this.prisma.brand.findMany({
			where,
			orderBy: { updatedAt: "desc" },
			include: {
				brainVersions: {
					where: { isActive: true },
					take: 1,
				},
			},
		});
	}

	async findDefaultProjectId(workspaceId: string): Promise<string | null> {
		const project = await this.prisma.project.findFirst({
			where: { workspaceId, slug: "default" },
			select: { id: true },
		});
		return project?.id ?? null;
	}

	async projectHasBrand(projectId: string): Promise<boolean> {
		const existing = await this.prisma.brand.findFirst({
			where: { projectId, archivedAt: null },
			select: { id: true },
		});
		return existing !== null;
	}

	async findArchivedByWorkspace(workspaceId: string): Promise<Brand[]> {
		return this.prisma.brand.findMany({
			where: { workspaceId, archivedAt: { not: null } },
			orderBy: { archivedAt: "desc" },
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
		projectId: string;
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
		language?: string;
	}): Promise<Brand> {
		return this.prisma.brand.create({ data });
	}

	async update(
		id: string,
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId" | "language">
		>,
	): Promise<Brand> {
		return this.prisma.brand.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.brand.delete({ where: { id } });
	}

	async archive(id: string): Promise<void> {
		await this.prisma.brand.update({
			where: { id },
			data: { archivedAt: new Date() },
		});
	}

	async restore(id: string): Promise<void> {
		await this.prisma.brand.update({
			where: { id },
			data: { archivedAt: null },
		});
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
