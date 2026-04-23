import type { PipelineContent } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IVideoAnalyzer } from "../interfaces/providers/video-analyzer.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { TikTokParser } from "../providers/apify-parsers/tiktok.parser";
import {
	PIPELINE_INPUT_LIMITS,
	type VideoAnalysisResult,
} from "../types/competitor-analyzer.types";

interface CompetitorPipelineJobData {
	runId: string;
}

// Fetches video bytes by URL. Injected so tests can stub without network.
export type VideoFetcher = (url: string) => Promise<{ bytes: Uint8Array; mimeType: string }>;

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

// Callback invoked for AI activity logging. Signature matches `logAiActivity`
// from `backend/src/utils/ai-activity-logger.ts` but narrowed — the job receives
// a wrapping closure from the composition root.
// Return type is `Promise<unknown>` so test mocks using Array.push (→ number) are valid.
type AiLogger = (args: {
	workspaceId: string;
	userId: string;
	generator: "competitor_video_analysis" | "competitor_script_generation";
	systemPrompt: string;
	userPrompt: string;
	runId: string;
	videoId?: string;
	inputTokens?: number;
	outputTokens?: number;
	durationMs: number;
	status: "success" | "error";
	errorMessage?: string;
	responseJson?: any;
}) => Promise<unknown>;

const APIFY_TIKTOK_ACTOR = "clockworks/free-tiktok-scraper";
const APIFY_POLL_TIMEOUT_MS = 2 * 60 * 1000;
const APIFY_POLL_MAX_DELAY_MS = 15_000;
const VIDEO_DOWNLOAD_TIMEOUT_MS = 60_000;
const VIDEO_SIZE_CAP_BYTES = 50 * 1024 * 1024;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

interface PipelineJobDeps {
	now: () => Date;
}

/** Pg-boss-invoked orchestrator. See design doc section 3 for stage semantics. */
export class CompetitorPipelineJob {
	private readonly now: () => Date;

	constructor(
		private pipelineRepository: ICompetitorPipelineRepository,
		private configRepository: IAnalysisConfigRepository,
		private creatorRepository: ICreatorRepository,
		private apifyProvider: IApifyProvider,
		private videoAnalyzer: IVideoAnalyzer,
		private videoFetcher: VideoFetcher,
		private apifyKeyLookup: ApifyKeyLookup,
		private notificationService: INotificationService,
		private aiLogger: AiLogger,
		private logger: ILogger,
		deps?: PipelineJobDeps,
	) {
		this.now = deps?.now ?? (() => new Date());
	}

