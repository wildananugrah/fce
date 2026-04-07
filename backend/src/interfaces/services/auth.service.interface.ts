import type { AuthResponse, LoginInput, SignupInput } from "../../types/auth.types";

export interface IAuthService {
	signup(input: SignupInput): Promise<AuthResponse>;
	login(input: LoginInput): Promise<AuthResponse & { refreshToken: string }>;
	refresh(refreshToken: string): Promise<{ accessToken: string }>;
	me(userId: string): Promise<AuthResponse["user"]>;
}
