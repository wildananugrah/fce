import { describe, expect, it } from "bun:test";
import { GoogleSearchParser } from "../../src/providers/apify-parsers/google-search.parser";

describe("GoogleSearchParser", () => {
	const parser = new GoogleSearchParser();

	it("should parse organic results array", () => {
		const raw = [
			{
				searchQuery: { term: "content marketing tips" },
				organicResults: [
					{
						title: "10 Content Marketing Tips",
						url: "https://blog.com/tips",
						description: "Learn the best strategies for content marketing.",
						position: 1,
					},
					{
						title: "Marketing Guide 2026",
						url: "https://guide.com",
						description: "Complete marketing guide.",
						position: 2,
					},
				],
			},
		];
		const results = parser.parse(raw);
		expect(results).toHaveLength(2);
		expect(results[0].dataType).toBe("search_result");
		expect(results[0].title).toBe("10 Content Marketing Tips");
		expect(results[0].metadata.position).toBe(1);
		expect(results[0].metadata.searchQuery).toBe("content marketing tips");
		expect(results[1].metadata.position).toBe(2);
	});

	it("should skip items without title or description", () => {
		const raw = [{ organicResults: [{ position: 1 }] }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});
});
