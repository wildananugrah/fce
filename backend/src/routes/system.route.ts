import { Hono } from "hono";
import type { AiMode } from "../services/ai-provider-factory.service";

export function createSystemRoutes(mode: AiMode) {
	const app = new Hono();
	app.get("/ai-mode", (c) => c.json({ data: { mode } }));
	return app;
}
