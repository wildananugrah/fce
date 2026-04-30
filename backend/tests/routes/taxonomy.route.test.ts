import { describe, expect, it } from "bun:test";
import { createTaxonomyRoutes } from "../../src/routes/taxonomy.route";

describe("taxonomy routes", () => {
	const app = createTaxonomyRoutes();

	it("GET /frameworks returns 11 items, first is AIDA", async () => {
		const res = await app.request("/frameworks");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(11);
		expect(body.data[0]).toMatchObject({ id: "aida", name: "AIDA" });
	});

	it("GET /hook-types returns 10 items, first is Curiosity hook", async () => {
		const res = await app.request("/hook-types");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(10);
		expect(body.data[0]).toMatchObject({ id: "curiosity-hook", name: "Curiosity hook" });
	});

	it("GET /tone-presets returns 4 items, first is Playful-Bold", async () => {
		const res = await app.request("/tone-presets");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(4);
		expect(body.data[0]).toMatchObject({ id: "playful-bold", name: "Playful-Bold" });
	});

	it("GET /visual-styles returns 6 items, first is Editorial", async () => {
		const res = await app.request("/visual-styles");
		expect(res.status).toBe(200);
		const body = (await res.json()) as { data: Array<{ id: string; name: string }> };
		expect(body.data.length).toBe(6);
		expect(body.data[0]).toMatchObject({ id: "editorial", name: "Editorial" });
	});
});