	async handle(data: CompetitorPipelineJobData): Promise<void> {
		const { runId } = data;
		const startTs = Date.now();

		const run = await this.pipelineRepository.findRunById(runId);
		if (!run) {
			this.logger.error("competitor_pipeline_failed", {
				event: "cp_failed",
				runId,
				stage: "load",
				error: "Run not found",
			});
			return;
		}

		// ─── Stage 1: Guard & Load ─────────────────────────────────
		const configWithCreators = await this.configRepository.findById(run.configId ?? "");
		if (!configWithCreators) {
			await this.failRun(run, "Config not found (may have been deleted)", "load");
			return;
		}
		const creators = configWithCreators.creators.filter((c) => c.archivedAt === null);
		if (creators.length === 0) {
			await this.failRun(run, "Config has no active creators", "load");
			return;
		}

		const apifyKey = await this.apifyKeyLookup(run.workspaceId);
		if (!apifyKey) {
			await this.failRun(run, "Apify API key not configured. Set it in workspace settings.", "load");
			return;
		}

		// Check for cancellation before any state transitions.
		if (run.status === "cancelling") {
			await this.cancelRun(run);
			return;
		}

		// Defensive re-validation (service already checked on create).
		this.validateInputRanges(run);

		await this.pipelineRepository.updateRun(runId, {
			status: "scraping",
			stage: "starting",
			startedAt: this.now(),
		});

		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_stage_changed",
			data: { runId, status: "scraping", stage: "starting" },
		});

		this.logger.info("competitor_pipeline_started", {
			event: "cp_started",
			runId,
			projectId: run.projectId,
			configId: run.configId,
			creatorCount: creators.length,
		});

		if (await this.isCancelling(runId)) {
			await this.cancelRun(run);
			return;
		}

		// ─── Stage 2: Scrape ───────────────────────────────────────
		const allInsertedVideoIds: string[] = [];
		let creatorsScrapedCount = 0;
		for (let idx = 0; idx < creators.length; idx++) {
			const creator = creators[idx];
			const stage = `scraping_creator_${idx + 1}_of_${creators.length}`;
			await this.pipelineRepository.updateRun(runId, { stage });
			this.notificationService.notify(run.userId, {
				type: "competitor_pipeline_stage_changed",
				data: { runId, status: "scraping", stage },
			});

			const scrapeStart = Date.now();
			try {
				const { runId: apifyRunId } = await this.apifyProvider.runActor(
					APIFY_TIKTOK_ACTOR,
					{
						profiles: [creator.username],
						resultsPerPage: run.lookbackPool,
						proxyCountryCode: "US",
					},
					apifyKey,
				);

				let delay = 1000;
				const pollStart = Date.now();
				let succeeded = false;
				while (Date.now() - pollStart < APIFY_POLL_TIMEOUT_MS) {
					await sleep(delay);
					const status = await this.apifyProvider.getRunStatus(apifyRunId, apifyKey);
					if (status.status === "SUCCEEDED") {
						succeeded = true;
						break;
					}
					if (status.status === "FAILED" || status.status === "ABORTED" || status.status === "TIMED-OUT") {
						throw new Error(`Apify actor ${status.status}`);
					}
					delay = Math.min(delay * 2, APIFY_POLL_MAX_DELAY_MS);
				}
				if (!succeeded) throw new Error("Apify scrape timed out");

				const rawItems = await this.apifyProvider.getRunResults(apifyRunId, apifyKey);
				const parser = new TikTokParser();
				const parsed = parser.parse(rawItems);

				// Filter by timeframe and take top N by view count.
				const nowMs = this.now().getTime();
				const cutoff = nowMs - run.timeframeDays * 24 * 60 * 60 * 1000;
				const recentRaw = rawItems.filter((r: any) => {
					const ts = r.createTime ? r.createTime * 1000 : 0;
					return ts >= cutoff;
				});
				// Sort by playCount desc and take top videosPerCreator.
				recentRaw.sort((a: any, b: any) => (b.playCount ?? 0) - (a.playCount ?? 0));
				const top = recentRaw.slice(0, run.videosPerCreator);

				if (top.length === 0) {
					this.logger.info("competitor_pipeline_scrape_done", {
						event: "cp_scrape",
						runId,
						creatorId: creator.id,
						videosFound: 0,
						durationMs: Date.now() - scrapeStart,
					});
					creatorsScrapedCount++;
					continue;
				}

				const contentRows = top.map((r: any) => ({
					runId,
					creatorId: creator.id,
					platform: "tiktok",
					platformPostId: String(r.id ?? r.webVideoUrl),
					contentType: "video",
					contentUrl: r.videoMeta?.downloadAddr ?? r.webVideoUrl,
					thumbnailUrl: r.covers?.default ?? null,
					caption: r.text ?? null,
					viewCount: r.playCount ?? null,
					likeCount: r.diggCount ?? null,
					shareCount: r.shareCount ?? null,
					commentCount: r.commentCount ?? null,
					hashtags: (r.hashtags ?? []).map((h: any) => h.name ?? h),
					postedAt: r.createTime ? new Date(r.createTime * 1000) : null,
					platformMetadata: {
						musicName: r.musicMeta?.musicName,
						webVideoUrl: r.webVideoUrl,
					},
				}));
				const inserted = await this.pipelineRepository.createContent(contentRows);
				for (const v of inserted) {
					if (!allInsertedVideoIds.includes(v.id)) allInsertedVideoIds.push(v.id);
				}
				creatorsScrapedCount++;
				this.logger.info("competitor_pipeline_scrape_done", {
					event: "cp_scrape",
					runId,
					creatorId: creator.id,
					videosFound: top.length,
					durationMs: Date.now() - scrapeStart,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				this.logger.warn("competitor_pipeline_scrape_failed", {
					event: "cp_scrape_fail",
					runId,
					creatorId: creator.id,
					reason: msg,
				});
				// Continue to next creator.
			}

			if (await this.isCancelling(runId)) {
				await this.cancelRun(run);
				return;
			}
		}

		if (allInsertedVideoIds.length === 0) {
			await this.failRun(run, "No videos retrieved from any creator", "scrape");
			return;
		}

		// ─── Stage 3: Video Analysis ────────────────────────────────
		await this.pipelineRepository.updateRun(runId, { status: "analyzing", stage: "preparing" });

		const videos = await this.pipelineRepository.findContentByRun(runId);
		const videoList = videos.filter((v) => v.contentType === "video" && v.analysisStatus === "pending");

		for (let idx = 0; idx < videoList.length; idx++) {
			const video = videoList[idx];
			const stage = `analyzing_video_${idx + 1}_of_${videoList.length}`;
			await this.pipelineRepository.updateRun(runId, { stage });
			this.notificationService.notify(run.userId, {
				type: "competitor_pipeline_stage_changed",
				data: { runId, status: "analyzing", stage },
			});

			await this.pipelineRepository.updateContent(video.id, { analysisStatus: "running" });
			const vStart = Date.now();
			try {
				const { bytes, mimeType } = await this.downloadVideoBytes(video.contentUrl);
				if (bytes.byteLength > VIDEO_SIZE_CAP_BYTES) {
					throw new Error(`Video exceeds ${VIDEO_SIZE_CAP_BYTES} byte cap`);
				}

				const { analysis, usage, systemPrompt, userPrompt } = await this.videoAnalyzer.analyzeVideo(
					{
						bytes,
						mimeType,
						instructions: configWithCreators.analysisInstructions,
					},
				);

				await this.pipelineRepository.updateContent(video.id, {
					analysisStatus: "completed",
					analysisJson: analysis as any,
					analysisError: null,
				});
				await this.aiLogger({
					workspaceId: run.workspaceId,
					userId: run.userId,
					generator: "competitor_video_analysis",
					systemPrompt,
					userPrompt: `runId=${runId} videoId=${video.id}\n${userPrompt}`,
					runId,
					videoId: video.id,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
					durationMs: Date.now() - vStart,
					status: "success",
					responseJson: analysis,
				});
				this.logger.info("competitor_pipeline_video_done", {
					event: "cp_video",
					runId,
					videoId: video.id,
					durationMs: Date.now() - vStart,
					inputTokens: usage.inputTokens,
					outputTokens: usage.outputTokens,
				});
				this.notificationService.notify(run.userId, {
					type: "competitor_pipeline_video_analyzed",
					data: { runId, videoId: video.id, status: "completed" },
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				await this.pipelineRepository.updateContent(video.id, {
					analysisStatus: "failed",
					analysisError: msg,
				});
				await this.aiLogger({
					workspaceId: run.workspaceId,
					userId: run.userId,
					generator: "competitor_video_analysis",
					systemPrompt: "(failed before response)",
					userPrompt: `runId=${runId} videoId=${video.id}`,
					runId,
					videoId: video.id,
					durationMs: Date.now() - vStart,
					status: "error",
					errorMessage: msg,
				});
				this.logger.warn("competitor_pipeline_video_failed", {
					event: "cp_video_fail",
					runId,
					videoId: video.id,
					reason: msg,
				});
				this.notificationService.notify(run.userId, {
					type: "competitor_pipeline_video_analyzed",
					data: { runId, videoId: video.id, status: "failed" },
				});
			}

			if (await this.isCancelling(runId)) {
				await this.cancelRun(run);
				return;
			}
		}

		// ─── Stage 4: Script Generation ─────────────────────────────
		await this.pipelineRepository.updateRun(runId, { status: "generating", stage: "generating_scripts" });
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_stage_changed",
			data: { runId, status: "generating", stage: "generating_scripts" },
		});

		const finalVideos = await this.pipelineRepository.findContentByRun(runId);
		const completedVideos = finalVideos.filter((v) => v.analysisStatus === "completed");
		if (completedVideos.length === 0) {
			await this.failRun(run, "No videos were analyzed successfully", "analyze");
			return;
		}

		const scriptStart = Date.now();
		try {
			const { scripts, usage, systemPrompt, userPrompt } = await this.videoAnalyzer.generateScripts({
				brandContext: configWithCreators.brandContext,
				analysisInstructions: configWithCreators.analysisInstructions,
				outputPreferences: configWithCreators.outputPreferences,
				videoAnalyses: completedVideos.map((v) => ({
					caption: v.caption,
					viewCount: v.viewCount,
					analysis: v.analysisJson as unknown as VideoAnalysisResult,
				})),
			});

			await this.pipelineRepository.createScripts(
				runId,
				scripts.map((s, i) => ({
					scriptNumber: s.scriptNumber ?? i + 1,
					sourceVideoId: s.sourceVideoId ?? null,
					title: s.title ?? null,
					hook: s.hook ?? null,
					body: s.body ?? null,
					broll: s.broll ?? null,
					cta: s.cta ?? null,
					rawContent: s as any,
				})),
			);

			await this.aiLogger({
				workspaceId: run.workspaceId,
				userId: run.userId,
				generator: "competitor_script_generation",
				systemPrompt,
				userPrompt: `runId=${runId}\n${userPrompt}`,
				runId,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
				durationMs: Date.now() - scriptStart,
				status: "success",
				responseJson: scripts,
			});

			this.logger.info("competitor_pipeline_scripts_done", {
				event: "cp_scripts",
				runId,
				scriptCount: scripts.length,
				durationMs: Date.now() - scriptStart,
				inputTokens: usage.inputTokens,
				outputTokens: usage.outputTokens,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await this.failRun(run, `Script generation failed: ${msg}`, "generate");
			await this.aiLogger({
				workspaceId: run.workspaceId,
				userId: run.userId,
				generator: "competitor_script_generation",
				systemPrompt: "(failed)",
				userPrompt: `runId=${runId}`,
				runId,
				durationMs: Date.now() - scriptStart,
				status: "error",
				errorMessage: msg,
			});
			return;
		}

		// ─── Stage 5: Complete ──────────────────────────────────────
		await this.pipelineRepository.updateRun(runId, {
			status: "completed",
			stage: null,
			completedAt: this.now(),
		});

		const completedRun = await this.pipelineRepository.findRunById(runId);
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_completed",
			data: {
				runId,
				videoCount: completedRun?.videos.filter((v) => v.analysisStatus === "completed").length ?? 0,
				scriptCount: completedRun?.scripts.length ?? 0,
			},
		});

		this.logger.info("competitor_pipeline_completed", {
			event: "cp_completed",
			runId,
			totalDurationMs: Date.now() - startTs,
			videoCount: completedRun?.videos.length ?? 0,
			scriptCount: completedRun?.scripts.length ?? 0,
		});
	}

	private async isCancelling(runId: string): Promise<boolean> {
		const status = await this.pipelineRepository.getRunStatus(runId);
		return status === "cancelling";
	}

	private async cancelRun(run: { id: string; userId: string }): Promise<void> {
		await this.pipelineRepository.updateRun(run.id, {
			status: "failed",
			errorMessage: "Cancelled by user",
			completedAt: this.now(),
		});
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_failed",
			data: { runId: run.id, errorMessage: "Cancelled by user" },
		});
	}

	private async failRun(
		run: { id: string; userId: string },
		errorMessage: string,
		stage: string,
	): Promise<void> {
		await this.pipelineRepository.updateRun(run.id, {
			status: "failed",
			errorMessage,
			completedAt: this.now(),
		});
		this.notificationService.notify(run.userId, {
			type: "competitor_pipeline_failed",
			data: { runId: run.id, errorMessage },
		});
		this.logger.error("competitor_pipeline_failed", {
			event: "cp_failed",
			runId: run.id,
			stage,
			error: errorMessage,
		});
	}

	private validateInputRanges(run: { videosPerCreator: number; lookbackPool: number; timeframeDays: number }): void {
		const {
			videosPerCreatorMin,
			videosPerCreatorMax,
			lookbackPoolMin,
			lookbackPoolMax,
			timeframeDaysMin,
			timeframeDaysMax,
		} = PIPELINE_INPUT_LIMITS;
		if (run.videosPerCreator < videosPerCreatorMin || run.videosPerCreator > videosPerCreatorMax)
			throw new Error("videosPerCreator out of range");
		if (run.lookbackPool < lookbackPoolMin || run.lookbackPool > lookbackPoolMax)
			throw new Error("lookbackPool out of range");
		if (run.timeframeDays < timeframeDaysMin || run.timeframeDays > timeframeDaysMax)
			throw new Error("timeframeDays out of range");
	}

	private async downloadVideoBytes(url: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
		const timeout = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error("video download timed out")), VIDEO_DOWNLOAD_TIMEOUT_MS),
		);
		return Promise.race([this.videoFetcher(url), timeout]);
	}
}
