import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fixtureProfile from "../fixtures/competitor/tiktok-profile-response.json";
import { CreatorEnrichmentJob } from "../../src/jobs/creator-enrichment.job";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CreatorEnrichmentJob", () => {
	let creatorRepo: MockCreatorRepository;
	let apify: MockApifyProvider;
	let notifications: Array<{ userId: string; event: any }>;

	// ApifyKeyLookup signature matches the service.
	const apifyKeys = new Map<string, string>();

	beforeEach(() => {
		creatorRepo = new MockCreatorRepository();
		apify = new MockApifyProvider();
		notifications = [];
		apifyKeys.clear();
	});

	afterEach(() => {
		creatorRepo.clear();
	});

	function buildJob(): CreatorEnrichmentJob {
		const notifService = {
			notify: (userId: string, event: any) => notifications.push({ userId, event }),
		} as any;
		notifications.length = 0;
		// Override mock apify to return our fixture data from getRunResults.
		(apify as any).getRunResults = async () => fixtureProfile;

		return new CreatorEnrichmentJob(
			creatorRepo,
			apify,
			async (wsId: string) => apifyKeys.get(wsId) ?? null,
			notifService,
			mockLogger,
		);
	}

	it("fails fast when no Apify key", async () => {
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
		expect(after?.enrichmentError).toContain("Apify API key");
	});

	it("happy path: enriches with follower count + avatar + bio", async () => {
		apifyKeys.set("ws", "apify_test");
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("enriched");
		expect(after?.followerCount).toBe(125000);
		expect(after?.avatarUrl).toContain("acme_avatar");
		expect(after?.bio).toContain("stronger");
		expect(notifications[0]?.userId).toBe("user-1");
		expect(notifications[0]?.event?.type).toBe("creator_enrichment_completed");
	});

	it("marks as failed when Apify actor throws", async () => {
		apifyKeys.set("ws", "apify_test");
		apify.shouldFail = true;
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
		expect(after?.enrichmentError).toBeDefined();
	});

	it("marks as failed when profile parser returns null (no items)", async () => {
		apifyKeys.set("ws", "apify_test");
		const creator = await creatorRepo.create({
			workspaceId: "ws",
			projectId: "p",
			createdBy: "user-1",
			input: { platform: "tiktok", profileUrl: "u", username: "acme", niche: "fit" },
		});
		const job = buildJob();
		// Override after buildJob() so it wins over buildJob's default fixture setup.
		(apify as any).getRunResults = async () => [];

		await job.handle({ creatorId: creator.id });

		const after = await creatorRepo.findById(creator.id);
		expect(after?.enrichmentStatus).toBe("failed");
	});
});
