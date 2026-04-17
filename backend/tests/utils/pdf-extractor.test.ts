import { describe, expect, it } from "bun:test";
import { truncateExtractedText } from "../../src/utils/pdf-extractor";

describe("truncateExtractedText", () => {
	it("returns input unchanged when shorter than max", () => {
		expect(truncateExtractedText("hello", 100)).toBe("hello");
	});

	it("truncates with notice when longer than max", () => {
		const input = "x".repeat(50);
		const result = truncateExtractedText(input, 10);
		expect(result.startsWith("xxxxxxxxxx")).toBe(true);
		expect(result).toContain("[truncated");
		expect(result.length).toBeGreaterThan(10); // notice adds chars
	});

	it("handles empty input", () => {
		expect(truncateExtractedText("", 100)).toBe("");
	});
});
