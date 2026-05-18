import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { EmailNotVerifiedError } from "../errors/email-not-verified-error";
import { PasswordResetTokenError } from "../errors/password-reset-token-error";
import { ValidationError } from "../errors/validation-error";
import type { IAuthService } from "../interfaces/services/auth.service.interface";

type Variables = {
	userId: string;
	userEmail: string;
};

export function createAuthRoutes(authService: IAuthService) {
	const app = new Hono<{ Variables: Variables }>();

	app.post("/signup", async (c) => {
		const body = await c.req.json();
		const { email, password, fullName, invitationToken } = body;

		if (!email || !password) {
			return c.json({ error: "Email and password are required" }, 400);
		}

		try {
			const result = await authService.signup({ email, password, fullName, invitationToken });
			// Discriminated union: invitation path returns kind="verified" with a
			// JWT (treated identically to login by the frontend); plain signup
			// returns kind="pending" so the frontend shows "check your email".
			if (result.kind === "verified") {
				return c.json(
					{
						data: {
							verificationRequired: false,
							user: result.user,
							accessToken: result.accessToken,
						},
					},
					201,
				);
			}
			return c.json(
				{ data: { verificationRequired: true, email: result.email } },
				201,
			);
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Signup failed" }, 400);
		}
	});

	app.post("/login", async (c) => {
		const body = await c.req.json();
		const { email, password } = body;

		if (!email || !password) {
			return c.json({ error: "Email and password are required" }, 400);
		}

		try {
			const { refreshToken, ...result } = await authService.login({ email, password });
			setCookie(c, "refreshToken", refreshToken, {
				httpOnly: true,
				secure: false,
				sameSite: "Lax",
				path: "/api/auth/refresh",
				maxAge: 60 * 60 * 24 * 7,
			});
			return c.json({ data: result });
		} catch (e) {
			if (e instanceof EmailNotVerifiedError) {
				return c.json(
					{
						error: e.message,
						verificationRequired: true,
						email: e.email,
					},
					403,
				);
			}
			throw e;
		}
	});

	app.get("/verify", async (c) => {
		const token = c.req.query("token");
		if (!token) return c.json({ error: "Missing token" }, 400);
		try {
			const { email } = await authService.verifyEmail(token);
			return c.json({ data: { verified: true, email } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Verification failed" }, 400);
		}
	});

	app.post("/resend-verification", async (c) => {
		const body = await c.req.json();
		const { email } = body as { email?: string };
		if (!email || typeof email !== "string") {
			return c.json({ error: "email is required" }, 400);
		}
		const result = await authService.resendVerification(email);
		return c.json({ data: result });
	});

	app.post("/forgot-password", async (c) => {
		const body = await c.req.json();
		const { email } = body as { email?: string };
		if (!email || typeof email !== "string") {
			return c.json({ error: "email is required" }, 400);
		}
		const result = await authService.requestPasswordReset(email);
		return c.json({ data: result });
	});

	app.post("/reset-password", async (c) => {
		const body = await c.req.json();
		const { token, password } = body as { token?: string; password?: string };
		if (!token || typeof token !== "string") {
			return c.json({ error: "token is required" }, 400);
		}
		if (!password || typeof password !== "string") {
			return c.json({ error: "password is required" }, 400);
		}
		try {
			const result = await authService.resetPassword(token, password);
			return c.json({ data: result });
		} catch (e) {
			if (e instanceof PasswordResetTokenError) {
				return c.json({ error: e.message }, 400);
			}
			if (e instanceof Error) {
				return c.json({ error: e.message }, 400);
			}
			return c.json({ error: "Password reset failed" }, 400);
		}
	});

	app.post("/change-password", async (c) => {
		const userId = c.get("userId");
		if (!userId) return c.json({ error: "Not authenticated" }, 401);
		const body = await c.req.json();
		const { currentPassword, newPassword } = body as {
			currentPassword?: string;
			newPassword?: string;
		};
		if (!currentPassword || !newPassword) {
			return c.json({ error: "currentPassword and newPassword are required" }, 400);
		}
		try {
			await authService.changePassword(userId, currentPassword, newPassword);
			return c.json({ data: { success: true } });
		} catch (e) {
			return c.json({ error: e instanceof Error ? e.message : "Failed to change password" }, 400);
		}
	});

	app.post("/logout", (c) => {
		setCookie(c, "refreshToken", "", {
			httpOnly: true,
			secure: false,
			sameSite: "Lax",
			path: "/api/auth/refresh",
			maxAge: 0,
		});
		return c.json({ success: true });
	});

	app.post("/refresh", async (c) => {
		const refreshToken = getCookie(c, "refreshToken");
		if (!refreshToken) {
			return c.json({ error: "No refresh token" }, 401);
		}

		const result = await authService.refresh(refreshToken);
		// Surface the resolved userId so the request-logger reports it
		// instead of "anonymous" — the refresh route runs before the auth
		// middleware that normally populates this.
		c.set("userId", result.userId);
		return c.json({ data: { accessToken: result.accessToken } });
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
			if (e instanceof ValidationError) {
				return c.json({ error: e.message }, 400);
			}
			throw e;
		}
	});

	return app;
}
