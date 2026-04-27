import { Hono } from "hono";
import type { IOnboardingService } from "../interfaces/services/onboarding.service.interface";

type Variables = {
	userId: string;
	workspaceId: string;
	workspaceRole: string;
};

export function createOnboardingProgressRoutes(service: IOnboardingService) {
	const app = new Hono<{ Variables: Variables }>();

	// GET /api/workspaces/:workspaceId/onboarding-progress
	//   { hasBrand, hasProduct, hasGenerated }
	app.get("/", async (c) => {
		const workspaceId = c.get("workspaceId");
		const progress = await service.getProgress(workspaceId);
		return c.json({ data: progress });
	});

	return app;
}
