import { Hono } from "hono";
import type { ITaxonomyService } from "../interfaces/services/taxonomy.service.interface";

export function createTaxonomyRoutes(taxonomyService: ITaxonomyService) {
	const app = new Hono();

	app.get("/frameworks", async (c) => {
		const frameworks = await taxonomyService.getFrameworks();
		return c.json({ data: frameworks });
	});

	app.get("/hook-types", async (c) => {
		const hookTypes = await taxonomyService.getHookTypes();
		return c.json({ data: hookTypes });
	});

	app.get("/tone-presets", async (c) => {
		const tonePresets = await taxonomyService.getTonePresets();
		return c.json({ data: tonePresets });
	});

	app.get("/visual-styles", async (c) => {
		const visualStyles = await taxonomyService.getVisualStyles();
		return c.json({ data: visualStyles });
	});

	return app;
}
