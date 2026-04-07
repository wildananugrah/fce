import type { Brand, BrandBrainVersion } from "@prisma/client";
import type {
	CreateBrainVersionInput,
	CreateBrandInput,
	UpdateBrandInput,
} from "../../types/brand.types";

export interface IBrandService {
	list(workspaceId: string): Promise<Brand[]>;
	getById(id: string): Promise<Brand & { brainVersions: BrandBrainVersion[] }>;
	create(workspaceId: string, input: CreateBrandInput): Promise<Brand>;
	update(id: string, input: UpdateBrandInput): Promise<Brand>;
	createBrainVersion(brandId: string, input: CreateBrainVersionInput): Promise<BrandBrainVersion>;
}
