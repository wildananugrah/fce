import { afterEach, describe, expect, it } from "bun:test";
import { CreatorService } from "../../src/services/creator.service";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockBoss = { send: async () => "job-id-stub" } as any;
const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CreatorService", () => {
	const repo = new MockCreatorRepository();
	const bossCalls: Array<{ queue: string; data: any }> = [];
	const bossCapturing = {
		send: async (queue: string, data: any) => {
			bossCalls.push({ queue, data });
			return "job-id";
		},
	} as any;

	const service = new CreatorService(repo, bossCapturing, mockLogger);

	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		repo.clear();
		bossCalls.length = 0;
	});

	describe("create", () => {
		it("creates a creator with pending enrichment and enqueues the job", async () => {
			const creator = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "https://tiktok.com/@acme",
				username: "acme",
				niche: "fitness",
			});

			expect(creator.username).toBe("acme");
			expect(creator.enrichmentStatus).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("creator-enrichment");
			expect(bossCalls[0].data).toEqual({ creatorId: creator.id });
		});

		it("rejects non-tiktok platforms in v1", async () => {
			await expect(
				service.create(workspaceId, projectId, userId, {
					platform: "instagram",
					profileUrl: "https://instagram.com/acme",
					username: "acme",
					niche: "fitness",
				}),
			).rejects.toThrow("Platform not supported");
		});

		it("rejects duplicate (projectId, platform, username)", async () => {
			await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "https://tiktok.com/@acme",
				username: "acme",
				niche: "fitness",
			});
			await expect(
				service.create(workspaceId, projectId, userId, {
					platform: "tiktok",
					profileUrl: "https://tiktok.com/@acme",
					username: "acme",
					niche: "fitness",
				}),
			).rejects.toThrow("already exists");
		});
	});

	describe("list", () => {
		it("excludes archived by default", async () => {
			const a = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u1",
				username: "u1",
				niche: "n",
			});
			await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u2",
				username: "u2",
				niche: "n",
			});
			await service.archive(a.id);

			const rows = await service.list(projectId);
			expect(rows).toHaveLength(1);
			expect(rows[0].username).toBe("u2");
		});

		it("includes archived when filter set", async () => {
			const a = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "u1",
				username: "u1",
				niche: "n",
			});
			await service.archive(a.id);

			const rows = await service.list(projectId, { includeArchived: true });
			expect(rows).toHaveLength(1);
		});
	});

	describe("archive", () => {
		it("sets archivedAt but keeps record", async () => {
			const created = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "url",
				username: "u",
				niche: "n",
			});
			const archived = await service.archive(created.id);
			expect(archived.archivedAt).toBeInstanceOf(Date);
			const still = await service.get(created.id);
			expect(still.id).toBe(created.id);
		});
	});

	describe("refreshEnrichment", () => {
		it("flips status back to pending and re-enqueues", async () => {
			const created = await service.create(workspaceId, projectId, userId, {
				platform: "tiktok",
				profileUrl: "url",
				username: "u",
				niche: "n",
			});
			// Simulate a previous enrichment completed.
			await repo.updateEnrichment(created.id, {
				enrichmentStatus: "enriched",
				followerCount: 1000,
			});
			bossCalls.length = 0;

			const refreshed = await service.refreshEnrichment(created.id);

			expect(refreshed.enrichmentStatus).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("creator-enrichment");
		});
	});
});
