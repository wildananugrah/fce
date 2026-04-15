import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { IAuthService } from "../interfaces/services/auth.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
};

export function createAuthRoutes(authService: IAuthService) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/signup", async (c) => {
		const body = await c.req.json();
		const { email, password, fullName } = body;

		if (!email || !password) {
			return c.json({ error: "Email and password are required" }, 400);
		}

		const result = await authService.signup({ email, password, fullName });
		return c.json({ data: result }, 201);
	});

	app.post("/login", async (c) => {
		const body = await c.req.json();
		const { email, password } = body;

		if (!email || !password) {
			return c.json({ error: "Email and password are required" }, 400);
		}

		const { refreshToken, ...result } = await authService.login({ email, password });

		setCookie(c, "refreshToken", refreshToken, {
			httpOnly: true,
			secure: false,
			sameSite: "Lax",
			path: "/api/auth/refresh",
			maxAge: 60 * 60 * 24 * 7,
		});

		return c.json({ data: result });
	});

	app.post("/refresh", async (c) => {
		const refreshToken = getCookie(c, "refreshToken");
		if (!refreshToken) {
			return c.json({ error: "No refresh token" }, 401);
		}

		const result = await authService.refresh(refreshToken);
		return c.json({ data: result });
	});

	app.get("/me", async (c) => {
		const userId = c.get("userId");
		if (!userId) {
			return c.json({ error: "Not authenticated" }, 401);
		}

		const user = await authService.me(userId);
		return c.json({ data: user });
	});

	app.patch("/profile", async (c) => {
		const userId = c.get("userId" as any);
		const body = await c.req.json();
		try {
			const user = await authService.updateProfile(userId, {
				fullName: body.fullName,
				avatarUrl: body.avatarUrl,
				defaultScrapeLanguage: body.defaultScrapeLanguage,
			});
			return c.json({ data: user });
		} catch (e) {
			const message = e instanceof Error ? e.message : "Failed to update profile";
			if (message.startsWith("Invalid defaultScrapeLanguage")) {
				return c.json({ error: message }, 400);
			}
			throw e;
		}
	});

	return app;
}
