import { OpenRouterApiError } from "../errors/openrouter-api-error";
import type {
	IVideoAnalyzer,
	VideoAnalyzerUsage,
} from "../interfaces/providers/video-analyzer.interface";
import type { GeneratedScript, VideoAnalysisResult } from "../types/competitor-analyzer.types";
import type { MinioStorageProvider } from "./minio.provider";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
// 3-minute timeout — video analysis models are slow (30–120s is common).
const REQUEST_TIMEOUT_MS = 3 * 60 * 1000;
// Signed URL TTL: 30 minutes — enough for analysis to complete + cleanup.
const SIGNED_URL_TTL_SECONDS = 30 * 60;

interface ChatCompletionResponse {
	choices: Array<{ message: { content?: string } }>;
	usage?: { prompt_tokens: number; completion_tokens: number };
}

type VideoUrlPart = { type: "video_url"; video_url: { url: string } };
type TextPart = { type: "text"; text: string };
type ContentPart = VideoUrlPart | TextPart;

function parseJsonResponse(text: string): unknown {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) {
		cleaned = cleaned.slice(7);
	} else if (cleaned.startsWith("```")) {
		cleaned = cleaned.slice(3);
	}
	if (cleaned.endsWith("```")) {
		cleaned = cleaned.slice(0, -3);
	}
	return JSON.parse(cleaned.trim());
}

export class OpenRouterVideoAnalyzerProvider implements IVideoAnalyzer {
	public lastUsage: VideoAnalyzerUsage | null = null;

	constructor(
		private apiKey: string,
		private model: string,
		private minio: MinioStorageProvider,
		private bucket: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	// ─── Private helpers ──────────────────────────────────────────────────────

	/**
	 * POST to OpenRouter /chat/completions with a system-role message and user
	 * content. Returns the content string from the first choice.
	 * Throws on non-2xx, empty content, or network timeout.
	 */
	private async callOpenRouter(
		systemPrompt: string,
		userContent: string | ContentPart[],
	): Promise<string> {
		const messages = [
			{ role: "system" as const, content: systemPrompt },
			{ role: "user" as const, content: userContent },
		];

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		let response: Response;
		try {
			response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({ model: this.model, messages }),
				signal: controller.signal,
			});
		} finally {
			clearTimeout(timer);
		}

		if (!response.ok) {
			throw await OpenRouterApiError.fromResponse(response);
		}

		const json = (await response.json()) as ChatCompletionResponse;

		// Guard usage — the field may be absent in some OpenRouter responses.
		this.lastUsage = json.usage
			? {
					inputTokens: json.usage.prompt_tokens,
					outputTokens: json.usage.completion_tokens,
				}
			: { inputTokens: 0, outputTokens: 0 };

		const content = json.choices[0]?.message?.content;
		if (!content) {
			const snippet = JSON.stringify(json).slice(0, 500);
			throw new Error(
				`OpenRouterVideoAnalyzerProvider: empty or missing content in response (truncated): ${snippet}`,
			);
		}

