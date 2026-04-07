import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { PgBoss } from "pg-boss";
import { BrandScrapingJob } from "./jobs/brand-scraping.job";
import { CampaignGenerationJob } from "./jobs/campaign-generation.job";
import { ContentGenerationJob } from "./jobs/content-generation.job";
import { DocumentExtractionJob } from "./jobs/document-extraction.job";
import { RecommendationRecomputeJob } from "./jobs/recommendation-recompute.job";
import { TopicGenerationJob } from "./jobs/topic-generation.job";
import { createAuthMiddleware } from "./middlewares/auth.middleware";
import { createErrorHandlerMiddleware } from "./middlewares/error-handler.middleware";
import { createRequestLoggerMiddleware } from "./middlewares/request-logger.middleware";
import { createWorkspaceMiddleware } from "./middlewares/workspace.middleware";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { MinioStorageProvider } from "./providers/minio.provider";
import { WinstonLogger } from "./providers/winston-logger.provider";
import { BrandRepository } from "./repositories/brand.repository";
import { CampaignRepository } from "./repositories/campaign.repository";
import { DocumentRepository } from "./repositories/document.repository";
import { GenerationRepository } from "./repositories/generation.repository";
import { RecommendationRepository } from "./repositories/recommendation.repository";
import { OutputSectionRepository } from "./repositories/output-section.repository";
import { ProductRepository } from "./repositories/product.repository";
import { TaxonomyRepository } from "./repositories/taxonomy.repository";
import { TopicRepository } from "./repositories/topic.repository";
import { UserRepository } from "./repositories/user.repository";
import { WorkspaceRepository } from "./repositories/workspace.repository";
import { createAuthRoutes } from "./routes/auth.route";
import { createBrandRoutes } from "./routes/brand.route";
import { createCampaignRoutes } from "./routes/campaign.route";
import { createDocumentRoutes } from "./routes/document.route";
import { createGenerationRoutes } from "./routes/generation.route";
import { createLibraryRoutes } from "./routes/library.route";
import { createProductRoutes } from "./routes/product.route";
import { createRecommendationRoutes } from "./routes/recommendation.route";
import { createSSERoutes } from "./routes/sse.route";
import { createTaxonomyRoutes } from "./routes/taxonomy.route";
import { createDashboardRoutes } from "./routes/dashboard.route";
import { createTopicRoutes } from "./routes/topic.route";
import { createWorkspaceRoutes } from "./routes/workspace.route";
import { AuthService } from "./services/auth.service";
import { DashboardService } from "./services/dashboard.service";
import { BrandService } from "./services/brand.service";
import { DocumentService } from "./services/document.service";
import { CampaignService } from "./services/campaign.service";
import { GenerationService } from "./services/generation.service";
import { LibraryService } from "./services/library.service";
import { NotificationService } from "./services/notification.service";
import { ProductService } from "./services/product.service";
import { RecommendationService } from "./services/recommendation.service";
import { TaxonomyService } from "./services/taxonomy.service";
import { TopicService } from "./services/topic.service";
import { WorkspaceService } from "./services/workspace.service";
import { env } from "./utils/env";

// ─── AI Provider Resolvers ───────────────────────────────────────
function resolveContentGenerator() {
	const name = env.aiContentProvider || env.aiProvider;
	if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
	if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
	throw new Error(`Unknown AI provider: ${name}`);
}

function resolveCampaignGenerator() {
	const name = env.aiCampaignProvider || env.aiProvider;
	if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
	if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
	throw new Error(`Unknown AI provider: ${name}`);
}

function resolveTopicGenerator() {
	const name = env.aiTopicProvider || env.aiProvider;
	if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
	if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
	throw new Error(`Unknown AI provider: ${name}`);
}

