import { createMiddleware } from "hono/factory";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export function createErrorHandlerMiddleware(logger: ILogger) {
	return createMiddleware(async (c, next) => {
		try {
			await next();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const stack = err instanceof Error ? err.stack : undefined;

			logger.error("Unhandled exception", {
				error: message,
				stack,
				method: c.req.method,
				path: c.req.path,
			});

			const knownErrors = [
				"Email already registered",
				"Invalid email or password",
				"User not found",
			];
			if (knownErrors.includes(message)) {
				return c.json({ error: message }, 400);
			}

			return c.json({ error: "Internal server error" }, 500);
		}
	});
}
