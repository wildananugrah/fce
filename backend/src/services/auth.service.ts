import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { EmailNotVerifiedError } from "../errors/email-not-verified-error";
import { ValidationError } from "../errors/validation-error";
import type { IEmailProvider } from "../interfaces/providers/email.provider.interface";
import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";
import type { IAuthService } from "../interfaces/services/auth.service.interface";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";
import type {
	AuthResponse,
	LoginInput,
	SignupInput,
	SignupResult,
} from "../types/auth.types";
import { humanizeDuration, parseDuration } from "../utils/duration";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";

const ALLOWED_SCRAPE_LANGUAGES = ["indonesian", "english"] as const;
type ScrapeLanguage = (typeof ALLOWED_SCRAPE_LANGUAGES)[number];

/** Reject resend-verification requests issued more often than this. */
const MIN_RESEND_INTERVAL_MS = 60_000;

interface AuthConfig {
	jwtSecret: string;
	jwtRefreshSecret: string;
	jwtExpiry: string;
	jwtRefreshExpiry: string;
	appUrl: string;
	emailVerificationTokenExpiry: string;
}

export class AuthService implements IAuthService {
	constructor(
		private userRepository: IUserRepository,
		private config: AuthConfig,
		private workspaceService: IWorkspaceService,
		private prisma: PrismaClient,
		private emailProvider: IEmailProvider,
	) {}

	async signup(input: SignupInput): Promise<SignupResult> {
		const existing = await this.userRepository.findByEmail(input.email);
		if (existing) {
			throw new Error("Email already registered");
		}

		const passwordHash = await hashPassword(input.password);
		const user = await this.userRepository.create({
			email: input.email,
			passwordHash,
			fullName: input.fullName,
		});

		// Invitation path: if the token exists and accepting succeeds, the user
		// has proven address ownership by following the invitation email, so we
		// mark them verified and log them in immediately — no second email.
		let invitationAccepted = false;
		if (input.invitationToken) {
			try {
				await this.workspaceService.acceptInvitation(
					input.invitationToken,
					user.id,
					user.email,
				);
				invitationAccepted = true;
				await this.userRepository.update(user.id, { emailVerifiedAt: new Date() });
			} catch {
				// Bad / expired invitation — fall through to normal verification flow.
			}
		}

		if (invitationAccepted) {
			const accessToken = signAccessToken(
				{ userId: user.id, email: user.email, isSuperadmin: user.isSuperadmin },
				this.config.jwtSecret,
				this.config.jwtExpiry,
			);
			return {
				kind: "verified",
				user: {
					id: user.id,
					email: user.email,
					fullName: user.fullName,
					avatarUrl: user.avatarUrl,
					isSuperadmin: user.isSuperadmin,
					defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
				},
				accessToken,
			};
		}

		// Standard path: issue a token, email it, tell the frontend to show the
		// "check your inbox" screen.
		await this.issueVerificationToken(user.id, user.email, user.fullName);
		return { kind: "pending", email: user.email };
	}

