import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export function createRequestLoggerMiddleware(logger: ILogger) {
	return createMiddleware(async (c, next) => {
		const transactionId = randomUUID();
		const startTime = Date.now();

		c.set("transactionId", transactionId);

		await next();

		const processingTime = Date.now() - startTime;
		const userId = c.get("userId") ?? "anonymous";

		const logData: Record<string, unknown> = {
			transactionId,
			userId,
			method: c.req.method,
			uri: c.req.path,
			statusCode: c.res.status,
			processingTime,
		};

		if (c.res.status >= 500) {
			logger.error("Request failed", logData);
		} else if (c.res.status >= 400) {
			logger.warn("Client error", logData);
		} else {
			logger.info("Request completed", logData);
		}
	});
}
