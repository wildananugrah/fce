import type { Framework, HookType, TonePreset, VisualStyle } from "@prisma/client";
import type { ITaxonomyRepository } from "../interfaces/repositories/taxonomy.repository.interface";
import type { ITaxonomyService } from "../interfaces/services/taxonomy.service.interface";

export class TaxonomyService implements ITaxonomyService {
	constructor(private taxonomyRepository: ITaxonomyRepository) {}

	async getFrameworks(): Promise<Framework[]> {
		return this.taxonomyRepository.findAllFrameworks();
	}

	async getHookTypes(): Promise<HookType[]> {
		return this.taxonomyRepository.findAllHookTypes();
	}

	async getTonePresets(): Promise<TonePreset[]> {
		return this.taxonomyRepository.findAllTonePresets();
	}

	async getVisualStyles(): Promise<VisualStyle[]> {
		return this.taxonomyRepository.findAllVisualStyles();
	}
}
