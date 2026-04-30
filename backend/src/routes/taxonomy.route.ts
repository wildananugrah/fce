import { Hono } from "hono";
import { FRAMEWORKS, HOOK_TYPES, TONE_PRESETS, VISUAL_STYLES } from "../config/strategy-controls";

export function createTaxonomyRoutes() {
	const app = new Hono();

	app.get("/frameworks", (c) => c.json({ data: FRAMEWORKS }));
	app.get("/hook-types", (c) => c.json({ data: HOOK_TYPES }));
	app.get("/tone-presets", (c) => c.json({ data: TONE_PRESETS }));
	app.get("/visual-styles", (c) => c.json({ data: VISUAL_STYLES }));

	return app;
}