		return content;
	}

	// ─── IVideoAnalyzer ───────────────────────────────────────────────────────

	/**
	 * Uploads `bytes` to MinIO, obtains the public URL, then sends the URL to
	 * OpenRouter as a `video_url` content part. Cleans up the uploaded object
	 * after analysis (best-effort).
	 */
	async analyzeVideo(params: {
		bytes: Uint8Array;
		mimeType: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const { bytes, mimeType, instructions } = params;

		// 1. Upload video bytes to MinIO.
		const key = `competitor-videos/${Date.now()}-${Math.random().toString(36).slice(2)}.${mimeType.split("/")[1] ?? "mp4"}`;
		await this.minio.upload(this.bucket, key, Buffer.from(bytes), mimeType);

		try {
			// 2. Get a short-lived signed URL so OpenRouter can fetch the video
			//    without requiring a world-readable bucket policy.
			const signedUrl = await this.minio.getSignedUrl(this.bucket, key, SIGNED_URL_TTL_SECONDS);

			// 3. Build prompts.
			const systemPrompt = [
				"You are an expert social media video analyst.",
				"Analyze the uploaded video and respond with STRICT JSON matching the schema:",
				"{",
				'  "hook": string,',
				'  "retentionMechanisms": string[],',
				'  "pacingNotes": string,',
				'  "onScreenText": string[],',
				'  "audioStyle": string,',
				'  "whyItWentViral": string,',
				'  "ctaAnalysis": string',
				"}",
				"Do not include explanations outside the JSON. No markdown.",
			].join("\n");

			const userPrompt = instructions;

			// 4. Send to OpenRouter with video_url + text in user content.
			const userContent: ContentPart[] = [
				{ type: "video_url", video_url: { url: signedUrl } },
				{ type: "text", text: userPrompt },
			];

			const text = await this.callOpenRouter(systemPrompt, userContent);

			// 4. Parse response — throw explicitly with raw text on failure.
			let analysis: VideoAnalysisResult;
			try {
				analysis = parseJsonResponse(text) as VideoAnalysisResult;
			} catch (_err) {
				throw new Error(
					`OpenRouterVideoAnalyzerProvider: failed to parse video analysis response as JSON. Raw: ${text}`,
				);
			}

			const usage = this.lastUsage ?? { inputTokens: 0, outputTokens: 0 };
			return { analysis, usage, systemPrompt, userPrompt };
		} finally {
			// 5. Best-effort cleanup — don't let delete errors surface to the caller.
			try {
				await this.minio.delete(this.bucket, key);
			} catch {
				/* ignore cleanup errors */
			}
		}
	}

	/**
	 * Sends the video URI directly to OpenRouter as a `video_url` without
	 * uploading to MinIO — suitable for CDN/YouTube URLs that OpenRouter can
	 * fetch server-side.
	 */
	async analyzeVideoFromUri(params: {
		videoUri: string;
		mimeType?: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const { videoUri, instructions } = params;

		const systemPrompt =
			"You are a video analysis assistant. Watch the video and produce structured JSON.";
		const userPrompt = instructions;

		const userContent: ContentPart[] = [
			{ type: "video_url", video_url: { url: videoUri } },
			{ type: "text", text: userPrompt },
		];

		const text = await this.callOpenRouter(systemPrompt, userContent);

		let analysis: VideoAnalysisResult;
		try {
			analysis = parseJsonResponse(text) as VideoAnalysisResult;
		} catch (_err) {
			throw new Error(
				`OpenRouterVideoAnalyzerProvider: failed to parse video-from-uri analysis response as JSON. Raw: ${text}`,
			);
		}

		const usage = this.lastUsage ?? { inputTokens: 0, outputTokens: 0 };
		return { analysis, usage, systemPrompt, userPrompt };
	}

	/**
	 * Pure text call to OpenRouter — generates scripts from previously analysed
	 * video data. No MinIO interaction required.
	 */
	async generateScripts(params: {
		brandContext: string;
		analysisInstructions: string;
		outputPreferences: string;
		videoAnalyses: Array<{
			caption: string | null;
			viewCount: number | null;
			analysis: VideoAnalysisResult;
		}>;
	}): Promise<{
		scripts: GeneratedScript[];
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		const systemPrompt = [
			"You are a senior creative strategist writing short-form social video scripts.",
			"Based on the competitor video analyses provided, generate scripts that match the brand context and output preferences.",
			"Respond with STRICT JSON array matching the schema:",
			"[{",
			'  "scriptNumber": number,',
			'  "title": string,',
			'  "hook": string,',
			'  "body": string,',
			'  "broll": [{"scene": string, "description": string}],',
			'  "cta": string',
			"}]",
			"No markdown, no prose outside the JSON.",
		].join("\n");

		const videoBlock = params.videoAnalyses
			.map(
				(v, i) =>
					`Video ${i + 1}: caption="${v.caption ?? ""}", views=${v.viewCount ?? "?"}\n` +
					`Analysis: ${JSON.stringify(v.analysis, null, 2)}`,
			)
			.join("\n\n---\n\n");

		const userPrompt = [
			`Brand Context: ${params.brandContext}`,
			`Analysis Instructions: ${params.analysisInstructions}`,
			`Output Preferences: ${params.outputPreferences}`,
			"",
			"Competitor video analyses:",
			videoBlock,
		].join("\n");

		const text = await this.callOpenRouter(systemPrompt, userPrompt);

		let scripts: GeneratedScript[];
		try {
			scripts = parseJsonResponse(text) as GeneratedScript[];
		} catch (_err) {
			throw new Error(
				`OpenRouterVideoAnalyzerProvider: failed to parse script generation response as JSON. Raw: ${text}`,
			);
		}

		const usage = this.lastUsage ?? { inputTokens: 0, outputTokens: 0 };
		return { scripts, usage, systemPrompt, userPrompt };
	}
}
