import { describe, it, expect } from "bun:test";
import { TaxonomyService } from "../../src/services/taxonomy.service";
import type { ITaxonomyRepository } from "../../src/interfaces/repositories/taxonomy.repository.interface";

function createMockRepository(): ITaxonomyRepository {
	return {
		findAllFrameworks: async () => [
			{ id: "f1", name: "AIDA", description: "Attention, Interest, Desire, Action", isGlobal: true },
		],
		findAllHookTypes: async () => [
			{ id: "h1", name: "Curiosity", description: "Spark curiosity", isGlobal: true },
		],
		findAllTonePresets: async () => [
			{ id: "t1", name: "Professional", description: "Formal tone", isGlobal: true },
			{ id: "t2", name: "Casual", description: "Relaxed tone", isGlobal: true },
		],
		findAllVisualStyles: async () => [
			{ id: "v1", name: "Minimalist", description: "Clean style", isGlobal: true },
		],
	};
}

describe("TaxonomyService", () => {
	it("should return all frameworks", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getFrameworks();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("AIDA");
	});

	it("should return all hook types", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getHookTypes();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Curiosity");
	});

	it("should return all tone presets", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getTonePresets();
		expect(result).toHaveLength(2);
		expect(result[0].name).toBe("Professional");
	});

	it("should return all visual styles", async () => {
		const service = new TaxonomyService(createMockRepository());
		const result = await service.getVisualStyles();
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("Minimalist");
	});
});
