import { Hono } from "hono";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { verifyAccessToken } from "../utils/jwt";

export function createSSERoutes(notificationService: INotificationService, jwtSecret: string) {
	const app = new Hono();

	app.get("/", async (c) => {
		const token = c.req.query("token");
		if (!token) {
			return c.json({ error: "Token required" }, 401);
		}

		let userId: string;
		try {
			const payload = verifyAccessToken(token, jwtSecret);
			userId = payload.userId;
		} catch {
			return c.json({ error: "Invalid token" }, 401);
		}

		const stream = new ReadableStream({
			start(controller) {
				notificationService.addConnection(userId, controller);
				// Send initial connection event
				const msg = `event: connected\ndata: ${JSON.stringify({ userId })}\n\n`;
				controller.enqueue(new TextEncoder().encode(msg));
			},
			cancel() {
				notificationService.removeConnection(userId);
			},
		});

		return new Response(stream, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	});

	return app;
}
