import { afterEach, describe, expect, it } from "bun:test";
import { ResearchService } from "../../src/services/research.service";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockResearchRepository } from "../helpers/mock-research.repository";

const mockBoss = { send: async () => undefined } as any;
const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("ResearchService", () => {
	const repo = new MockResearchRepository();
	const apify = new MockApifyProvider();
	const service = new ResearchService(repo, apify, mockBoss, mockLogger);
	const workspaceId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		repo.clear();
		apify.shouldFail = false;
	});

	describe("createRun", () => {
		it("should throw if no Apify key is configured", async () => {
			await expect(
				service.createRun(workspaceId, userId, { actorType: "instagram", input: { username: "test" } }),
			).rejects.toThrow("Apify API key not configured");
		});

		it("should create a run when Apify key exists", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			const run = await service.createRun(workspaceId, userId, {
				actorType: "instagram", input: { username: "competitor" },
			});
			expect(run.workspaceId).toBe(workspaceId);
			expect(run.userId).toBe(userId);
			expect(run.actorType).toBe("instagram");
			expect(run.status).toBe("pending");
		});

		it("should throw for unknown actor type", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			await expect(
				service.createRun(workspaceId, userId, { actorType: "unknown_actor" as any, input: {} }),
			).rejects.toThrow("Unknown actor type");
		});
	});

	describe("listRuns", () => {
		it("should return runs for workspace", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			await service.createRun(workspaceId, userId, { actorType: "instagram", input: { username: "a" } });
			await service.createRun(workspaceId, userId, { actorType: "google_search", input: { query: "test" } });
			const runs = await service.listRuns(workspaceId);
			expect(runs).toHaveLength(2);
		});

		it("should filter by actorType", async () => {
			await repo.upsertWorkspaceSetting(workspaceId, { apifyApiKey: "apify_api_test123" });
			await service.createRun(workspaceId, userId, { actorType: "instagram", input: {} });
			await service.createRun(workspaceId, userId, { actorType: "google_search", input: {} });
			const runs = await service.listRuns(workspaceId, { actorType: "instagram" });
			expect(runs).toHaveLength(1);
			expect(runs[0].actorType).toBe("instagram");
		});
	});

	describe("settings", () => {
		it("should report no key when not set", async () => {
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(false);
		});

		it("should set and mask key", async () => {
			await service.setApifyKey(workspaceId, "apify_api_1234567890");
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(true);
			expect(settings.maskedKey).toBe("apif...7890");
		});

		it("should remove key", async () => {
			await service.setApifyKey(workspaceId, "apify_api_1234567890");
			await service.removeApifyKey(workspaceId);
			const settings = await service.getSettings(workspaceId);
			expect(settings.hasApifyKey).toBe(false);
		});
	});
});
