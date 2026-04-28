import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { SkillRegistry } from "../../src/config/skills/loader";
import { skillManifests } from "../../src/config/skills/manifests";
import { createSkillListRoutes } from "../../src/routes/skill-list.route";

function buildRegistry(): SkillRegistry {
	const all = new Set<string>();
	for (const slugs of Object.values(skillManifests)) for (const s of slugs) all.add(s);
	const map = new Map();
	for (const slug of all) {
		map.set(slug, {
			slug,
			name: slug
				.split("-")
				.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
				.join(" "),
			description: `Description for ${slug}`,
			content: "",
		});
	}
	return map;
}

function mount(registry: SkillRegistry) {
	const app = new Hono();
	app.route("/api/skills", createSkillListRoutes(registry));
	return app;
}

describe("skill-list routes", () => {
	const registry = buildRegistry();
	const app = mount(registry);

	const cases: Array<[string, keyof typeof skillManifests]> = [
		["/api/skills/brand-brain", "brandBrain"],
		["/api/skills/product-brain", "productBrain"],
		["/api/skills/topic", "topic"],
		["/api/skills/content", "content"],
		["/api/skills/chat", "chat"],
	];

	for (const [path, generator] of cases) {
		test(`${path} returns the ${generator} manifest`, async () => {
			const res = await app.request(path);
			expect(res.status).toBe(200);
			const body = (await res.json()) as {
				data: Array<{ slug: string; name: string; description: string }>;
			};
			expect(Array.isArray(body.data)).toBe(true);
			expect(body.data.map((s) => s.slug)).toEqual([...skillManifests[generator]]);
			for (const row of body.data) {
				expect(typeof row.slug).toBe("string");
				expect(typeof row.name).toBe("string");
				expect(typeof row.description).toBe("string");
			}
		});
	}

	test("/api/skills/unknown returns 404", async () => {
		const res = await app.request("/api/skills/unknown");
		expect(res.status).toBe(404);
	});
});
