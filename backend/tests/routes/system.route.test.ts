import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createSystemRoutes } from "../../src/routes/system.route";

describe("system routes", () => {
	it("GET /ai-mode returns the configured mode", async () => {
		const app = new Hono();
		app.route("/", createSystemRoutes("openrouter"));
		const res = await app.request("/ai-mode");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ data: { mode: "openrouter" } });
	});

	it("GET /ai-mode reflects legacy mode", async () => {
		const app = new Hono();
		app.route("/", createSystemRoutes("legacy"));
		const res = await app.request("/ai-mode");
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toEqual({ data: { mode: "legacy" } });
	});
});
