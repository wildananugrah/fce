// backend/tests/services/competitor-pipeline.service.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { CompetitorPipelineService } from "../../src/services/competitor-pipeline.service";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockCompetitorPipelineRepository } from "../helpers/mock-competitor-pipeline.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CompetitorPipelineService", () => {
	const pipelineRepo = new MockCompetitorPipelineRepository();
	const configRepo = new MockAnalysisConfigRepository();
	const creatorRepo = new MockCreatorRepository();
	const bossCalls: Array<{ queue: string; data: any; opts?: any }> = [];
	const boss = {
		send: async (queue: string, data: any, opts?: any) => {
			bossCalls.push({ queue, data, opts });
			return "job-id";
		},
	} as any;

	// Apify key lookup: the service needs a way to verify the workspace has a key.
	// We pass a simple lookup function.
	const apifyKeys = new Map<string, string>();
	const apifyKeyLookup = async (wsId: string) => apifyKeys.get(wsId) ?? null;

	const service = new CompetitorPipelineService(
		pipelineRepo,
		configRepo,
		creatorRepo,
		boss,
		apifyKeyLookup,
		mockLogger,
	);

	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();
	const userId = crypto.randomUUID();

	afterEach(() => {
		pipelineRepo.clear();
		configRepo.clear();
		creatorRepo.clear();
		bossCalls.length = 0;
		apifyKeys.clear();
	});

	async function seedConfigWithCreator(): Promise<{ configId: string; creatorId: string }> {
		const config = await configRepo.create({
			workspaceId,
			projectId,
			input: {
				name: "Fitness config",
				brandContext: "ctx",
				analysisInstructions: "instr",
				outputPreferences: "3 scripts",
			},
		});
		const creator = await creatorRepo.create({
			workspaceId,
			projectId,
			createdBy: userId,
			input: { platform: "tiktok", profileUrl: "u", username: "c1", niche: "fitness" },
		});
		configRepo.creatorStore = creatorRepo.creators;
		configRepo.joinRows.push({ configId: config.id, creatorId: creator.id });
		return { configId: config.id, creatorId: creator.id };
	}

	describe("createRun", () => {
		it("fails fast if workspace has no Apify key", async () => {
			const { configId } = await seedConfigWithCreator();
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("Apify API key not configured");
		});

		it("fails if config has no creators", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const config = await configRepo.create({
				workspaceId,
				projectId,
				input: {
					name: "empty",
					brandContext: "b",
					analysisInstructions: "i",
					outputPreferences: "o",
				},
			});
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId: config.id,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("at least one creator");
		});

		it("rejects out-of-range inputs", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 0,
					lookbackPool: 20,
					timeframeDays: 30,
				}),
			).rejects.toThrow("videosPerCreator");
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 1,
					timeframeDays: 30,
				}),
			).rejects.toThrow("lookbackPool");
			await expect(
				service.createRun(workspaceId, projectId, userId, {
					configId,
					videosPerCreator: 3,
					lookbackPool: 20,
					timeframeDays: 500,
				}),
			).rejects.toThrow("timeframeDays");
		});

		it("creates a pending run and enqueues the job", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			expect(run.status).toBe("pending");
			expect(bossCalls).toHaveLength(1);
			expect(bossCalls[0].queue).toBe("competitor-pipeline");
			expect(bossCalls[0].data).toEqual({ runId: run.id });
			expect(bossCalls[0].opts).toEqual({ expireInSeconds: 1800 });
		});
	});

	describe("cancelRun", () => {
		it("flips status from pending to cancelling", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			const cancelled = await service.cancelRun(run.id);
			expect(cancelled.status).toBe("cancelling");
		});

		it("refuses to cancel a terminal run", async () => {
			apifyKeys.set(workspaceId, "apify_test_key");
			const { configId } = await seedConfigWithCreator();
			const run = await service.createRun(workspaceId, projectId, userId, {
				configId,
				videosPerCreator: 3,
				lookbackPool: 20,
				timeframeDays: 30,
			});
			await pipelineRepo.updateRun(run.id, { status: "completed" });
			await expect(service.cancelRun(run.id)).rejects.toThrow("terminal");
		});
	});
});
