// Force UTC before any imports. Prisma maps `DateTime` to Postgres
// `timestamp(3) without time zone`, which stores UTC values but omits the tz
// marker. Node's pg driver then parses those bare strings as LOCAL time on the
// host — on a Mac in WIB that shifts every timestamp by −7h. Pinning the
// process to UTC makes the round-trip lossless regardless of where the server
// runs. Browsers still localize for display via Date#toLocale*.
if (!process.env.TZ) process.env.TZ = "UTC";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import { loadSkillRegistry } from "./config/skills/loader";
import type { SkillRegistry } from "./config/skills/loader";
import { ArchiveSweepJob } from "./jobs/archive-sweep.job";
import { BrandScrapingJob } from "./jobs/brand-scraping.job";
import { CampaignGenerationJob } from "./jobs/campaign-generation.job";
import { CampaignPdfGenerationJob } from "./jobs/campaign-pdf-generation.job";
import { CompetitorPipelineJob } from "./jobs/competitor-pipeline.job";
import { ContentGenerationJob } from "./jobs/content-generation.job";
import { CreatorEnrichmentJob } from "./jobs/creator-enrichment.job";
import { DocumentExtractionJob } from "./jobs/document-extraction.job";
import { LinkScrapingJob } from "./jobs/link-scraping.job";
import { RecommendationRecomputeJob } from "./jobs/recommendation-recompute.job";
import { ResearchRunJob } from "./jobs/research-run.job";
import { TopicGenerationJob } from "./jobs/topic-generation.job";
import { TopicRegenerationJob } from "./jobs/topic-regeneration.job";
import { createAdminMiddleware } from "./middlewares/admin.middleware";
import { createAuthMiddleware } from "./middlewares/auth.middleware";
import { createErrorHandlerMiddleware } from "./middlewares/error-handler.middleware";
import { createRequestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import { createWorkspaceMiddleware } from "./middlewares/workspace.middleware";
import { AnthropicChatProvider } from "./providers/anthropic-chat.provider";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiChatProvider } from "./providers/gemini-chat.provider";
import { GeminiVideoAnalyzerProvider } from "./providers/gemini-video.provider";
import { ApifyProvider } from "./providers/apify.provider";
import { NoopEmailProvider } from "./providers/noop-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";
import { SmtpEmailProvider } from "./providers/smtp-email.provider";
import type { IEmailProvider } from "./interfaces/providers/email.provider.interface";
import { GeminiImageProvider } from "./providers/gemini-image.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { MinioStorageProvider } from "./providers/minio.provider";
import { WinstonLogger } from "./providers/winston-logger.provider";
import { AnalysisConfigRepository } from "./repositories/analysis-config.repository";
import { BrandRepository } from "./repositories/brand.repository";
import { CampaignRevisionRepository } from "./repositories/campaign-revision.repository";
import { ChatMessageRepository } from "./repositories/chat-message.repository";
import { CampaignRepository } from "./repositories/campaign.repository";
import { CompetitorPipelineRepository } from "./repositories/competitor-pipeline.repository";
import { CreatorRepository } from "./repositories/creator.repository";
import { DocumentRepository } from "./repositories/document.repository";
import { GenerationRepository } from "./repositories/generation.repository";
import { OutputSectionRepository } from "./repositories/output-section.repository";
import { ProductRepository } from "./repositories/product.repository";
import { RecommendationRepository } from "./repositories/recommendation.repository";
import { ResearchRepository } from "./repositories/research.repository";
import { UrlScrapeCacheRepository } from "./repositories/url-scrape-cache.repository";
import { TaxonomyRepository } from "./repositories/taxonomy.repository";
import { TopicRepository } from "./repositories/topic.repository";
import { UserRepository } from "./repositories/user.repository";
import { WorkspaceRepository } from "./repositories/workspace.repository";
import { WorkspaceSettingRepository } from "./repositories/workspace-setting.repository";
import { createAdminRoutes } from "./routes/admin.route";
import { createAiLogRoutes } from "./routes/ai-log.route";
import { createAuthRoutes } from "./routes/auth.route";
import { createBrandRoutes } from "./routes/brand.route";
import { createCampaignChatRoutes } from "./routes/campaign-chat.route";
import { createCampaignRoutes } from "./routes/campaign.route";
import { createDashboardRoutes } from "./routes/dashboard.route";
import { createDocumentRoutes } from "./routes/document.route";
import { createGenerationRoutes } from "./routes/generation.route";
import { createLibraryRoutes } from "./routes/library.route";
import { createOnboardingProgressRoutes } from "./routes/onboarding-progress.route";
import { createOnboardingRoutes } from "./routes/onboarding.route";
import { createProjectRoutes } from "./routes/project.route";
import { createProductRoutes } from "./routes/product.route";
import { createRecommendationRoutes } from "./routes/recommendation.route";
import { createCompetitorAnalyzerRoutes } from "./routes/competitor-analyzer.route";
import { createResearchRoutes } from "./routes/research.route";
import { createUrlInspirationRoutes } from "./routes/url-inspiration.route";
import { createSkillListRoutes } from "./routes/skill-list.route";
import { createWorkspaceAiSettingsRoutes } from "./routes/workspace-ai-settings.route";
import { createSSERoutes } from "./routes/sse.route";
import { createTaxonomyRoutes } from "./routes/taxonomy.route";
import { createTopicRoutes } from "./routes/topic.route";
import { createTrashRoutes } from "./routes/trash.route";
import { createUploadRoutes } from "./routes/upload.route";
import {
	createAuthenticatedInvitationRoutes,
	createMeInvitationRoutes,
	createPublicInvitationRoutes,
} from "./routes/invitation.route";
import { createWorkspaceRoutes } from "./routes/workspace.route";
import { AdminService } from "./services/admin.service";
import { AiProviderFactory } from "./services/ai-provider-factory.service";
import { AuditService } from "./services/audit.service";
import { AnalysisConfigService } from "./services/analysis-config.service";
import { AuthService } from "./services/auth.service";
import { ChatService } from "./services/chat.service";
import { BrandService } from "./services/brand.service";
import { CampaignService } from "./services/campaign.service";
import { CompetitorPipelineService } from "./services/competitor-pipeline.service";
import { CreatorService } from "./services/creator.service";
import { DashboardService } from "./services/dashboard.service";
import { DocumentService } from "./services/document.service";
import { GenerationService } from "./services/generation.service";
import { LibraryService } from "./services/library.service";
import { NotificationService } from "./services/notification.service";
import { OnboardingService } from "./services/onboarding.service";
import { ProductService } from "./services/product.service";
import { RecommendationService } from "./services/recommendation.service";
import { ResearchService } from "./services/research.service";
import { SceneImageService } from "./services/scene-image.service";
import { UrlInspirationService } from "./services/url-inspiration.service";
import { TaxonomyService } from "./services/taxonomy.service";
import { TopicService } from "./services/topic.service";
import { TrashService } from "./services/trash.service";
import { WorkspaceService } from "./services/workspace.service";
import { logAiActivity } from "./utils/ai-activity-logger";
import { env } from "./utils/env";

