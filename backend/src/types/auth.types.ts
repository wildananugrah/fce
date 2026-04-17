export interface SignupInput {
	email: string;
	password: string;
	fullName?: string;
	invitationToken?: string;
}

export interface LoginInput {
	email: string;
	password: string;
}

export interface AuthTokens {
	accessToken: string;
	refreshToken: string;
}

export interface AuthResponse {
	user: {
		id: string;
		email: string;
		fullName: string | null;
		avatarUrl: string | null;
		isSuperadmin: boolean;
		defaultScrapeLanguage: "indonesian" | "english";
	};
	accessToken: string;
}
