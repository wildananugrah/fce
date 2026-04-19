import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PgBoss } from "pg-boss";
import { BrandScrapingJob } from "./jobs/brand-scraping.job";
import { CampaignGenerationJob } from "./jobs/campaign-generation.job";
import { CampaignPdfGenerationJob } from "./jobs/campaign-pdf-generation.job";
import { ContentGenerationJob } from "./jobs/content-generation.job";
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
import { ApifyProvider } from "./providers/apify.provider";
import { NoopEmailProvider } from "./providers/noop-email.provider";
import { ResendEmailProvider } from "./providers/resend-email.provider";
import { GeminiImageProvider } from "./providers/gemini-image.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { MinioStorageProvider } from "./providers/minio.provider";
import { WinstonLogger } from "./providers/winston-logger.provider";
import { BrandRepository } from "./repositories/brand.repository";
import { CampaignRevisionRepository } from "./repositories/campaign-revision.repository";
import { ChatMessageRepository } from "./repositories/chat-message.repository";
import { CampaignRepository } from "./repositories/campaign.repository";
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
import { createProjectRoutes } from "./routes/project.route";
import { createProductRoutes } from "./routes/product.route";
import { createRecommendationRoutes } from "./routes/recommendation.route";
import { createResearchRoutes } from "./routes/research.route";
import { createUrlInspirationRoutes } from "./routes/url-inspiration.route";
import { createSkillRoutes, createWorkspaceSkillRoutes } from "./routes/skill.route";
import { createWorkspaceAiSettingsRoutes } from "./routes/workspace-ai-settings.route";
import { createSSERoutes } from "./routes/sse.route";
import { createTaxonomyRoutes } from "./routes/taxonomy.route";
import { createTopicRoutes } from "./routes/topic.route";
import { createUploadRoutes } from "./routes/upload.route";
import {
	createAuthenticatedInvitationRoutes,
	createMeInvitationRoutes,
	createPublicInvitationRoutes,
} from "./routes/invitation.route";
import { createWorkspaceRoutes } from "./routes/workspace.route";
import { AdminService } from "./services/admin.service";
import { AiProviderFactory } from "./services/ai-provider-factory.service";
import { AuthService } from "./services/auth.service";
import { ChatService } from "./services/chat.service";
import { BrandService } from "./services/brand.service";
import { CampaignService } from "./services/campaign.service";
import { DashboardService } from "./services/dashboard.service";
import { DocumentService } from "./services/document.service";
import { GenerationService } from "./services/generation.service";
import { LibraryService } from "./services/library.service";
import { NotificationService } from "./services/notification.service";
import { ProductService } from "./services/product.service";
import { RecommendationService } from "./services/recommendation.service";
import { ResearchService } from "./services/research.service";
import { SceneImageService } from "./services/scene-image.service";
import { UrlInspirationService } from "./services/url-inspiration.service";
import { TaxonomyService } from "./services/taxonomy.service";
import { TopicService } from "./services/topic.service";
import { WorkspaceService } from "./services/workspace.service";
import { env } from "./utils/env";

// AI provider resolution now lives in AiProviderFactory — see below. Env vars
// act as the fallback when a workspace hasn't configured its own keys.

