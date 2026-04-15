import type { PrismaClient } from "@prisma/client";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type {
	IInspirationSummarizer,
	InspirationSummary,
} from "../interfaces/providers/inspiration-summarizer.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IUrlScrapeCacheRepository } from "../interfaces/repositories/url-scrape-cache.repository.interface";
import type { IResearchService } from "../interfaces/services/research.service.interface";
import type {
	InspirationResult,
	IUrlInspirationService,
} from "../interfaces/services/url-inspiration.service.interface";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildActorInput } from "../utils/apify-actor-inputs";
import { detectUrlKind, hashUrl, normalizeUrl } from "../utils/url-router";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const APIFY_WAIT_SECONDS = 90;
const APIFY_POLL_INTERVAL_MS = 2000;
const MAX_URLS_PER_PROMPT = 5;
const URL_REGEX = /https?:\/\/[^\s<>"]+/g;
const FALLBACK_FETCH_TIMEOUT_MS = 10_000;
const FALLBACK_MAX_CHARS = 3000;

// Summarizer that also exposes the last prompts/response for logging.
// GeminiProvider and AnthropicProvider both satisfy this shape via their
// public `lastUsage`, `lastPrompts`, `lastResponseText` properties.
type LoggableSummarizer = IInspirationSummarizer & {
	lastUsage?: { inputTokens: number; outputTokens: number } | null;
	lastPrompts?: { systemPrompt: string; userPrompt: string } | null;
	lastResponseText?: string | null;
};

export class UrlInspirationService implements IUrlInspirationService {
	constructor(
		private prisma: PrismaClient,
		private apifyProvider: IApifyProvider,
		private researchService: IResearchService,
		private summarizer: LoggableSummarizer,
		private cacheRepository: IUrlScrapeCacheRepository,
		private logger: ILogger,
	) {}

	async getInspiration(
		workspaceId: string,
		url: string,
		userId?: string,
	): Promise<InspirationResult> {
		try {
			const kind = detectUrlKind(url);
			const urlHash = await hashUrl(url);

			// Cache lookup
			const cached = await this.cacheRepository.findByHash(urlHash);
			if (cached?.summary) {
				return {
					url: cached.url,
					kind: cached.kind,
					summary: JSON.parse(cached.summary) as InspirationSummary,
					status: "cached",
				};
			}

			// Check Apify key availability
			const settings = await this.researchService.getSettings(workspaceId);
			if (!settings?.hasApifyKey) {
				this.logger.warn("No Apify key for URL inspiration, using fallback", {
					workspaceId,
					url,
				});
				return this.fallbackFetch(workspaceId, url, kind.type, urlHash, userId);
			}

			const apiKey = await this.researchService.getRawApifyKey(workspaceId);
			if (!apiKey) {
				return this.fallbackFetch(workspaceId, url, kind.type, urlHash, userId);
			}

			// Run Apify actor
			const { actorId, input } = buildActorInput(kind);
			let rawData: unknown = null;
			try {
				const { runId } = await this.apifyProvider.runActor(actorId, input, apiKey);
				const deadline = Date.now() + APIFY_WAIT_SECONDS * 1000;
				while (Date.now() < deadline) {
					const status = await this.apifyProvider.getRunStatus(runId, apiKey);
					if (status.status === "SUCCEEDED") {
						const results = await this.apifyProvider.getRunResults(runId, apiKey);
						rawData = results[0] ?? null;
						break;
					}
					if (["FAILED", "ABORTED", "TIMED-OUT"].includes(status.status)) {
						throw new Error(`Apify run ${status.status}`);
					}
					await new Promise((resolve) => setTimeout(resolve, APIFY_POLL_INTERVAL_MS));
				}
				if (!rawData) throw new Error("Apify run timeout");
			} catch (err) {
				this.logger.warn("Apify scrape failed, using fallback", {
					url,
					error: err instanceof Error ? err.message : String(err),
				});
				return this.fallbackFetch(workspaceId, url, kind.type, urlHash, userId);
			}

			// Summarize with Gemini + log the AI call
			const summary = await this.summarizeAndLog(workspaceId, url, rawData, userId);

			// Cache
			await this.cacheRepository.upsert({
				urlHash,
				url: normalizeUrl(url),
				kind: kind.type,
				rawData,
				summary: JSON.stringify(summary),
				expiresAt: new Date(Date.now() + CACHE_TTL_MS),
			});

			return { url, kind: kind.type, summary, status: "scraped" };
		} catch (err) {
			this.logger.warn("URL inspiration failed", {
				url,
				error: err instanceof Error ? err.message : String(err),
			});
			return {
				url,
				kind: "website",
				summary: null,
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	async getInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]> {
		if (!prompt) return [];
		const matches = prompt.match(URL_REGEX) ?? [];
		const urls = Array.from(new Set(matches)).slice(0, MAX_URLS_PER_PROMPT);
		if (urls.length === 0) return [];

		const results = await Promise.all(
			urls.map((url) => this.getInspiration(workspaceId, url, userId)),
		);
		return results;
	}

	private async summarizeAndLog(
		workspaceId: string,
		url: string,
		rawData: unknown,
		userId?: string,
	): Promise<InspirationSummary> {
		const startTime = Date.now();
		try {
			const summary = await this.summarizer.summarizeInspiration(rawData);
			const durationMs = Date.now() - startTime;

			// Log to AiProviderLog for token tracking + dispute resolution
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "url_inspiration",
					provider: process.env.AI_PROVIDER || "unknown",
					userId,
					systemPrompt: this.summarizer.lastPrompts?.systemPrompt ?? "",
					userPrompt: this.summarizer.lastPrompts?.userPrompt ?? `URL: ${url}`,
				},
				{
					responseText: this.summarizer.lastResponseText ?? undefined,
					responseJson: summary,
					inputTokens: this.summarizer.lastUsage?.inputTokens,
					outputTokens: this.summarizer.lastUsage?.outputTokens,
					durationMs,
					status: "success",
				},
			);

			return summary;
		} catch (err) {
			const durationMs = Date.now() - startTime;
			const message = err instanceof Error ? err.message : String(err);

			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "url_inspiration",
					provider: process.env.AI_PROVIDER || "unknown",
					userId,
					systemPrompt: this.summarizer.lastPrompts?.systemPrompt ?? "",
					userPrompt: this.summarizer.lastPrompts?.userPrompt ?? `URL: ${url}`,
				},
				{
					responseText: this.summarizer.lastResponseText ?? undefined,
					durationMs,
					status: "error",
					errorMessage: message,
				},
			);

			throw err;
		}
	}

	private async fallbackFetch(
		workspaceId: string,
		url: string,
		kindType: string,
		urlHash: string,
		userId?: string,
	): Promise<InspirationResult> {
		try {
			const response = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
					"Accept-Language": "en-US,en;q=0.9",
				},
				signal: AbortSignal.timeout(FALLBACK_FETCH_TIMEOUT_MS),
				redirect: "follow",
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const html = await response.text();
			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/&nbsp;/g, " ")
				.replace(/&amp;/g, "&")
				.replace(/&lt;/g, "<")
				.replace(/&gt;/g, ">")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, FALLBACK_MAX_CHARS);
			if (!text) throw new Error("Empty text extracted");

			const summary = await this.summarizeAndLog(
				workspaceId,
				url,
				{ url, text, fallback: true },
				userId,
			);

			await this.cacheRepository.upsert({
				urlHash,
				url: normalizeUrl(url),
				kind: kindType,
				rawData: { url, text, fallback: true },
				summary: JSON.stringify(summary),
				expiresAt: new Date(Date.now() + CACHE_TTL_MS),
			});

			return { url, kind: kindType, summary, status: "fallback" };
		} catch (err) {
			return {
				url,
				kind: kindType,
				summary: null,
				status: "failed",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
