import { afterEach, describe, expect, it } from "bun:test";
import { AuthService } from "../../src/services/auth.service";
import { MockUserRepository } from "../helpers/mock-user.repository";

const JWT_SECRET = "test-access-secret-key-for-testing";
const JWT_REFRESH_SECRET = "test-refresh-secret-key-for-testing";

describe("AuthService", () => {
	const userRepo = new MockUserRepository();
	const authService = new AuthService(userRepo, {
		jwtSecret: JWT_SECRET,
		jwtRefreshSecret: JWT_REFRESH_SECRET,
		jwtExpiry: "15m",
		jwtRefreshExpiry: "7d",
	});

	afterEach(() => {
		userRepo.clear();
	});

	describe("signup", () => {
		it("should create a new user and return access token", async () => {
			const result = await authService.signup({
				email: "test@example.com",
				password: "password123",
				fullName: "Test User",
			});
			expect(result.user.email).toBe("test@example.com");
			expect(result.user.fullName).toBe("Test User");
			expect(result.accessToken).toBeTruthy();
		});

		it("should reject duplicate email", async () => {
			await authService.signup({ email: "dupe@example.com", password: "password123" });
			await expect(
				authService.signup({ email: "dupe@example.com", password: "password456" }),
			).rejects.toThrow("Email already registered");
		});
	});

	describe("login", () => {
		it("should return tokens for valid credentials", async () => {
			await authService.signup({ email: "login@example.com", password: "password123" });
			const result = await authService.login({
				email: "login@example.com",
				password: "password123",
			});
			expect(result.user.email).toBe("login@example.com");
			expect(result.accessToken).toBeTruthy();
			expect(result.refreshToken).toBeTruthy();
		});

		it("should reject invalid email", async () => {
			await expect(
				authService.login({ email: "nonexistent@example.com", password: "password123" }),
			).rejects.toThrow("Invalid email or password");
		});

		it("should reject wrong password", async () => {
			await authService.signup({ email: "wrongpw@example.com", password: "correct-password" });
			await expect(
				authService.login({ email: "wrongpw@example.com", password: "wrong-password" }),
			).rejects.toThrow("Invalid email or password");
		});
	});

	describe("refresh", () => {
		it("should return a new access token for valid refresh token", async () => {
			await authService.signup({ email: "refresh@example.com", password: "password123" });
			const loginResult = await authService.login({
				email: "refresh@example.com",
				password: "password123",
			});
			const result = await authService.refresh(loginResult.refreshToken);
			expect(result.accessToken).toBeTruthy();
			expect(result.accessToken).not.toBe(loginResult.accessToken);
		});

		it("should reject invalid refresh token", async () => {
			await expect(authService.refresh("invalid-token")).rejects.toThrow();
		});
	});

	describe("me", () => {
		it("should return user profile", async () => {
			const signup = await authService.signup({
				email: "me@example.com",
				password: "password123",
				fullName: "Me User",
			});
			const user = await authService.me(signup.user.id);
			expect(user.email).toBe("me@example.com");
			expect(user.fullName).toBe("Me User");
		});

		it("should throw for nonexistent user", async () => {
			await expect(authService.me("nonexistent-id")).rejects.toThrow("User not found");
		});
	});

	describe("updateProfile — defaultScrapeLanguage", () => {
		it("defaults new users to 'indonesian'", async () => {
			await authService.signup({ email: "lang@example.com", password: "password123" });
			const signupUser = await userRepo.findByEmail("lang@example.com");
			expect(signupUser?.defaultScrapeLanguage).toBe("indonesian");
		});

		it("returns defaultScrapeLanguage from me()", async () => {
			const signup = await authService.signup({
				email: "me-lang@example.com",
				password: "password123",
			});
			const me = await authService.me(signup.user.id);
			expect(me.defaultScrapeLanguage).toBe("indonesian");
		});

		it("persists a valid language update", async () => {
			const signup = await authService.signup({
				email: "update-lang@example.com",
				password: "password123",
			});
			const updated = await authService.updateProfile(signup.user.id, {
				defaultScrapeLanguage: "english",
			});
			expect(updated.defaultScrapeLanguage).toBe("english");
		});

		it("rejects an invalid language value", async () => {
			const signup = await authService.signup({
				email: "bad-lang@example.com",
				password: "password123",
			});
			await expect(
				authService.updateProfile(signup.user.id, {
					defaultScrapeLanguage: "french" as any,
				}),
			).rejects.toThrow("Invalid defaultScrapeLanguage");
		});

		it("leaves defaultScrapeLanguage unchanged when other fields are updated", async () => {
			const signup = await authService.signup({
				email: "keep-lang@example.com",
				password: "password123",
			});
			await authService.updateProfile(signup.user.id, { defaultScrapeLanguage: "english" });
			await authService.updateProfile(signup.user.id, { fullName: "New Name" });
			const me = await authService.me(signup.user.id);
			expect(me.defaultScrapeLanguage).toBe("english");
			expect(me.fullName).toBe("New Name");
		});
	});
});
