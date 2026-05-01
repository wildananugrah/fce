import { describe, expect, it } from "bun:test";
import { OpenRouterApiError } from "../../src/errors/openrouter-api-error";

describe("OpenRouterApiError", () => {
	it("402 → suggests adding credits", () => {
		const e = new OpenRouterApiError(402, "low balance");
		expect(e.message).toMatch(/insufficient credits/i);
		expect(e.message).toMatch(/openrouter\.ai/i);
		expect(e.status).toBe(402);
	});

	it("401 → suggests updating key", () => {
		const e = new OpenRouterApiError(401, "");
		expect(e.message).toMatch(/invalid or expired/i);
		expect(e.message).toMatch(/Workspace Settings/i);
	});

	it("404 → suggests checking model id", () => {
		const e = new OpenRouterApiError(404, "model not found");
		expect(e.message).toMatch(/model is not available/i);
	});

	it("429 → suggests retry", () => {
		const e = new OpenRouterApiError(429, "");
		expect(e.message).toMatch(/rate limit/i);
	});

	it("5xx → suggests temporary issue", () => {
		const e = new OpenRouterApiError(503, "");
		expect(e.message).toMatch(/temporary/i);
	});

	it("fromResponse parses OpenRouter's JSON error body", async () => {
		const body = JSON.stringify({
			error: {
				message: "This request requires more credits",
				code: 402,
			},
		});
		const response = new Response(body, { status: 402 });
		const e = await OpenRouterApiError.fromResponse(response);
		expect(e.status).toBe(402);
		expect(e.upstreamMessage).toBe("This request requires more credits");
		expect(e.message).toMatch(/insufficient credits/i);
	});

	it("fromResponse handles non-JSON body", async () => {
		const response = new Response("Bad Gateway", { status: 502 });
		const e = await OpenRouterApiError.fromResponse(response);
		expect(e.status).toBe(502);
		expect(e.upstreamMessage).toBe("Bad Gateway");
		expect(e.message).toMatch(/temporary/i);
	});
});
