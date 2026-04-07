import type { IUserRepository } from "../interfaces/repositories/user.repository.interface";
import type { IAuthService } from "../interfaces/services/auth.service.interface";
import type { AuthResponse, LoginInput, SignupInput } from "../types/auth.types";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { hashPassword, verifyPassword } from "../utils/password";

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

		const accessToken = signAccessToken(
			{ userId: user.id, email: user.email },
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
			{ userId: user.id, email: user.email },
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
			{ userId: user.id, email: user.email },
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
		};
	}
}