// ─── Main Async Setup ────────────────────────────────────────────
async function main() {
	const adapter = new PrismaPg({ connectionString: env.databaseUrl });
	const prisma = new PrismaClient({ adapter });
	const logger = new WinstonLogger(env.serviceName, env.lokiUrl || undefined);

	// Initialize PgBoss
	const boss = new PgBoss({ connectionString: env.databaseUrl });
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
	const emailProvider = env.resendApiKey
		? new ResendEmailProvider(env.resendApiKey, env.emailFrom)
		: new NoopEmailProvider(logger);
	const workspaceService = new WorkspaceService(
		workspaceRepository,
		emailProvider,
		userRepository,
		{ appUrl: env.appUrl, tokenExpiry: env.invitationTokenExpiry },
	);
	const authService = new AuthService(
		userRepository,
		{
			jwtSecret: env.jwtSecret,
			jwtRefreshSecret: env.jwtRefreshSecret,
			jwtExpiry: env.jwtExpiry,
			jwtRefreshExpiry: env.jwtRefreshExpiry,
		},
		workspaceService,
	);
	const brandService = new BrandService(brandRepository);
	const productService = new ProductService(productRepository);
	const taxonomyService = new TaxonomyService(taxonomyRepository);
	const generationService = new GenerationService(generationRepository, boss);
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
	const topicService = new TopicService(topicRepository, boss);
	const dashboardService = new DashboardService(prisma);
	const notificationService = new NotificationService();
	const documentService = new DocumentService(
		documentRepository,
		storageProvider,
		boss,
		env.minioBucket,
	);
	const adminService = new AdminService(prisma);
	const researchService = new ResearchService(researchRepository, apifyProvider, boss, logger);

	const chatService = new ChatService(
		prisma,
		chatMessageRepository,
		campaignRevisionRepository,
		aiProviderFactory,
		storageProvider,
		{ historyWindow: env.chatHistoryWindow, bucket: env.minioBucket },
	);

	// URL inspiration pipeline — cache + Apify + per-workspace summarizer
	const urlScrapeCacheRepository = new UrlScrapeCacheRepository(prisma);
	const urlInspirationService = new UrlInspirationService(
		prisma,
		apifyProvider,
		researchService,
		aiProviderFactory,
		urlScrapeCacheRepository,
		logger,
	);

	// ─── Job Handlers ────────────────────────────────────────────────
	const contentGenerationJob = new ContentGenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		outputSectionRepository,
		urlInspirationService,
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
	);
	const topicRegenerationJob = new TopicRegenerationJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
	);
	const brandScrapingJob = new BrandScrapingJob(
		prisma,
		aiProviderFactory,
		notificationService,
		logger,
		apifyProvider,
	);
	const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger);
	const linkScrapingJob = new LinkScrapingJob(documentRepository, logger);
	const recommendationRecomputeJob = new RecommendationRecomputeJob(
		prisma,
		recommendationRepository,
		logger,
	);
	const researchRunJob = new ResearchRunJob(prisma, apifyProvider, notificationService, logger);

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

	// ─── Register PgBoss Workers ─────────────────────────────────────
	await boss.work("content-generation", async (jobs) => {
		for (const job of jobs) await contentGenerationJob.handle(job.data as any);
	});
	await boss.work("campaign-generation", async (jobs) => {
		for (const job of jobs) await campaignGenerationJob.handle(job.data as any);
	});
	await boss.work("campaign-pdf-generation", async (jobs) => {
		for (const job of jobs) await campaignPdfGenerationJob.handle(job.data as any);
	});
	await boss.work("topic-generation", async (jobs) => {
		for (const job of jobs) await topicGenerationJob.handle(job.data as any);
	});
	await boss.work("topic-regeneration", async (jobs) => {
		for (const job of jobs) await topicRegenerationJob.handle(job.data as any);
	});
	await boss.work("brand-scraping", async (jobs) => {
		for (const job of jobs) await brandScrapingJob.handle(job.data as any);
	});
	await boss.work("document-extraction", async (jobs) => {
		for (const job of jobs) await documentExtractionJob.handle(job.data as any);
	});
	await boss.work("link-scraping", async (jobs) => {
		for (const job of jobs) await linkScrapingJob.handle(job.data as any);
	});
	await boss.work("recommendation-recompute", async (jobs) => {
		for (const job of jobs) await recommendationRecomputeJob.handle(job.data as any);
	});
	await boss.work("research-run", async (jobs) => {
		for (const job of jobs) await researchRunJob.handle(job.data as any);
	});

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

	// Workspace routes (auth protected)
	app.route("/api/workspaces", createWorkspaceRoutes(workspaceService));

	// Taxonomy routes (auth protected, no workspace scoping)
	app.route("/api/taxonomy", createTaxonomyRoutes(taxonomyService));

	// Skills routes (auth protected, no workspace scoping)
	app.route("/api/skills", createSkillRoutes(prisma));

	// Workspace-scoped routes (auth + workspace middleware)
	const workspaceScoped = new Hono();
	workspaceScoped.use("*", wsMiddleware);
	workspaceScoped.route("/brands", createBrandRoutes(brandService, boss, aiProviderFactory));
	workspaceScoped.route(
		"/products",
		createProductRoutes(productService, aiProviderFactory, storageProvider, env.minioBucket, prisma),
	);
	workspaceScoped.route("/generations", createGenerationRoutes(generationService));
	workspaceScoped.route("/library", createLibraryRoutes(libraryService, sceneImageService));
	workspaceScoped.route(
		"/campaigns",
		createCampaignRoutes(campaignService, storageProvider, env.minioBucket),
	);
	workspaceScoped.route("/campaigns", createCampaignChatRoutes(chatService));
	workspaceScoped.route("/topics", createTopicRoutes(topicService));
	workspaceScoped.route("/dashboard", createDashboardRoutes(dashboardService));
	workspaceScoped.route("/documents", createDocumentRoutes(documentService));
	workspaceScoped.route("/recommendations", createRecommendationRoutes(recommendationService));
	workspaceScoped.route("/skills", createWorkspaceSkillRoutes(prisma));
	workspaceScoped.route("/projects", createProjectRoutes(prisma));
	workspaceScoped.route(
		"/ai-settings",
		createWorkspaceAiSettingsRoutes(workspaceSettingRepository, aiProviderFactory),
	);
	workspaceScoped.route("/ai-logs", createAiLogRoutes(prisma));
	workspaceScoped.route("/research", createResearchRoutes(researchService));
	workspaceScoped.route("/url-inspiration", createUrlInspirationRoutes(urlInspirationService));
	workspaceScoped.route("/reference-images", createUploadRoutes(storageProvider, env.minioBucket));
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
