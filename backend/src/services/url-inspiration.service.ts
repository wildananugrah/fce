import type { PrismaClient } from "@prisma/client";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type {
	IInspirationSummarizer,
	InspirationSummary,
} from "../interfaces/providers/inspiration-summarizer.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { IVideoAnalyzer } from "../interfaces/providers/video-analyzer.interface";
import type { IUrlScrapeCacheRepository } from "../interfaces/repositories/url-scrape-cache.repository.interface";
import type { IResearchService } from "../interfaces/services/research.service.interface";
import type {
	InspirationMedia,
	InspirationResult,
	IUrlInspirationService,
	MediaSkipped,
} from "../interfaces/services/url-inspiration.service.interface";
import type { MediaInfo } from "../providers/apify-parsers/types";
import type { AiProviderFactory } from "./ai-provider-factory.service";
import { logAiActivity } from "../utils/ai-activity-logger";
import { buildActorInput } from "../utils/apify-actor-inputs";
import { detectUrlKind, hashUrl, isDirectGeminiVideoUri, normalizeUrl } from "../utils/url-router";

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
		private aiFactory: AiProviderFactory,
		private cacheRepository: IUrlScrapeCacheRepository,
		private logger: ILogger,
		private videoFetcher: (url: string) => Promise<{ bytes: Uint8Array; mimeType: string }>,
		private buildVideoAnalyzer: (workspaceId: string) => Promise<IVideoAnalyzer>,
		private videoCaps: { maxMb: number; maxDurationSeconds: number },
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

	async enrichWithVideo(
		workspaceId: string,
		url: string,
		userId?: string,
	): Promise<InspirationResult> {
		// Always start from the base text-only flow. This populates the cache
		// row if it doesn't exist and gives us the metadata summary as the
		// fallback for any video-stage failure.
		const base = await this.getInspiration(workspaceId, url, userId);
		if (!base.summary) return base;

		const { maxMb, maxDurationSeconds } = this.videoCaps;
		// Caps both at 0 = feature disabled. Return base as-is, no media field.
		if (maxMb === 0 && maxDurationSeconds === 0) return base;

		// Look up cached row to check for an already-enriched videoSummary.
		const urlHash = await hashUrl(url);
		const cached = await this.cacheRepository.findByHash(urlHash);
		if (cached?.videoSummary) {
			return {
				...base,
				summary: JSON.parse(cached.videoSummary) as InspirationSummary,
				media: { hasVideo: true },
			};
		}

		// Resolve the video URL and duration. For YouTube, the input URL IS
		// the video URL — no need to consult the parser. For other hosts,
		// the parser extracts it from Apify metadata stored in cache.
		let videoUrl: string | undefined;
		let durationSeconds: number | undefined;

		if (isDirectGeminiVideoUri(url)) {
			videoUrl = url;
			const media = this.tryExtractMedia(cached?.rawData);
			durationSeconds = media?.durationSeconds;
		} else {
			const media = this.tryExtractMedia(cached?.rawData);
			if (!media) return base; // No video in this URL.
			videoUrl = media.videoUrl;
			durationSeconds = media.durationSeconds;
		}
		if (!videoUrl) return base;

		// Provider availability check — video analysis is Gemini-only.
		const settings = await this.aiFactory.getSettings(workspaceId);
		if (settings.providers.content !== "gemini") {
			return {
				...base,
				media: this.skipped("video analysis requires Gemini", { durationSeconds }),
			};
		}

		// Duration cap (applies to both paths if known).
		if (
			maxDurationSeconds > 0 &&
			durationSeconds !== undefined &&
			durationSeconds > maxDurationSeconds
		) {
			return {
				...base,
				media: this.skipped("duration cap exceeded", {
					durationSeconds,
					capSeconds: maxDurationSeconds,
				}),
			};
		}

		// Branch on YouTube vs bytes.
		try {
			const analyzer = await this.buildVideoAnalyzer(workspaceId);
			let analysisText: string;
			let sizeMb: number | undefined;

			if (isDirectGeminiVideoUri(videoUrl)) {
				const result = await analyzer.analyzeVideoFromUri({
					videoUri: videoUrl,
					instructions: this.videoInstructions(),
				});
				analysisText = JSON.stringify(result.analysis);
			} else {
				// Bytes path. Apply size cap after fetch.
				const { bytes, mimeType } = await this.videoFetcher(videoUrl);
				sizeMb = bytes.byteLength / (1024 * 1024);
				if (maxMb > 0 && sizeMb > maxMb) {
					return {
						...base,
						media: this.skipped("size cap exceeded", {
							sizeMb: Math.round(sizeMb * 10) / 10,
							capMb: maxMb,
							durationSeconds,
						}),
					};
				}
				const result = await analyzer.analyzeVideo({
					bytes,
					mimeType,
					instructions: this.videoInstructions(),
				});
				analysisText = JSON.stringify(result.analysis);
			}

			// Re-summarize with the video description merged in.
			const enriched = await this.summarizeAndLog(
				workspaceId,
				url,
				{ metadata: cached?.rawData, videoAnalysis: analysisText },
				userId,
			);

			await this.cacheRepository.setVideoSummary(urlHash, JSON.stringify(enriched));

			return {
				...base,
				summary: enriched,
				media: { hasVideo: true, durationSeconds, sizeMb },
			};
		} catch (err) {
			this.logger.warn("video inspiration failed, falling back to text-only", {
				url,
				error: err instanceof Error ? err.message : String(err),
			});
			return {
				...base,
				media: this.skipped("analysis failed", { durationSeconds }),
			};
		}
	}

	async enrichInspirationsFromPrompt(
		workspaceId: string,
		prompt: string | null | undefined,
		userId?: string,
	): Promise<InspirationResult[]> {
		if (!prompt) return [];
		const matches = prompt.match(URL_REGEX) ?? [];
		const urls = Array.from(new Set(matches)).slice(0, MAX_URLS_PER_PROMPT);
		if (urls.length === 0) return [];

		// SEQUENTIAL — bounds worst-case latency and avoids parallel Gemini
		// Files API uploads racing on quota.
		const results: InspirationResult[] = [];
		for (const url of urls) {
			results.push(await this.enrichWithVideo(workspaceId, url, userId));
		}
		return results;
	}

	private skipped(
		reason: MediaSkipped["reason"],
		extras: Partial<Omit<MediaSkipped, "reason">> = {},
	): InspirationMedia {
		return { hasVideo: true, skipped: { reason, ...extras } };
	}

	private videoInstructions(): string {
		return [
			"Watch the entire video and produce a JSON object with the following keys:",
			"  description: a 2-3 sentence summary of what happens in the video.",
			"  hook: how the video opens and grabs attention.",
			"  pacing: short notes on rhythm, cuts, pacing.",
			"  visualStyle: dominant visual elements (color, framing, motion).",
			"  audioNotes: music, voiceover, sound design hooks.",
			"  takeaway: the main thing a content creator could borrow from this video.",
			"Output ONLY the JSON object, no markdown or commentary.",
		].join("\n");
	}

	private tryExtractMedia(rawData: unknown): MediaInfo | null {
		// Inline shim — reads canonical Apify field names (videoUrl, videoDuration,
		// videoMeta.duration). Works because parsers pass raw items verbatim into
		// the cache. If/when a parser registry exists, swap to that.
		if (!rawData) return null;
		const item = rawData as Record<string, unknown>;
		const videoUrl = typeof item.videoUrl === "string" ? item.videoUrl : undefined;
		if (!videoUrl) return null;
		const duration =
			typeof item.videoDuration === "number"
				? Math.round(item.videoDuration)
				: typeof (item.videoMeta as Record<string, unknown> | undefined)?.duration === "number"
					? Math.round((item.videoMeta as Record<string, unknown>).duration as number)
					: undefined;
		return { videoUrl, durationSeconds: duration };
	}

	private async summarizeAndLog(
		workspaceId: string,
		url: string,
		rawData: unknown,
		userId?: string,
	): Promise<InspirationSummary> {
		// The content generator doubles as an inspiration summarizer on the
		// providers that implement IInspirationSummarizer (currently Gemini).
		// We cast here because not every generator implements it — a
		// workspace on Anthropic-only will get a runtime error matching the
		// pre-refactor behavior, which is acceptable for v1.
		const summarizer = (await this.aiFactory.getContentGenerator(
			workspaceId,
		)) as unknown as LoggableSummarizer;
		const providerName = (await this.aiFactory.getSettings(workspaceId)).providers.content;
		const startTime = Date.now();
		try {
			const summary = await summarizer.summarizeInspiration(rawData);
			const durationMs = Date.now() - startTime;

			// Log to AiProviderLog for token tracking + dispute resolution
			await logAiActivity(
				this.prisma,
				{
					workspaceId,
					generator: "url_inspiration",
					provider: providerName,
					userId,
					systemPrompt: summarizer.lastPrompts?.systemPrompt ?? "",
					userPrompt: summarizer.lastPrompts?.userPrompt ?? `URL: ${url}`,
				},
				{
					responseText: summarizer.lastResponseText ?? undefined,
					responseJson: summary,
					inputTokens: summarizer.lastUsage?.inputTokens,
					outputTokens: summarizer.lastUsage?.outputTokens,
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
					provider: providerName,
					userId,
					systemPrompt: summarizer.lastPrompts?.systemPrompt ?? "",
					userPrompt: summarizer.lastPrompts?.userPrompt ?? `URL: ${url}`,
				},
				{
					responseText: summarizer.lastResponseText ?? undefined,
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
