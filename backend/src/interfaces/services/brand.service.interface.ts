import type { Brand, BrandBrainVersion } from "@prisma/client";
import type {
	CreateBrainVersionInput,
	CreateBrandInput,
	UpdateBrandInput,
} from "../../types/brand.types";

export interface IBrandService {
	list(workspaceId: string, projectId?: string): Promise<Brand[]>;
	getById(id: string): Promise<Brand & { brainVersions: BrandBrainVersion[] }>;
	create(workspaceId: string, input: CreateBrandInput): Promise<Brand>;
	update(id: string, input: UpdateBrandInput): Promise<Brand>;
	// Soft-delete: moves the brand into Trash. Descendants (products, topics,
	// content) are hidden from normal lists via filtering joins.
	delete(id: string): Promise<void>;
	restore(id: string): Promise<void>;
	permanentDelete(id: string): Promise<void>;
	createBrainVersion(brandId: string, input: CreateBrainVersionInput): Promise<BrandBrainVersion>;
}
