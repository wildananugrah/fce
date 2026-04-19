import { Hono } from "hono";
import type { PrismaClient } from "@prisma/client";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";
import type { IProductService } from "../interfaces/services/product.service.interface";
import type { AiProviderFactory } from "../services/ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";

type Variables = {
	userId: string;
	userEmail: string;
	workspaceId: string;
	workspaceRole: string;
};

type ProductAIProvider = {
	generateProductBrain(input: {
		productName: string;
		brandName: string;
		productType?: string;
		priceTier?: string;
		summary?: string;
	}): Promise<{
		usp?: string;
		rtb?: string;
		functionalBenefits?: string[];
		emotionalBenefits?: string[];
		targetAudience?: string;
		summary?: string;
	}>;
	scrapeProduct(input: {
		url?: string;
		urls?: string[];
		language?: string;
	}): Promise<{
		name?: string;
		type?: string;
		priceTier?: string;
		summary?: string;
		usp?: string;
		rtb?: string;
		functionalBenefits?: string[];
		emotionalBenefits?: string[];
		targetAudience?: string;
		imageUrl?: string;
	}>;
};

export function createProductRoutes(
	productService: IProductService,
	aiFactory: AiProviderFactory,
	storageProvider?: IStorageProvider,
	storageBucket?: string,
	prisma?: PrismaClient,
) {
	const getAiGenerator = async (workspaceId: string): Promise<ProductAIProvider> =>
		(await aiFactory.getBrandScraper(workspaceId)) as unknown as ProductAIProvider;
	const getProviderName = async (workspaceId: string): Promise<string> =>
		(await aiFactory.getSettings(workspaceId)).providers.brandScraper;
	const app = new Hono<{ Variables: Variables }>();

	// POST /scrape-preview — scrape product URL and return all fields
	app.post("/scrape-preview", async (c) => {
		const body = await c.req.json();
		const { url, urls, language } = body as {
			url?: string;
			urls?: string[];
			language?: string;
		};
		const urlList = Array.isArray(urls) && urls.length > 0 ? urls : url ? [url] : [];
		if (urlList.length === 0) {
			return c.json({ error: "url or urls is required" }, 400);
		}
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const aiGenerator = await getAiGenerator(workspaceId);
		const providerName = await getProviderName(workspaceId);
		const startTime = Date.now();
		try {
			const result = await aiGenerator.scrapeProduct({ urls: urlList, language });
			const durationMs = Date.now() - startTime;
			if (prisma) {
				const usage = (aiGenerator as any).lastUsage;
				await logAiActivity(
					prisma,
					{
						workspaceId,
						generator: "product_scraping",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Scrape product URLs: ${urlList.join(", ")}`,
					},
					{
						responseJson: result,
						durationMs,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			}
			return c.json({ data: result });
		} catch (err) {
			const durationMs = Date.now() - startTime;
			if (prisma) {
				const usage = (aiGenerator as any).lastUsage;
				await logAiActivity(
					prisma,
					{
						workspaceId,
						generator: "product_scraping",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Scrape product URLs: ${urlList.join(", ")}`,
					},
					{
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						durationMs,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
			}
			throw err;
		}
	});

	// POST /generate-brain — AI-generate product brain fields
	app.post("/generate-brain", async (c) => {
		const body = await c.req.json();
		const { productName, brandName, productType, priceTier, summary } = body;
		if (!productName || !brandName) {
			return c.json({ error: "productName and brandName are required" }, 400);
		}
		const workspaceId = c.get("workspaceId");
		const userId = c.get("userId");
		const aiGenerator = await getAiGenerator(workspaceId);
		const providerName = await getProviderName(workspaceId);
		const startTime = Date.now();
		try {
			const result = await aiGenerator.generateProductBrain({
				productName,
				brandName,
				productType,
				priceTier,
				summary,
			});
			const durationMs = Date.now() - startTime;
			if (prisma) {
				const usage = (aiGenerator as any).lastUsage;
				await logAiActivity(
					prisma,
					{
						workspaceId,
						generator: "product_brain",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Generate product brain for: ${productName} (brand: ${brandName})`,
					},
					{
						responseJson: result,
						durationMs,
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						status: "success",
					},
				);
			}
			return c.json({ data: result });
		} catch (err) {
			const durationMs = Date.now() - startTime;
			if (prisma) {
				const usage = (aiGenerator as any).lastUsage;
				await logAiActivity(
					prisma,
					{
						workspaceId,
						generator: "product_brain",
						provider: providerName,
						userId,
						systemPrompt: "",
						userPrompt: `Generate product brain for: ${productName} (brand: ${brandName})`,
					},
					{
						inputTokens: usage?.inputTokens,
						outputTokens: usage?.outputTokens,
						durationMs,
						status: "error",
						errorMessage: err instanceof Error ? err.message : String(err),
					},
				);
			}
			throw err;
		}
	});

	// POST /upload-image — upload product image
	app.post("/upload-image", async (c) => {
		if (!storageProvider || !storageBucket) {
			return c.json({ error: "Storage not configured" }, 500);
		}
		const formData = await c.req.parseBody();
		const file = formData.file as File;
		if (!file) {
			return c.json({ error: "file is required" }, 400);
		}
		const ext = file.name.split(".").pop() ?? "jpg";
		const key = `products/${crypto.randomUUID()}.${ext}`;
		const buffer = Buffer.from(await file.arrayBuffer());
		const url = await storageProvider.upload(storageBucket, key, buffer, file.type);
		return c.json({ data: { url } });
	});

	// GET / — list products
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const products = await productService.list(workspaceId);
		return c.json({ data: products });
	});

	// POST / — create product
	app.post("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const body = await c.req.json();
		const { brandId, name, slug, type, priceTier, summary, imageUrl } = body;
		if (!brandId || !name || !slug) {
			return c.json({ error: "brandId, name, and slug are required" }, 400);
		}
		const product = await productService.create(workspaceId, {
			brandId,
			name,
			slug,
			type,
			priceTier,
			summary,
			imageUrl,
		});
		return c.json({ data: product }, 201);
	});

	// GET /:id — get product with brain versions
	app.get("/:id", async (c) => {
		const product = await productService.getById(c.req.param("id"));
		return c.json({ data: product });
	});

	// PATCH /:id — update product
	app.patch("/:id", async (c) => {
		const body = await c.req.json();
		const product = await productService.update(c.req.param("id"), body);
		return c.json({ data: product });
	});

	// DELETE /:id — delete product (cascades to brain versions, content
	// topic links; sets generation_requests.product_id and
	// brand_documents.product_id to NULL where present).
	app.delete("/:id", async (c) => {
		const workspaceId = c.get("workspaceId");
		await productService.delete(workspaceId, c.req.param("id"));
		return c.json({ deleted: true });
	});

	// POST /:id/brain-versions — create new brain version
	app.post("/:id/brain-versions", async (c) => {
		const body = await c.req.json();
		const brainVersion = await productService.createBrainVersion(c.req.param("id"), body);
		return c.json({ data: brainVersion }, 201);
	});

	return app;
}
