import type { Brand, BrandBrainVersion } from "@prisma/client";

export interface IBrandRepository {
	findByWorkspace(workspaceId: string, projectId?: string): Promise<Brand[]>;
	findById(id: string): Promise<(Brand & { brainVersions: BrandBrainVersion[] }) | null>;
	create(data: {
		workspaceId: string;
		projectId?: string | null;
		name: string;
		slug: string;
		category?: string;
		websiteUrl?: string;
	}): Promise<Brand>;
	/** Resolve the Default project's id for a workspace (`slug = "default"`), or null if missing. */
	findDefaultProjectId(workspaceId: string): Promise<string | null>;
	update(
		id: string,
		data: Partial<
			Pick<Brand, "name" | "category" | "websiteUrl" | "status" | "activeBrainVersionId">
		>,
	): Promise<Brand>;

	delete(id: string): Promise<void>;
	archive(id: string): Promise<void>;
	restore(id: string): Promise<void>;
	findArchivedByWorkspace(workspaceId: string): Promise<Brand[]>;
	findActiveBrainVersion(brandId: string): Promise<BrandBrainVersion | null>;
	createBrainVersion(brandId: string, version: number, data: any): Promise<BrandBrainVersion>;
	getNextVersionNumber(brandId: string): Promise<number>;
	deactivateAllVersions(brandId: string): Promise<void>;
}
