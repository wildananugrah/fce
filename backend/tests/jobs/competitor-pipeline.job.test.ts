import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fixtureAnalysis from "../fixtures/competitor/gemini-video-analysis.json";
import fixtureScripts from "../fixtures/competitor/gemini-scripts.json";
import fixtureVideos from "../fixtures/competitor/tiktok-videos-response.json";
import { CompetitorPipelineJob } from "../../src/jobs/competitor-pipeline.job";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockApifyProvider } from "../helpers/mock-apify.provider";
import { MockCompetitorPipelineRepository } from "../helpers/mock-competitor-pipeline.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";
import { MockVideoAnalyzer } from "../helpers/mock-video-analyzer";
import { MockVideoFetcher } from "../helpers/mock-video-fetcher";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("CompetitorPipelineJob", () => {
	let pipelineRepo: MockCompetitorPipelineRepository;
	let configRepo: MockAnalysisConfigRepository;
	let creatorRepo: MockCreatorRepository;
	let apify: MockApifyProvider;
	let analyzer: MockVideoAnalyzer;
	let fetcher: MockVideoFetcher;
	let notifications: Array<{ workspaceId: string; event: any }>;
	let aiLogCalls: any[];

	const apifyKeys = new Map<string, string>();
	const workspaceId = "ws-1";
	const projectId = "p-1";
	const userId = "u-1";

	beforeEach(() => {
		pipelineRepo = new MockCompetitorPipelineRepository();
		configRepo = new MockAnalysisConfigRepository();
		creatorRepo = new MockCreatorRepository();
		apify = new MockApifyProvider();
		analyzer = new MockVideoAnalyzer();
		analyzer.cannedAnalysis = fixtureAnalysis as any;
		analyzer.cannedScripts = fixtureScripts as any;
		fetcher = new MockVideoFetcher();
		notifications = [];
		aiLogCalls = [];
		apifyKeys.clear();
		apifyKeys.set(workspaceId, "apify_test");

		(apify as any).getRunResults = async () => fixtureVideos;
	});

	afterEach(() => {
		pipelineRepo.clear();
		configRepo.clear();
		creatorRepo.clear();
	});

	function buildJob(): CompetitorPipelineJob {
		const notifService = {
			notify: (wsId: string, event: any) => notifications.push({ workspaceId: wsId, event }),
		} as any;
		const aiLogger = async (args: any) => aiLogCalls.push(args);

		return new CompetitorPipelineJob(
			pipelineRepo,
			configRepo,
			creatorRepo,
			apify,
			analyzer,
			fetcher.fetcher,
			async (wsId: string) => apifyKeys.get(wsId) ?? null,
			notifService,
			aiLogger,
			mockLogger,
			{ now: () => new Date("2024-03-28T00:00:00Z") },
		);
	}

	async function seedConfigAndRun(creatorCount: number): Promise<{ runId: string; configId: string }> {
		const config = await configRepo.create({
			workspaceId,
			projectId,
			input: {
				name: "Fitness config",
				brandContext: "We sell protein powder.",
				analysisInstructions: "Analyze hook + retention.",
				outputPreferences: "Generate 3 TikTok scripts with B-roll.",
			},
		});
		for (let i = 0; i < creatorCount; i++) {
			const c = await creatorRepo.create({
				workspaceId,
				projectId,
				createdBy: userId,
				input: { platform: "tiktok", profileUrl: `u${i}`, username: `c${i}`, niche: "fitness" },
			});
			configRepo.joinRows.push({ configId: config.id, creatorId: c.id });
		}
		configRepo.creatorStore = creatorRepo.creators;
		const run = await pipelineRepo.createRun({
			workspaceId,
			projectId,
			configId: config.id,
			userId,
			videosPerCreator: 2,
			lookbackPool: 20,
			timeframeDays: 30,
		});
		return { runId: run.id, configId: config.id };
	}

	it("happy path — 2 creators × 2 videos = 4 completed analyses + scripts", async () => {
		const { runId } = await seedConfigAndRun(2);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.completedAt).toBeDefined();
		expect(run?.videos.filter((v) => v.analysisStatus === "completed")).toHaveLength(4);
		expect(run?.scripts).toHaveLength(3);
		expect(analyzer.analyzeCalls).toHaveLength(4);
		expect(analyzer.generateCalls).toHaveLength(1);
		expect(aiLogCalls.filter((c) => c.generator === "competitor_video_analysis")).toHaveLength(4);
		expect(aiLogCalls.filter((c) => c.generator === "competitor_script_generation")).toHaveLength(1);
		expect(notifications.some((n) => n.event.type === "competitor_pipeline_completed")).toBe(true);
	});

	it("fails fast when no Apify key", async () => {
		apifyKeys.clear();
		const { runId } = await seedConfigAndRun(1);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.errorMessage).toContain("Apify");
	});

	it("one creator's Apify fails — partial success with the other creator's videos", async () => {
		const { runId } = await seedConfigAndRun(2);

		// Override: first creator succeeds, second fails.
		let call = 0;
		(apify as any).getRunStatus = async () => {
			call++;
			if (call === 2 /* second creator's status call */) return { status: "FAILED" };
			return { status: "SUCCEEDED", finishedAt: new Date().toISOString() };
		};
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.filter((v) => v.analysisStatus === "completed").length).toBeGreaterThan(0);
	});

	it("ALL creators fail Apify — run fails", async () => {
		(apify as any).getRunStatus = async () => ({ status: "FAILED" });
		const { runId } = await seedConfigAndRun(2);
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
	});

	it("one video analysis fails — that video marked failed, pipeline continues", async () => {
		const { runId } = await seedConfigAndRun(1);
		analyzer.analyzeFail = "once"; // first video fails, rest succeed
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.filter((v) => v.analysisStatus === "failed")).toHaveLength(1);
		expect(run?.videos.filter((v) => v.analysisStatus === "completed")).toHaveLength(1);
		expect(run?.scripts.length).toBeGreaterThan(0);
	});

	it("video download exceeds cap — that video skipped, pipeline continues", async () => {
		const { runId } = await seedConfigAndRun(1);
		fetcher.overLimit = true;
		// Only first video over-limit; others ok.
		let n = 0;
		fetcher.fetcher = async (url: string) => {
			fetcher.calls.push(url);
			n++;
			if (n === 1) throw new Error("video exceeds 50 MB cap");
			return { bytes: fetcher.bytes, mimeType: "video/mp4" };
		};
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("completed");
		expect(run?.videos.some((v) => v.analysisStatus === "failed")).toBe(true);
	});

	it("cancellation between stages — bails with 'Cancelled by user'", async () => {
		const { runId } = await seedConfigAndRun(2);
		// Before job runs, flip status.
		await pipelineRepo.updateRun(runId, { status: "cancelling" });
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.errorMessage).toContain("Cancelled");
	});

	it("script generation fails — run fails, video analyses survive", async () => {
		const { runId } = await seedConfigAndRun(1);
		analyzer.scriptsFail = true;
		const job = buildJob();

		await job.handle({ runId });

		const run = await pipelineRepo.findRunById(runId);
		expect(run?.status).toBe("failed");
		expect(run?.videos.filter((v) => v.analysisStatus === "completed").length).toBeGreaterThan(0);
		expect(run?.scripts).toHaveLength(0);
	});
});
