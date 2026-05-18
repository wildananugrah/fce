import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AuthService } from "../../src/services/auth.service";
import { MockUserRepository } from "../helpers/mock-user.repository";

const JWT_SECRET = "test-access-secret-key-for-testing";
const JWT_REFRESH_SECRET = "test-refresh-secret-key-for-testing";

describe("AuthService", () => {
	const userRepo = new MockUserRepository();

	// The invitation path auto-verifies on signup, which the tests rely on so
	// they can log in / call me() without hand-rolling a verification step.
	// Pass `invitationToken: "valid"` in tests that want the full-auth result.
	const workspaceServiceStub = {
		acceptInvitation: async () => {},
	} as any;

	// Mock prisma just for the verification-token table — other methods are
	// unused in this suite. Mock email provider is a no-op.
	const verificationTokens: Array<{ id: string; userId: string; token: string; expiresAt: Date; consumedAt: Date | null; createdAt: Date }> = [];
	const prismaStub = {
		emailVerificationToken: {
			deleteMany: async () => ({ count: 0 }),
			create: async ({ data }: any) => {
				const row = { id: crypto.randomUUID(), consumedAt: null, createdAt: new Date(), ...data };
				verificationTokens.push(row);
				return row;
			},
			findUnique: async ({ where }: any) =>
				verificationTokens.find((t) => t.token === where.token) ?? null,
			findFirst: async () => null,
			update: async ({ where, data }: any) => {
				const t = verificationTokens.find((x) => x.id === where.id);
				if (!t) throw new Error("not found");
				Object.assign(t, data);
				return t;
			},
		},
		user: {
			update: async ({ where, data }: any) => userRepo.update(where.id, data),
		},
		$transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
	} as any;
	const emailProviderStub = {
		sendInvitation: async () => {},
		sendVerification: async () => {},
	} as any;

	const authService = new AuthService(
		userRepo,
		{
			jwtSecret: JWT_SECRET,
			jwtRefreshSecret: JWT_REFRESH_SECRET,
			jwtExpiry: "15m",
			jwtRefreshExpiry: "7d",
			appUrl: "http://localhost:5173",
			emailVerificationTokenExpiry: "24h",
			passwordResetTokenExpiry: "1h",
			userDefaultMaxWorkspaces: 1,
			userDefaultMaxProjects: 3,
		},
		workspaceServiceStub,
		prismaStub,
		emailProviderStub,
	);

	/** Sign up via the invitation path so the user is auto-verified. */
	async function signupVerified(input: {
		email: string;
		password: string;
		fullName?: string;
	}) {
		const result = await authService.signup({ ...input, invitationToken: "valid" });
		if (result.kind !== "verified") {
			throw new Error("Expected invitation-path signup to return kind=verified");
		}
		return result;
	}

	beforeEach(() => {
		verificationTokens.length = 0;
	});

	afterEach(() => {
		userRepo.clear();
	});

	describe("signup", () => {
		it("returns a pending result for non-invitation signup", async () => {
			const result = await authService.signup({
				email: "pending@example.com",
				password: "password123",
				fullName: "Pending User",
			});
			expect(result.kind).toBe("pending");
			if (result.kind === "pending") {
				expect(result.email).toBe("pending@example.com");
			}
		});

		it("returns a verified result + access token when an invitation token accepts", async () => {
			const result = await signupVerified({
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
		it("should return tokens for valid credentials on a verified user", async () => {
			await signupVerified({ email: "login@example.com", password: "password123" });
			const result = await authService.login({
				email: "login@example.com",
				password: "password123",
			});
			expect(result.user.email).toBe("login@example.com");
			expect(result.accessToken).toBeTruthy();
			expect(result.refreshToken).toBeTruthy();
		});

		it("rejects login on an unverified user with EmailNotVerifiedError", async () => {
			await authService.signup({ email: "unverified@example.com", password: "password123" });
			await expect(
				authService.login({ email: "unverified@example.com", password: "password123" }),
			).rejects.toThrow("Please verify your email");
		});

		it("should reject invalid email", async () => {
			await expect(
				authService.login({ email: "nonexistent@example.com", password: "password123" }),
			).rejects.toThrow("Invalid email or password");
		});

		it("should reject wrong password", async () => {
			await signupVerified({ email: "wrongpw@example.com", password: "correct-password" });
			await expect(
				authService.login({ email: "wrongpw@example.com", password: "wrong-password" }),
			).rejects.toThrow("Invalid email or password");
		});
	});

	describe("refresh", () => {
		it("should return a new access token for valid refresh token", async () => {
			await signupVerified({ email: "refresh@example.com", password: "password123" });
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
			const signup = await signupVerified({
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
		it("defaults new users to 'indonesian' in the verified signup response", async () => {
			const result = await signupVerified({
				email: "lang@example.com",
				password: "password123",
			});
			expect(result.user.defaultScrapeLanguage).toBe("indonesian");
		});

		it("returns defaultScrapeLanguage from me()", async () => {
			const signup = await signupVerified({
				email: "me-lang@example.com",
				password: "password123",
			});
			const me = await authService.me(signup.user.id);
			expect(me.defaultScrapeLanguage).toBe("indonesian");
		});

		it("persists a valid language update", async () => {
			const signup = await signupVerified({
				email: "update-lang@example.com",
				password: "password123",
			});
			const updated = await authService.updateProfile(signup.user.id, {
				defaultScrapeLanguage: "english",
			});
			expect(updated.defaultScrapeLanguage).toBe("english");
		});

		it("rejects an invalid language value", async () => {
			const signup = await signupVerified({
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
			const signup = await signupVerified({
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
