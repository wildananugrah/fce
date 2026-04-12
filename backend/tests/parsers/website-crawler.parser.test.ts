import { describe, expect, it } from "bun:test";
import { WebsiteCrawlerParser } from "../../src/providers/apify-parsers/website-crawler.parser";

describe("WebsiteCrawlerParser", () => {
	const parser = new WebsiteCrawlerParser();

	it("should parse crawled page items", () => {
		const raw = [
			{
				url: "https://example.com/about",
				text: "We are a tech company building products.",
				metadata: { title: "About Us", description: "Company info" },
				loadedAt: "2026-04-12T10:00:00Z",
			},
		];
		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].dataType).toBe("page_content");
		expect(results[0].title).toBe("About Us");
		expect(results[0].url).toBe("https://example.com/about");
		expect(results[0].content).toBe("We are a tech company building products.");
		expect(results[0].metadata.description).toBe("Company info");
	});

	it("should skip items without text or markdown", () => {
		const raw = [{ url: "https://example.com/empty" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});

	it("should fall back to markdown when text is missing", () => {
		const raw = [{ markdown: "# Hello\nWorld", url: "https://example.com" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].content).toBe("# Hello\nWorld");
	});
});