function resolveBrandScraper() {
	const name = env.aiBrandScraperProvider || env.aiProvider;
	if (name === "anthropic") return new AnthropicProvider(env.anthropicApiKey, env.anthropicModel);
	if (name === "gemini") return new GeminiProvider(env.geminiApiKey, env.geminiModel);
	throw new Error(`Unknown AI provider: ${name}`);
}

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
	const storageProvider = new MinioStorageProvider(
		env.minioEndpoint,
		env.minioAccessKey,
		env.minioSecretKey,
	);

	// ─── Services ───────────────────────────────────────────────────
	const authService = new AuthService(userRepository, {
		jwtSecret: env.jwtSecret,
		jwtRefreshSecret: env.jwtRefreshSecret,
		jwtExpiry: env.jwtExpiry,
		jwtRefreshExpiry: env.jwtRefreshExpiry,
	});
	const workspaceService = new WorkspaceService(workspaceRepository);
	const brandService = new BrandService(brandRepository);
	const productService = new ProductService(productRepository);
	const taxonomyService = new TaxonomyService(taxonomyRepository);
	const generationService = new GenerationService(generationRepository, boss);
	const libraryService = new LibraryService(generationRepository, outputSectionRepository, boss);
	const recommendationService = new RecommendationService(recommendationRepository);
	const campaignService = new CampaignService(campaignRepository, boss);
	const topicService = new TopicService(topicRepository, boss);
	const dashboardService = new DashboardService(prisma);
	const notificationService = new NotificationService();
	const documentService = new DocumentService(documentRepository, storageProvider, boss, env.minioBucket);

	// ─── Job Handlers ────────────────────────────────────────────────
	const contentGenerationJob = new ContentGenerationJob(
		prisma,
		resolveContentGenerator(),
		notificationService,
		logger,
		outputSectionRepository,
	);
	const campaignGenerationJob = new CampaignGenerationJob(
		prisma,
		resolveCampaignGenerator(),
		notificationService,
		logger,
	);
	const topicGenerationJob = new TopicGenerationJob(
		prisma,
		resolveTopicGenerator(),
		notificationService,
		logger,
	);
	const brandScrapingJob = new BrandScrapingJob(
		prisma,
		resolveBrandScraper(),
		notificationService,
		logger,
	);
	const documentExtractionJob = new DocumentExtractionJob(documentRepository, logger);
	const recommendationRecomputeJob = new RecommendationRecomputeJob(prisma, recommendationRepository, logger);

	// ─── Create PgBoss Queues ───────────────────────────────────────
	await boss.createQueue("content-generation");
	await boss.createQueue("campaign-generation");
	await boss.createQueue("topic-generation");
	await boss.createQueue("brand-scraping");
	await boss.createQueue("document-extraction");
	await boss.createQueue("recommendation-recompute");

	// ─── Register PgBoss Workers ─────────────────────────────────────
	await boss.work("content-generation", async (jobs) => {
		for (const job of jobs) await contentGenerationJob.handle(job.data as any);
	});
	await boss.work("campaign-generation", async (jobs) => {
		for (const job of jobs) await campaignGenerationJob.handle(job.data as any);
	});
	await boss.work("topic-generation", async (jobs) => {
		for (const job of jobs) await topicGenerationJob.handle(job.data as any);
	});
	await boss.work("brand-scraping", async (jobs) => {
		for (const job of jobs) await brandScrapingJob.handle(job.data as any);
	});
	await boss.work("document-extraction", async (jobs) => {
		for (const job of jobs) await documentExtractionJob.handle(job.data as any);
	});
	await boss.work("recommendation-recompute", async (jobs) => {
		for (const job of jobs) await recommendationRecomputeJob.handle(job.data as any);
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
		"Email does not match invitation",
		"Generation request not found",
		"Campaign not found",
		"Topic not found",
		"Document not found",
		"Brief not found",
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

	// Protected routes
	app.use("/api/*", authMiddleware);

	// Workspace routes (auth protected)
	app.route("/api/workspaces", createWorkspaceRoutes(workspaceService));

	// Taxonomy routes (auth protected, no workspace scoping)
	app.route("/api/taxonomy", createTaxonomyRoutes(taxonomyService));

	// SSE route (NOT workspace-scoped)
	app.route("/api/sse", createSSERoutes(notificationService, env.jwtSecret));

	// Workspace-scoped routes (auth + workspace middleware)
	const workspaceScoped = new Hono();
	workspaceScoped.use("*", wsMiddleware);
	workspaceScoped.route("/brands", createBrandRoutes(brandService, boss));
	workspaceScoped.route("/products", createProductRoutes(productService));
	workspaceScoped.route("/generations", createGenerationRoutes(generationService));
	workspaceScoped.route("/library", createLibraryRoutes(libraryService));
	workspaceScoped.route("/campaigns", createCampaignRoutes(campaignService));
	workspaceScoped.route("/topics", createTopicRoutes(topicService));
	workspaceScoped.route("/dashboard", createDashboardRoutes(dashboardService));
	workspaceScoped.route("/documents", createDocumentRoutes(documentService));
	workspaceScoped.route("/recommendations", createRecommendationRoutes(recommendationService));
	app.route("/api/workspaces/:workspaceId", workspaceScoped);

	// Health check
	app.get("/api/health", (c) => c.json({ status: "ok" }));

	// ─── Start ──────────────────────────────────────────────────────
	logger.info(`Starting server on port ${env.port}`);

	Bun.serve({
		port: env.port,
		fetch: app.fetch,
	});
}

main();