// AI provider resolution now lives in AiProviderFactory — see below. Env vars
// act as the fallback when a workspace hasn't configured its own keys.

// ─── Main Async Setup ────────────────────────────────────────────
async function main() {
	// The pg-boss worker concurrency below can run up to ~17 jobs in parallel
	// across all queues, and each job makes multiple Prisma queries. Bump the
	// adapter pool past the default (10) so workers don't starve waiting for a
	// free connection. `max` flows through to node-postgres' Pool.
	const pool = new Pool({ connectionString: env.databaseUrl, max: 25 });
	const adapter = new PrismaPg(pool);
	const prisma = new PrismaClient({ adapter });
	const logger = new WinstonLogger(env.serviceName, env.lokiUrl || undefined);

	const skillRegistry: SkillRegistry = await loadSkillRegistry();
	logger.info(`Loaded ${skillRegistry.size} skills`);

	// Initialize PgBoss
	const boss = new PgBoss({ connectionString: env.databaseUrl });
	// pg-boss surfaces worker and driver failures on an EventEmitter. Without a
	// listener, Node treats them as ERR_UNHANDLED_ERROR and kills the process —
	// we've been burned by this when a Prisma 7 WASM error contained NUL bytes
	// and Postgres rejected the re-serialized JSON during a subsequent poll.
	// Keep the process alive; log and move on.
	boss.on("error", (err) => {
		const message = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;
		logger.error("pg-boss worker error", { error: message, stack });
	});
	await boss.start();

	// ─── Repositories ───────────────────────────────────────────────
	const userRepository = new UserRepository(prisma);
	const workspaceRepository = new WorkspaceRepository(prisma);
	const brandRepository = new BrandRepository(prisma);
	const productRepository = new ProductRepository(prisma);
	const taxonomyRepository = new TaxonomyRepository(prisma);
	const generationRepository = new GenerationRepository(prisma);
	const outputSectionRepository = new OutputSectionRepository(prisma);
	const campaignRepository = new CampaignRepository(prisma);
	const topicRepository = new TopicRepository(prisma);
	const recommendationRepository = new RecommendationRepository(prisma);
	const documentRepository = new DocumentRepository(prisma);
	const researchRepository = new ResearchRepository(prisma);
	const chatMessageRepository = new ChatMessageRepository(prisma);
	const campaignRevisionRepository = new CampaignRevisionRepository(prisma);
	const workspaceSettingRepository = new WorkspaceSettingRepository(prisma);
	const creatorRepository = new CreatorRepository(prisma);
	const analysisConfigRepository = new AnalysisConfigRepository(prisma);
	const competitorPipelineRepository = new CompetitorPipelineRepository(prisma);
	const storageProvider = new MinioStorageProvider(
		env.minioEndpoint,
		env.minioAccessKey,
		env.minioSecretKey,
		env.minioPublicUrl,
	);
	const apifyProvider = new ApifyProvider();

	// Workspace-scoped AI provider resolver + cache. Env values are the
	// fallback; workspaces override them via Workspace Settings → Integrations.
	const aiProviderFactory = new AiProviderFactory(workspaceSettingRepository, {
		aiProvider: env.aiProvider,
		aiContentProvider: env.aiContentProvider,
		aiCampaignProvider: env.aiCampaignProvider,
		aiTopicProvider: env.aiTopicProvider,
		aiBrandScraperProvider: env.aiBrandScraperProvider,
		aiChatProvider: env.aiChatProvider,
		anthropicApiKey: env.anthropicApiKey,
		anthropicModel: env.anthropicModel,
		geminiApiKey: env.geminiApiKey,
		geminiModel: env.geminiModel,
		geminiImageModel: env.geminiImageModel,
	});

	// ─── Services ───────────────────────────────────────────────────
	// EMAIL_PROVIDER picks the transport. Each branch validates its own
	// required env vars and falls back to Noop (logs to stdout, never
	// delivers) if the configuration is incomplete — that way a
	// missing SMTP_PASS in staging doesn't crash boot, it just leaves
	// outgoing mail in a known-degraded state that shows up in logs.
	const emailProvider: IEmailProvider = (() => {
		const kind = env.emailProvider.toLowerCase();
		if (kind === "resend") {
			if (!env.resendApiKey) {
				logger.warn("EMAIL_PROVIDER=resend but RESEND_API_KEY is empty — falling back to noop");
				return new NoopEmailProvider(logger);
			}
			logger.info("Email provider: Resend", { from: env.emailFrom });
			return new ResendEmailProvider(env.resendApiKey, env.emailFrom, logger);
		}
		if (kind === "smtp") {
			if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
				logger.warn("EMAIL_PROVIDER=smtp but SMTP_HOST/SMTP_USER/SMTP_PASS incomplete — falling back to noop");
				return new NoopEmailProvider(logger);
			}
			logger.info("Email provider: SMTP", {
				host: env.smtpHost,
				port: env.smtpPort,
				secure: env.smtpSecure,
				from: env.emailFrom,
			});
			return new SmtpEmailProvider(
				{
					host: env.smtpHost,
					port: env.smtpPort,
					secure: env.smtpSecure,
					user: env.smtpUser,
					pass: env.smtpPass,
				},
				env.emailFrom,
				logger,
			);
		}
		logger.info("Email provider: noop (EMAIL_PROVIDER unset or 'noop')");
		return new NoopEmailProvider(logger);
	})();
	const auditService = new AuditService(prisma, logger);
	const workspaceService = new WorkspaceService(
		workspaceRepository,
		emailProvider,
		userRepository,
		{ appUrl: env.appUrl, tokenExpiry: env.invitationTokenExpiry },
		auditService,
	);
	const authService = new AuthService(
		userRepository,
		{
			jwtSecret: env.jwtSecret,
			jwtRefreshSecret: env.jwtRefreshSecret,
			jwtExpiry: env.jwtExpiry,
			jwtRefreshExpiry: env.jwtRefreshExpiry,
			appUrl: env.appUrl,
			emailVerificationTokenExpiry: env.emailVerificationTokenExpiry,
			userDefaultMaxWorkspaces: env.userDefaultMaxWorkspaces,
			userDefaultMaxProjects: env.userDefaultMaxProjects,
		},
		workspaceService,
		prisma,
		emailProvider,
	);
	const brandService = new BrandService(brandRepository);
	const productService = new ProductService(productRepository);
	const taxonomyService = new TaxonomyService(taxonomyRepository);
	const generationService = new GenerationService(generationRepository, boss, prisma);
	const libraryService = new LibraryService(generationRepository, outputSectionRepository, boss);
	// Scene image generator (Imagen via @google/genai). Always constructed —
	// per-workspace Gemini key lookup happens on each call. Surfaces a clear
	// error if neither workspace nor env has a Gemini key.
	const sceneImageService = new SceneImageService(
		prisma,
		aiProviderFactory,
		storageProvider,
		env.minioBucket,
		logger,
	);
	const recommendationService = new RecommendationService(recommendationRepository);
	const campaignService = new CampaignService(campaignRepository, boss);
	const topicService = new TopicService(topicRepository, boss, prisma);
	const trashService = new TrashService(
		brandRepository,
		productRepository,
		topicRepository,
		generationRepository,
		env.archiveTtlDays,
	);
	const dashboardService = new DashboardService(prisma);
	const notificationService = new NotificationService();
	const documentService = new DocumentService(
		documentRepository,
		storageProvider,
		boss,
		env.minioBucket,
	);
	const adminService = new AdminService(prisma, auditService, {
		userDefaultMaxWorkspaces: env.userDefaultMaxWorkspaces,
		userDefaultMaxProjects: env.userDefaultMaxProjects,
	});
	const researchService = new ResearchService(researchRepository, apifyProvider, boss, logger);
	const onboardingService = new OnboardingService(userRepository, prisma);

	// Shared helper used by competitor analyzer jobs to fetch a workspace's
	// Apify key without coupling to the WorkspaceSetting repo directly.
	const apifyKeyLookup = async (wsId: string): Promise<string | null> => {
		const setting = await prisma.workspaceSetting.findUnique({ where: { workspaceId: wsId } });
		return setting?.apifyApiKey ?? null;
	};

	const creatorService = new CreatorService(creatorRepository, boss, logger);
	const analysisConfigService = new AnalysisConfigService(
		analysisConfigRepository,
		creatorRepository,
		logger,
	);
	const competitorPipelineService = new CompetitorPipelineService(
		competitorPipelineRepository,
		analysisConfigRepository,
		creatorRepository,
		boss,
		apifyKeyLookup,
		logger,
	);

	const chatService = new ChatService(
		prisma,
		chatMessageRepository,
		campaignRevisionRepository,
		aiProviderFactory,
		storageProvider,
		{ historyWindow: env.chatHistoryWindow, bucket: env.minioBucket },
		skillRegistry,
	);

	// URL inspiration pipeline — cache + Apify + per-workspace summarizer
	const urlScrapeCacheRepository = new UrlScrapeCacheRepository(prisma);

	// Pipeline job resolves a fresh Gemini analyzer per run using the
	// per-workspace key via AiProviderFactory. Wrap the class construction in
	// a small closure so the pg-boss worker signature below stays uniform.
	const buildVideoAnalyzer = async (workspaceId: string): Promise<GeminiVideoAnalyzerProvider> => {
		const settings = await aiProviderFactory.getSettings(workspaceId);
		const apiKey = settings.gemini.apiKey ?? env.geminiApiKey;
		const model = settings.gemini.model ?? env.geminiModel ?? "gemini-2.5-flash";
		if (!apiKey) throw new Error("Gemini API key not configured");
		return new GeminiVideoAnalyzerProvider(apiKey, model);
	};

	const videoFetcher = async (url: string): Promise<{ bytes: Uint8Array; mimeType: string }> => {
		// Browser-like headers — TikTok's own CDN blocks bare fetch() and often
		// returns HTML error pages. Harmless on Apify-hosted URLs.
		const resp = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
				Referer: "https://www.tiktok.com/",
			},
			redirect: "follow",
		});
		if (!resp.ok) throw new Error(`Video fetch failed: HTTP ${resp.status}`);
		const mimeType = resp.headers.get("content-type") ?? "video/mp4";
		// Fail fast if the server served an HTML error page disguised as a
		// video URL — better a clear message here than Gemini's opaque
		// "Unsupported MIME type" rejection downstream.
		if (!/^video\//i.test(mimeType) && !/^application\/octet-stream/i.test(mimeType)) {
			throw new Error(
				`Expected video response, got content-type="${mimeType}" (likely a TikTok CDN block or expired URL)`,
			);
		}
		const ab = await resp.arrayBuffer();
		return { bytes: new Uint8Array(ab), mimeType };
	};

	// URL inspiration service — constructed here so it can reference videoFetcher
	// and buildVideoAnalyzer, which are defined above.
	const urlInspirationService = new UrlInspirationService(
		prisma,
		apifyProvider,
		researchService,
		aiProviderFactory,
		urlScrapeCacheRepository,
		logger,
		videoFetcher,
		buildVideoAnalyzer,
		{
			maxMb: env.videoInspirationMaxMb,
			maxDurationSeconds: env.videoInspirationMaxDurationSeconds,
		},
	);

	// ─── Job Handlers ────────────────────────────────────────────────
	const contentGenerationJob = new ContentGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		outputSectionRepository,
		urlInspirationService,
		skillRegistry,
	);
	const campaignGenerationJob = new CampaignGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
	);
	const campaignPdfGenerationJob = new CampaignPdfGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
	);
	const topicGenerationJob = new TopicGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		urlInspirationService,
		skillRegistry,
	);
	const topicRegenerationJob = new TopicRegenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		skillRegistry,
	);
	const brandScrapingJob = new BrandScrapingJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		apifyProvider,
		skillRegistry,
	);
	const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger);
	const linkScrapingJob = new LinkScrapingJob(documentRepository, logger);
	const recommendationRecomputeJob = new RecommendationRecomputeJob(
		prisma,
		recommendationRepository,
		logger,
	);
	const researchRunJob = new ResearchRunJob(prisma, apifyProvider, notificationService, logger);
	const archiveSweepJob = new ArchiveSweepJob(prisma, logger, env.archiveTtlDays);

	const creatorEnrichmentJob = new CreatorEnrichmentJob(
		creatorRepository,
		apifyProvider,
		apifyKeyLookup,
		notificationService,
		logger,
	);

	// The worker loads the run, builds a workspace-scoped analyzer, then
	// hands off to CompetitorPipelineJob. Reason: analyzer needs the
	// workspace-specific Gemini key, which isn't known at composition time.
	const competitorPipelineJob = {
		async handle(data: { runId: string }) {
			const run = await prisma.competitorPipelineRun.findUnique({
				where: { id: data.runId },
				select: { workspaceId: true },
			});
			if (!run) {
				logger.error("competitor_pipeline_failed", { runId: data.runId, error: "Run not found" });
				return;
			}
			let analyzer: GeminiVideoAnalyzerProvider;
			try {
				analyzer = await buildVideoAnalyzer(run.workspaceId);
			} catch (err) {
				await prisma.competitorPipelineRun.update({
					where: { id: data.runId },
					data: {
						status: "failed",
						errorMessage: err instanceof Error ? err.message : "Gemini config error",
						completedAt: new Date(),
					},
				});
				return;
			}
			const job = new CompetitorPipelineJob(
				competitorPipelineRepository,
				analysisConfigRepository,
				creatorRepository,
				apifyProvider,
				analyzer,
				videoFetcher,
				apifyKeyLookup,
				notificationService,
				async (args) =>
					logAiActivity(
						prisma,
						{
							workspaceId: args.workspaceId,
							generator: args.generator,
							provider: "gemini",
							userId: args.userId,
							systemPrompt: args.systemPrompt,
							userPrompt: args.userPrompt,
						},
						{
							inputTokens: args.inputTokens,
							outputTokens: args.outputTokens,
							durationMs: args.durationMs,
							status: args.status,
							errorMessage: args.errorMessage,
							responseJson: args.responseJson,
						},
					),
				logger,
			);
			await job.handle(data);
		},
	};

	// ─── Create PgBoss Queues ───────────────────────────────────────
	await boss.createQueue("content-generation");
	await boss.createQueue("campaign-generation");
	await boss.createQueue("campaign-pdf-generation");
	await boss.createQueue("topic-generation");
	await boss.createQueue("topic-regeneration");
	await boss.createQueue("brand-scraping");
	await boss.createQueue("document-extraction");
	await boss.createQueue("link-scraping");
	await boss.createQueue("recommendation-recompute");
	await boss.createQueue("research-run");
	await boss.createQueue("archive-sweep");
	await boss.createQueue("creator-enrichment");
	await boss.createQueue("competitor-pipeline");

	// ─── Register PgBoss Workers ─────────────────────────────────────
	// Each queue is tuned for its workload:
	//  - localConcurrency: how many jobs this node runs in parallel. AI
	//    queues get 2–3 so multiple users don't queue serially; background
	//    sweepers stay at 1.
	//  - pollingIntervalSeconds: 1s for latency-sensitive queues (user is
	//    staring at a spinner), 2s for I/O-bound ones, and tens of seconds
	//    for low-priority or scheduled queues to cut DB chatter.
	// Worst-case parallel workers total ~22, well under the Prisma adapter
	// pool size we configured above (25).
	await boss.work(
		"content-generation",
		{ localConcurrency: 3, pollingIntervalSeconds: 1 },
		async (jobs) => {
			for (const job of jobs) await contentGenerationJob.handle(job.data as any);
		},
	);
	await boss.work(
		"campaign-generation",
		{ localConcurrency: 2, pollingIntervalSeconds: 1 },
		async (jobs) => {
			for (const job of jobs) await campaignGenerationJob.handle(job.data as any);
		},
	);
	await boss.work(
		"campaign-pdf-generation",
		{ localConcurrency: 1, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await campaignPdfGenerationJob.handle(job.data as any);
		},
	);
	await boss.work(
		"topic-generation",
		{ localConcurrency: 3, pollingIntervalSeconds: 1 },
		async (jobs) => {
			for (const job of jobs) await topicGenerationJob.handle(job.data as any);
		},
	);
	await boss.work(
		"topic-regeneration",
		{ localConcurrency: 2, pollingIntervalSeconds: 1 },
		async (jobs) => {
			for (const job of jobs) await topicRegenerationJob.handle(job.data as any);
		},
	);
	await boss.work(
		"brand-scraping",
		{ localConcurrency: 2, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await brandScrapingJob.handle(job.data as any);
		},
	);
	await boss.work(
		"document-extraction",
		{ localConcurrency: 2, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await documentExtractionJob.handle(job.data as any);
		},
	);
	await boss.work(
		"link-scraping",
		{ localConcurrency: 3, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await linkScrapingJob.handle(job.data as any);
		},
	);
	await boss.work(
		"recommendation-recompute",
		{ localConcurrency: 1, pollingIntervalSeconds: 10 },
		async (jobs) => {
			for (const job of jobs) await recommendationRecomputeJob.handle(job.data as any);
		},
	);
	await boss.work(
		"research-run",
		{ localConcurrency: 2, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await researchRunJob.handle(job.data as any);
		},
	);
	await boss.work(
		"archive-sweep",
		{ localConcurrency: 1, pollingIntervalSeconds: 60 },
		async (jobs) => {
			// Scheduled sweeper — one "tick" per fire; the job ignores its payload.
			for (const _ of jobs) await archiveSweepJob.handle();
		},
	);
	await boss.work(
		"creator-enrichment",
		{ localConcurrency: 3, pollingIntervalSeconds: 2 },
		async (jobs) => {
			for (const job of jobs) await creatorEnrichmentJob.handle(job.data as any);
		},
	);
	await boss.work(
		"competitor-pipeline",
		{ localConcurrency: 1, pollingIntervalSeconds: 5 },
		async (jobs) => {
			for (const job of jobs) await competitorPipelineJob.handle(job.data as any);
		},
	);

	// Run the archive sweeper once an hour. pg-boss dedupes duplicate
	// schedules by (queue, key) so calling this on every boot is safe.
	await boss.schedule("archive-sweep", "0 * * * *");

	// ─── Middleware Instances ────────────────────────────────────────
	const authMiddleware = createAuthMiddleware(env.jwtSecret);
	const wsMiddleware = createWorkspaceMiddleware(workspaceRepository);

	// ─── App ────────────────────────────────────────────────────────
	const app = new Hono();

	// Global error handler (catches errors from sub-apps/routes)
	const knownErrors = [
		"Email already registered",
		"Invalid email or password",
		"User not found",
		"Workspace not found",
		"Slug already taken",
		"Brand not found",
		"A brand with this name is already in this project — possibly in Workspace Settings → Trash. Restore it, permanently delete it from Trash, or pick a different name.",
		"This project already has a brand. Each project can contain only one brand — create a new project to add another.",
		"Product not found",
		"Cannot remove the last admin",
		"Invitation not found",
		"User is already a member of this workspace",
		"Email does not match invitation",
		"Invitation email does not match",
		"Invitation has expired",
		"Invitation is no longer pending",
		"Only admins can resend invitations",
		"Generation request not found",
		"Campaign not found",
		"Topic not found",
		"Document not found",
		"Brief not found",
		"Research run not found",
		"Research result not found",
		"Apify API key not configured. Set it in workspace settings.",
	];
	app.onError((err, c) => {
		const message = err instanceof Error ? err.message : String(err);
		const stack = err instanceof Error ? err.stack : undefined;

		logger.error("Unhandled exception", {
			error: message,
			stack,
			method: c.req.method,
			path: c.req.path,
		});

		if (knownErrors.includes(message)) {
			return c.json({ error: message }, 400);
		}

		return c.json({ error: "Internal server error" }, 500);
	});

	// Global middlewares
	app.use(
		"*",
		cors({
			origin: ["http://localhost:5173", "http://localhost:80", "http://localhost"],
			credentials: true,
		}),
	);
	app.use("*", createErrorHandlerMiddleware(logger));
	app.use("*", createRequestLoggerMiddleware(logger));

	// Protect /me and /profile inside auth routes (must be registered before app.route)
	app.use("/api/auth/me", authMiddleware);
	app.use("/api/auth/profile", authMiddleware);

	// Public routes (no auth needed)
	app.route("/api/auth", createAuthRoutes(authService));

	// SSE route (handles its own auth via query parameter token)
	app.route("/api/sse", createSSERoutes(notificationService, env.jwtSecret));

	// Public invitation info (no auth — token is unguessable)
	app.route("/api/invitations", createPublicInvitationRoutes(workspaceService));

	// Protected routes
	app.use("/api/*", authMiddleware);

	// Admin routes (auth + superadmin)
	const adminMiddleware = createAdminMiddleware(prisma);
	const adminScoped = new Hono();
	adminScoped.use("*", adminMiddleware);
	adminScoped.route("/", createAdminRoutes(adminService));
	app.route("/api/admin", adminScoped);

	app.route("/api/invitations", createAuthenticatedInvitationRoutes(workspaceService));
	app.route("/api/me", createMeInvitationRoutes(workspaceService));
	app.route("/api/users/me/onboarding", createOnboardingRoutes(onboardingService));

	// Workspace routes (auth protected)
	app.route("/api/workspaces", createWorkspaceRoutes(workspaceService));

	// Taxonomy routes (auth protected, no workspace scoping)
	app.route("/api/taxonomy", createTaxonomyRoutes(taxonomyService));

	// Skills routes (auth protected, no workspace scoping)
	app.route("/api/skills", createSkillListRoutes(skillRegistry));

	// Workspace-scoped routes (auth + workspace middleware)
	const workspaceScoped = new Hono();
	workspaceScoped.use("*", wsMiddleware);
	workspaceScoped.route("/brands", createBrandRoutes(brandService, boss, aiProviderFactory));
	workspaceScoped.route(
		"/products",
		createProductRoutes(productService, aiProviderFactory, storageProvider, env.minioBucket, prisma, skillRegistry),
	);
	workspaceScoped.route("/generations", createGenerationRoutes(generationService));
	workspaceScoped.route("/library", createLibraryRoutes(libraryService, prisma, sceneImageService));
	workspaceScoped.route(
		"/campaigns",
		createCampaignRoutes(campaignService, storageProvider, env.minioBucket),
	);
	workspaceScoped.route("/campaigns", createCampaignChatRoutes(chatService));
	workspaceScoped.route("/topics", createTopicRoutes(topicService, prisma));
	workspaceScoped.route("/dashboard", createDashboardRoutes(dashboardService));
	workspaceScoped.route("/documents", createDocumentRoutes(documentService));
	workspaceScoped.route("/recommendations", createRecommendationRoutes(recommendationService));
	workspaceScoped.route("/projects", createProjectRoutes(prisma));
	workspaceScoped.route(
		"/onboarding-progress",
		createOnboardingProgressRoutes(onboardingService),
	);
	workspaceScoped.route(
		"/ai-settings",
		createWorkspaceAiSettingsRoutes(workspaceSettingRepository, aiProviderFactory, auditService),
	);
	workspaceScoped.route("/ai-logs", createAiLogRoutes(prisma));
	workspaceScoped.route("/research", createResearchRoutes(researchService));
	workspaceScoped.route(
		"/projects/:projectId/competitor-analyzer",
		createCompetitorAnalyzerRoutes(
			prisma,
			creatorService,
			analysisConfigService,
			competitorPipelineService,
		),
	);
	workspaceScoped.route("/url-inspiration", createUrlInspirationRoutes(urlInspirationService));
	workspaceScoped.route("/reference-images", createUploadRoutes(storageProvider, env.minioBucket));
	workspaceScoped.route(
		"/trash",
		createTrashRoutes(
			trashService,
			brandService,
			productService,
			topicService,
			libraryService,
			generationService,
		),
	);
	app.route("/api/workspaces/:workspaceId", workspaceScoped);

	// Health check
	app.get("/api/health", (c) => c.json({ status: "ok" }));

	// ─── Storage init ───────────────────────────────────────────────
	const bucketResults = await storageProvider.init(env.minioBucket);
	for (const [bucket, status] of bucketResults) {
		if (status === "created") {
			logger.info(`Storage bucket "${bucket}" created`);
		} else {
			logger.info(`Storage bucket "${bucket}" already exists`);
		}
	}

	// ─── Start ──────────────────────────────────────────────────────
	logger.info(`Starting server on port ${env.port}`);

	Bun.serve({
		port: env.port,
		fetch: app.fetch,
		idleTimeout: 255,
	});
}

main();
