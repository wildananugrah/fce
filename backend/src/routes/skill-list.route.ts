import { Hono } from "hono";
import type { SkillRegistry } from "../config/skills/loader";
import { filterByManifest } from "../config/skills/loader";

/**
 * GET /api/skills/chat — returns the chat manifest's skills as
 * { slug, name, description }[] for the chat composer's @-mention autocomplete.
 *
 * Other generators don't need a public endpoint; their skills are wired
 * server-side at job time.
 */
export function createSkillListRoutes(skillRegistry: SkillRegistry) {
	const app = new Hono();

	app.get("/chat", (c) => {
		const skills = filterByManifest(skillRegistry, "chat").map((s) => ({
			slug: s.slug,
			name: s.name,
			description: s.description,
		}));
		return c.json({ data: skills });
	});

	return app;
}
