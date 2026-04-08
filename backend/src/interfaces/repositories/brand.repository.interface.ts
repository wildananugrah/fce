import type { Brand, BrandBrainVersion } from "@prisma/client";

export interface IBrandRepository {
	findByWorkspace(workspaceId: string): Promise<Brand[]>;
	findById(id: string): Promise<(Brand & { brainVersions: BrandBrainVersion[] }) | null>;
	create(data: {
		workspaceId: string;
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
	}): Promise<Brand>;
	update(
		id: string,
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId">
		>,
	): Promise<Brand>;

	delete(id: string): Promise<void>;
	findActiveBrainVersion(brandId: string): Promise<BrandBrainVersion | null>;
	createBrainVersion(brandId: string, version: number, data: any): Promise<BrandBrainVersion>;
	getNextVersionNumber(brandId: string): Promise<number>;
	deactivateAllVersions(brandId: string): Promise<void>;
}
