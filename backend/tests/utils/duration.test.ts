import { describe, expect, it } from "bun:test";
import { parseDuration } from "../../src/utils/duration";

describe("parseDuration", () => {
	it("parses seconds", () => {
		expect(parseDuration("30s")).toBe(30_000);
	});

	it("parses minutes", () => {
		expect(parseDuration("5m")).toBe(5 * 60_000);
	});

	it("parses hours", () => {
		expect(parseDuration("2h")).toBe(2 * 60 * 60_000);
	});

	it("parses days", () => {
		expect(parseDuration("7d")).toBe(7 * 24 * 60 * 60_000);
	});

	it("throws on invalid format", () => {
		expect(() => parseDuration("7 days")).toThrow();
		expect(() => parseDuration("abc")).toThrow();
		expect(() => parseDuration("")).toThrow();
	});
});
