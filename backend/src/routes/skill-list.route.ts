import { Hono } from "hono";
import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";
import type { GeneratorName } from "../config/skills/manifests";

/**
 * GET /api/skills/<generator> — returns the manifest's resolved skills as
 * { slug, name, description }[] for UI consumption (chat @-mention autocomplete,
 * generator-form "Skills applied" strips, etc.).
 *
 * The URL slug for each generator is mapped explicitly here so renaming a
 * generator type (e.g. brandBrain → brandBrainV2) never silently changes a
 * public URL.
 */
const ROUTES: Record<GeneratorName, string> = {
	brandBrain: "brand-brain",
	productBrain: "product-brain",
	topic: "topic",
	content: "content",
	chat: "chat",
};

export function createSkillListRoutes(skillRegistry: SkillRegistry) {
	const app = new Hono();

	for (const [generator, urlSlug] of Object.entries(ROUTES) as [GeneratorName, string][]) {
		app.get(`/${urlSlug}`, (c) => {
			const skills = filterByManifest(skillRegistry, generator).map((s) => ({
				slug: s.slug,
				name: s.name,
				description: s.description,
			}));
			return c.json({ data: skills });
		});
	}

	return app;
}
