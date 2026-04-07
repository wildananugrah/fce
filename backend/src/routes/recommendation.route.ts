import { Hono } from "hono";
import type { IRecommendationService } from "../interfaces/services/recommendation.service.interface";

export function createRecommendationRoutes(recommendationService: IRecommendationService) {
	const app = new Hono();

	app.get("/brand/:brandId", async (c) => {
		const brandId = c.req.param("brandId");
		const profile = await recommendationService.getForBrand(brandId);
		return c.json({ data: profile });
	});

	app.get("/product/:productId", async (c) => {
		const productId = c.req.param("productId");
		const profile = await recommendationService.getForProduct(productId);
		return c.json({ data: profile });
	});

	return app;
}