	async login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }> {
		const user = await this.userRepository.findByEmail(input.email);
		if (!user) {
			throw new Error("Invalid email or password");
		}

		const isValid = await verifyPassword(input.password, user.passwordHash);
		if (!isValid) {
			throw new Error("Invalid email or password");
		}

		if (!user.emailVerifiedAt) {
			throw new EmailNotVerifiedError(user.email);
		}

		const accessToken = signAccessToken(
			{ userId: user.id, email: user.email, isSuperadmin: user.isSuperadmin },
			this.config.jwtSecret,
			this.config.jwtExpiry,
		);

		const refreshToken = signRefreshToken(
			{ userId: user.id },
			this.config.jwtRefreshSecret,
			this.config.jwtRefreshExpiry,
		);

		return {
			user: {
				id: user.id,
				email: user.email,
				fullName: user.fullName,
				avatarUrl: user.avatarUrl,
				isSuperadmin: user.isSuperadmin,
				defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
			},
			accessToken,
			refreshToken,
		};
	}

	async refresh(refreshToken: string): Promise<{ accessToken: string }> {
		const payload = verifyRefreshToken(refreshToken, this.config.jwtRefreshSecret);
		const user = await this.userRepository.findById(payload.userId);
		if (!user) {
			throw new Error("User not found");
		}

		const accessToken = signAccessToken(
			{ userId: user.id, email: user.email, isSuperadmin: user.isSuperadmin },
			this.config.jwtSecret,
			this.config.jwtExpiry,
		);

		return { accessToken };
	}

	async me(userId: string): Promise<AuthResponse["user"]> {
		const user = await this.userRepository.findById(userId);
		if (!user) {
			throw new Error("User not found");
		}

		return {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			avatarUrl: user.avatarUrl,
			isSuperadmin: user.isSuperadmin,
			defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
		};
	}

	async verifyEmail(token: string): Promise<{ email: string }> {
		const row = await this.prisma.emailVerificationToken.findUnique({ where: { token } });
		if (!row) throw new Error("Invalid verification link");

		const user = await this.userRepository.findById(row.userId);
		if (!user) throw new Error("User not found");

		// Idempotent: if this token has already been consumed AND the user is
		// now verified, treat it as success. Lets the user refresh the "verified"
		// screen, double-click the email link, or hit a dev StrictMode double
		// mount without flipping the UI to an error.
		if (row.consumedAt && user.emailVerifiedAt) {
			return { email: user.email };
		}

		if (row.consumedAt) {
			throw new Error("This verification link has already been used");
		}
		if (row.expiresAt.getTime() < Date.now()) {
			throw new Error("This verification link has expired. Request a new one from the login page.");
		}

		await this.prisma.$transaction([
			this.prisma.emailVerificationToken.update({
				where: { id: row.id },
				data: { consumedAt: new Date() },
			}),
			this.prisma.user.update({
				where: { id: user.id },
				data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
			}),
		]);

		return { email: user.email };
	}

	async resendVerification(email: string): Promise<{ sent: boolean }> {
		const normalized = email.trim().toLowerCase();
		const user = await this.userRepository.findByEmail(normalized);
		// Enumeration-resistant: return { sent: true } regardless of whether the
		// email exists. Actually send only when there's a real, unverified user.
		if (!user || user.emailVerifiedAt) {
			return { sent: true };
		}

		// Throttle: bail out if we issued a token for this user in the last minute.
		const recent = await this.prisma.emailVerificationToken.findFirst({
			where: { userId: user.id, consumedAt: null },
			orderBy: { createdAt: "desc" },
		});
		if (recent && Date.now() - recent.createdAt.getTime() < MIN_RESEND_INTERVAL_MS) {
			return { sent: true };
		}

		await this.issueVerificationToken(user.id, user.email, user.fullName);
		return { sent: true };
	}

	async updateProfile(
		userId: string,
		data: {
			fullName?: string;
			avatarUrl?: string;
			defaultScrapeLanguage?: "indonesian" | "english";
		},
	): Promise<AuthResponse["user"]> {
		if (
			data.defaultScrapeLanguage !== undefined &&
			!ALLOWED_SCRAPE_LANGUAGES.includes(data.defaultScrapeLanguage as ScrapeLanguage)
		) {
			throw new ValidationError(
				`Invalid defaultScrapeLanguage: ${data.defaultScrapeLanguage}. Allowed: ${ALLOWED_SCRAPE_LANGUAGES.join(", ")}`,
			);
		}

		const user = await this.userRepository.update(userId, data);
		return {
			id: user.id,
			email: user.email,
			fullName: user.fullName,
			avatarUrl: user.avatarUrl,
			isSuperadmin: user.isSuperadmin,
			defaultScrapeLanguage: user.defaultScrapeLanguage as ScrapeLanguage,
		};
	}

	// ─── Internals ─────────────────────────────────────────────────

	private async issueVerificationToken(
		userId: string,
		email: string,
		fullName: string | null,
	): Promise<void> {
		// Invalidate any previous unconsumed tokens so only the latest link works.
		// Harmless to delete — the resend/signup flow always has the current user
		// re-consume whichever token is newest.
		await this.prisma.emailVerificationToken.deleteMany({
			where: { userId, consumedAt: null },
		});

		const token = crypto.randomBytes(32).toString("hex");
		const ttlMs = parseDuration(this.config.emailVerificationTokenExpiry);
		const expiresAt = new Date(Date.now() + ttlMs);

		await this.prisma.emailVerificationToken.create({
			data: { userId, token, expiresAt },
		});

		const verifyUrl = `${this.config.appUrl}/verify?token=${encodeURIComponent(token)}`;
		const expiryHuman = humanizeDuration(this.config.emailVerificationTokenExpiry);

		await this.emailProvider.sendVerification({
			to: email,
			fullName,
			verifyUrl,
			expiryHuman,
		});
	}
}
