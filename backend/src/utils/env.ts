function requireEnv(key: string): string {
	const value = process.env[key];
	if (!value) {
		throw new Error(`Missing required environment variable: ${key}`);
	}
	return value;
}

function optionalEnv(key: string, defaultValue = ""): string {
	return process.env[key] || defaultValue;
}

export const env = {
	port: Number.parseInt(optionalEnv("PORT", "3001"), 10),
	databaseUrl: requireEnv("DATABASE_URL"),
	jwtSecret: requireEnv("JWT_SECRET"),
	jwtRefreshSecret: requireEnv("JWT_REFRESH_SECRET"),
	jwtExpiry: optionalEnv("JWT_EXPIRY", "15m"),
	jwtRefreshExpiry: optionalEnv("JWT_REFRESH_EXPIRY", "7d"),
	aiProvider: optionalEnv("AI_PROVIDER", "anthropic"),
	aiContentProvider: optionalEnv("AI_CONTENT_PROVIDER"),
	aiCampaignProvider: optionalEnv("AI_CAMPAIGN_PROVIDER"),
	aiTopicProvider: optionalEnv("AI_TOPIC_PROVIDER"),
	aiBrandScraperProvider: optionalEnv("AI_BRAND_SCRAPER_PROVIDER"),
	aiChatProvider: optionalEnv("AI_CHAT_PROVIDER"),
	chatHistoryWindow: Number.parseInt(optionalEnv("CHAT_HISTORY_WINDOW", "20"), 10),
	anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
	anthropicModel: optionalEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
	geminiApiKey: optionalEnv("GEMINI_API_KEY"),
	geminiModel: optionalEnv("GEMINI_MODEL", "gemini-2.0-flash"),
	geminiImageModel: optionalEnv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
	minioEndpoint: optionalEnv("MINIO_ENDPOINT", "http://localhost:9000"),
	minioPublicUrl: optionalEnv("MINIO_PUBLIC_URL"),
	minioPort: Number.parseInt(optionalEnv("MINIO_PORT", "9000"), 10),
	minioAccessKey: optionalEnv("MINIO_ACCESS_KEY", "minioadmin"),
	minioSecretKey: optionalEnv("MINIO_SECRET_KEY", "minioadmin"),
	minioBucket: optionalEnv("MINIO_BUCKET", "fce-documents"),
	serviceName: optionalEnv("SERVICE_NAME", "fce-backend"),
	lokiUrl: optionalEnv("LOKI_URL"),
	otelEndpoint: optionalEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
	resendApiKey: optionalEnv("RESEND_API_KEY"),
	emailFrom: optionalEnv("EMAIL_FROM", "onboarding@resend.dev"),
	appUrl: optionalEnv("APP_URL", "http://localhost:5173"),
	invitationTokenExpiry: optionalEnv("INVITATION_TOKEN_EXPIRY", "7d"),
	// Expiry for email-verification tokens issued at signup and by the resend
	// endpoint. Accepts any string parseable by `ms` (e.g. "24h", "2d", "90m").
	// Default: 24 hours.
	emailVerificationTokenExpiry: optionalEnv("EMAIL_VERIFICATION_TOKEN_EXPIRY", "24h"),
} as const;
