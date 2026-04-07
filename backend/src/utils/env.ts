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
	anthropicApiKey: optionalEnv("ANTHROPIC_API_KEY"),
	anthropicModel: optionalEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
	geminiApiKey: optionalEnv("GEMINI_API_KEY"),
	geminiModel: optionalEnv("GEMINI_MODEL", "gemini-2.0-flash"),
	minioEndpoint: optionalEnv("MINIO_ENDPOINT", "http://localhost:9000"),
	minioPort: Number.parseInt(optionalEnv("MINIO_PORT", "9000"), 10),
	minioAccessKey: optionalEnv("MINIO_ACCESS_KEY", "minioadmin"),
	minioSecretKey: optionalEnv("MINIO_SECRET_KEY", "minioadmin"),
	minioBucket: optionalEnv("MINIO_BUCKET", "fce-documents"),
	serviceName: optionalEnv("SERVICE_NAME", "fce-backend"),
	lokiUrl: optionalEnv("LOKI_URL"),
	otelEndpoint: optionalEnv("OTEL_EXPORTER_OTLP_ENDPOINT"),
} as const;
