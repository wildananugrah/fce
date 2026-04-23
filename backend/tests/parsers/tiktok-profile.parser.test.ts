import { describe, expect, it } from "bun:test";
import fixtureProfile from "../fixtures/competitor/tiktok-profile-response.json";
import { TikTokProfileParser } from "../../src/providers/apify-parsers/tiktok-profile.parser";

describe("TikTokProfileParser", () => {
	const parser = new TikTokProfileParser();

	it("extracts profile fields from the first item's authorMeta + authorStats", () => {
		const profile = parser.parse(fixtureProfile as any);
		expect(profile).toEqual({
			username: "acme",
			displayName: "Acme Fitness",
			avatarUrl: "https://p16-sign-va.tiktokcdn.com/acme_avatar.jpg",
			followerCount: 125000,
			bio: "We help you get stronger.",
			platformMetadata: {
				videoCount: 218,
				followingCount: 42,
				totalHearts: 3100000,
			},
		});
	});

	it("returns null when no items", () => {
		expect(parser.parse([])).toBeNull();
	});

	it("handles missing stats gracefully (private/deleted account)", () => {
		const profile = parser.parse([
			{
				authorMeta: { name: "u", nickName: "U" },
			},
		] as any);
		expect(profile).toEqual({
			username: "u",
			displayName: "U",
			avatarUrl: null,
			followerCount: null,
			bio: null,
			platformMetadata: {
				videoCount: null,
				followingCount: null,
				totalHearts: null,
			},
		});
	});
});
