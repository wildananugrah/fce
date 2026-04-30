import { describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";
import { MissingApiKeyError } from "../../src/errors/ai-key-missing-error";
import { UrlFetchError } from "../../src/errors/url-fetch-error";
import type { ILogger } from "../../src/interfaces/providers/logger.provider.interface";

// The production app uses `app.onError(...)` to translate thrown errors
// to JSON responses (see backend/src/index.ts). This file replicates that
// handler shape so we can unit-test the typed-error → 400 mapping
// without spinning up the whole composition root.

class MockLogger implements ILogger {
	warn = mock((_msg: string, _meta?: Record<string, unknown>) => {});
	info = mock((_msg: string, _meta?: Record<string, unknown>) => {});
	error = mock((_msg: string, _meta?: Record<string, unknown>) => {});
	debug = mock((_msg: string, _meta?: Record<string, unknown>) => {});
	child(): ILogger {
		return this;
	}
}

function buildApp(thrown: unknown) {
	const app = new Hono();
	const logger = new MockLogger();

	const knownErrors = [
		"Email already registered",
		"Invalid email or password",
		"User not found",
	];

	app.onError((err, c) => {
		const message = err instanceof Error ? err.message : String(err);
		logger.error("Unhandled exception", { error: message });

		if (err instanceof MissingApiKeyError || err instanceof UrlFetchError) {
			return c.json({ error: message }, 400);
		}
		if (knownErrors.includes(message)) {
			return c.json({ error: message }, 400);
		}
		return c.json({ error: "Internal server error" }, 500);
	});

	app.get("/boom", async () => {
		throw thrown;
	});
	return app;
}

describe("app.onError typed-error mapping", () => {
	it("returns 400 with the message when MissingApiKeyError is thrown", async () => {
		const app = buildApp(new MissingApiKeyError("Gemini"));
		const res = await app.request("/boom");
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe(
			"No Gemini API key configured for this workspace. " +
				"Set one in Workspace Settings → Integrations → AI Providers before using AI features.",
		);
	});

	it("returns 400 with the message when UrlFetchError is thrown", async () => {
		const app = buildApp(new UrlFetchError(["https://example.com/missing"]));
		const res = await app.request("/boom");
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe(
			"Couldn't fetch content from https://example.com/missing. " +
				"Check the URL is reachable in a browser, or paste the details manually instead of using auto-fill.",
		);
	});

	it("includes the detail suffix when UrlFetchError is given one", async () => {
		const app = buildApp(new UrlFetchError(["https://example.com"], "HTTP 403"));
		const res = await app.request("/boom");
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("(HTTP 403)");
	});

	it("falls back to 500 Internal server error for unrecognised throws", async () => {
		const app = buildApp(new Error("something else broke"));
		const res = await app.request("/boom");
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Internal server error");
	});
});
