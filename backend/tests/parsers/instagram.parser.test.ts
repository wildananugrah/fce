import { describe, expect, it } from "bun:test";
import { InstagramParser } from "../../src/providers/apify-parsers/instagram.parser";

describe("InstagramParser", () => {
	const parser = new InstagramParser();

	it("should parse Instagram post items", () => {
		const raw = [
			{
				caption: "Check out our new product! #launch #tech",
				ownerUsername: "brandname",
				shortCode: "ABC123",
				type: "Image",
				likesCount: 1500,
				commentsCount: 42,
				hashtags: ["launch", "tech"],
				displayUrl: "https://instagram.com/p/ABC123/media",
				timestamp: "2026-04-10T12:00:00Z",
			},
		];
		const results = parser.parse(raw);
		expect(results).toHaveLength(1);
		expect(results[0].dataType).toBe("social_post");
		expect(results[0].title).toBe("@brandname");
		expect(results[0].content).toBe("Check out our new product! #launch #tech");
		expect(results[0].metadata.platform).toBe("instagram");
		expect(results[0].metadata.likesCount).toBe(1500);
		expect(results[0].metadata.commentsCount).toBe(42);
		expect(results[0].metadata.hashtags).toEqual(["launch", "tech"]);
	});

	it("should skip items without caption or type", () => {
		const raw = [{ url: "https://instagram.com/p/empty" }];
		const results = parser.parse(raw);
		expect(results).toHaveLength(0);
	});
});
