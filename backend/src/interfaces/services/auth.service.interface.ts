import type {
	AuthResponse,
	LoginInput,
	SignupInput,
	SignupResult,
} from "../../types/auth.types";

export interface IAuthService {
	signup(input: SignupInput): Promise<SignupResult>;
	login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
	refresh(refreshToken: string): Promise<{ accessToken: string; userId: string }>;
	me(userId: string): Promise<AuthResponse["user"]>;
	verifyEmail(token: string): Promise<{ email: string }>;
	resendVerification(email: string): Promise<{ sent: boolean }>;
	requestPasswordReset(email: string): Promise<{ sent: boolean }>;
	resetPassword(token: string, newPassword: string): Promise<{ email: string }>;
	updateProfile(
		userId: string,
		data: {
			fullName?: string;
			avatarUrl?: string;
			defaultScrapeLanguage?: "indonesian" | "english";
		},
	): Promise<AuthResponse["user"]>;
}
