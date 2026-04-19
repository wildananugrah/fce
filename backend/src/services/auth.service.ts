import { ValidationError } from "../errors/validation-error";
import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";
import type { IAuthService } from "../interfaces/services/auth.service.interface";
import type { IWorkspaceService } from "../interfaces/services/workspace.service.interface";
import type { AuthResponse, LoginInput, SignupInput } from "../types/auth.types";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";

const ALLOWED_SCRAPE_LANGUAGES = ["indonesian", "english"] as const;
type ScrapeLanguage = (typeof ALLOWED_SCRAPE_LANGUAGES)[number];

interface AuthConfig {
	jwtSecret: string;
	jwtRefreshSecret: string;
	jwtExpiry: string;
	jwtRefreshExpiry: string;
}

export class AuthService implements IAuthService {
	constructor(
		private userRepository: IUserRepository,
		private config: AuthConfig,
		private workspaceService: IWorkspaceService,
	) {}

	async signup(input: SignupInput): Promise<AuthResponse> {
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

		// If an invitation token was supplied and matches this email,
		// auto-accept so the user lands on the workspace immediately.
		if (input.invitationToken) {
			try {
				await this.workspaceService.acceptInvitation(
					input.invitationToken,
					user.id,
					user.email,
				);
			} catch {
				// Don't block signup on a bad / expired invitation — the user
				// can still log in; the banner will hide expired ones.
			}
		}

		const accessToken = signAccessToken(
			{ userId: user.id, email: user.email, isSuperadmin: user.isSuperadmin },
			this.config.jwtSecret,
			this.config.jwtExpiry,
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
		};
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
}
