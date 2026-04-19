import { createMiddleware } from "hono/factory";
import { verifyAccessToken } from "../utils/jwt";

export function createAuthMiddleware(jwtSecret: string) {
	return createMiddleware(async (c, next) => {
		const authHeader = c.req.header("Authorization");
		if (!authHeader?.startsWith("Bearer ")) {
			return c.json({ error: "Missing or invalid authorization header" }, 401);
		}

		const token = authHeader.slice(7);
		try {
			const payload = verifyAccessToken(token, jwtSecret);
			c.set("userId", payload.userId);
			c.set("userEmail", payload.email);
			// Defensive: older tokens issued before RBAC land here without this
			// field, so default to false. They'll re-acquire the flag on next
			// login / refresh.
			c.set("isSuperadmin", Boolean(payload.isSuperadmin));
			await next();
		} catch {
			return c.json({ error: "Invalid or expired token" }, 401);
		}
	});
}
