import type { Framework, HookType, PrismaClient, TonePreset, VisualStyle } from "@prisma/client";
import type { ITaxonomyRepository } from "../interfaces/repositories/taxonomy.repository.interface";

export class TaxonomyRepository implements ITaxonomyRepository {
	constructor(private prisma: PrismaClient) {}

	async findAllFrameworks(): Promise<Framework[]> {
		return this.prisma.framework.findMany({ orderBy: { name: "asc" } });
	}

	async findAllHookTypes(): Promise<HookType[]> {
		return this.prisma.hookType.findMany({ orderBy: { name: "asc" } });
	}

	async findAllTonePresets(): Promise<TonePreset[]> {
		return this.prisma.tonePreset.findMany({ orderBy: { name: "asc" } });
	}

	async findAllVisualStyles(): Promise<VisualStyle[]> {
		return this.prisma.visualStyle.findMany({ orderBy: { name: "asc" } });
	}
}
