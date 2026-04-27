import { FileState, GoogleGenAI } from "@google/genai";
import type {
	IVideoAnalyzer,
	VideoAnalyzerUsage,
} from "../interfaces/providers/video-analyzer.interface";
import type {
	GeneratedScript,
	VideoAnalysisResult,
} from "../types/competitor-analyzer.types";

const FILE_UPLOAD_ACTIVE_TIMEOUT_MS = 90_000;
const VIDEO_ANALYSIS_TIMEOUT_MS = 3 * 60 * 1000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function parseJson(text: string): unknown {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
	else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
	if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
	return JSON.parse(cleaned.trim());
}

export class GeminiVideoAnalyzerProvider implements IVideoAnalyzer {
	public lastUsage: VideoAnalyzerUsage | null = null;

	private ai: GoogleGenAI;
	private model: string;

	constructor(apiKey: string, model: string) {
		this.ai = new GoogleGenAI({ apiKey });
		this.model = model;
	}

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

		// 1. Upload the video bytes as a Blob to Gemini Files API.
		const file = await this.ai.files.upload({
			file: new Blob([bytes.slice()], { type: mimeType }),
			config: { mimeType },
		});
		const fileName = file.name!;

		try {
			// 2. Poll until state is ACTIVE (or timeout/failure).
			const startPoll = Date.now();
			let fileState = file.state;
			while (fileState !== FileState.ACTIVE) {
				if (Date.now() - startPoll > FILE_UPLOAD_ACTIVE_TIMEOUT_MS) {
					throw new Error("Gemini file did not become ACTIVE within 90s");
				}
				await sleep(2000);
				const polled = await this.ai.files.get({ name: fileName });
				fileState = polled.state;
				if (fileState === FileState.FAILED) {
					throw new Error("Gemini file processing FAILED");
				}
			}

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

			// 3. Generate analysis using the uploaded file reference.
			const result = await Promise.race([
				this.ai.models.generateContent({
					model: this.model,
					contents: [
						{
							role: "user",
							parts: [
								{ fileData: { mimeType, fileUri: file.uri! } },
								{ text: `${systemPrompt}\n\n${userPrompt}` },
							],
						},
					],
				}),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Gemini analysis timed out")),
						VIDEO_ANALYSIS_TIMEOUT_MS,
					),
				),
			]);

			const text = result.text ?? "";
			const analysis = parseJson(text) as VideoAnalysisResult;

			const usage: VideoAnalyzerUsage = {
				inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
				outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
			};
			this.lastUsage = usage;

			return { analysis, usage, systemPrompt, userPrompt };
		} finally {
			// 4. Always delete the uploaded file to avoid storage bloat.
			try {
				await this.ai.files.delete({ name: fileName });
			} catch {
				/* ignore cleanup errors */
			}
		}
	}

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
		const { videoUri, mimeType, instructions } = params;

		const systemPrompt =
			"You are a video analysis assistant. Watch the video and produce structured JSON.";
		const userPrompt = instructions;

		const response = await this.ai.models.generateContent({
			model: this.model,
			contents: [
				{
					parts: [
						{ text: instructions },
						{
							fileData: {
								fileUri: videoUri,
								...(mimeType ? { mimeType } : {}),
							},
						},
					],
				},
			],
			config: { temperature: 0.3, responseMimeType: "application/json" },
		});

		const text = response.text ?? "";
		const usage: VideoAnalyzerUsage = {
			inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastUsage = usage;

		const analysis = parseJson(text) as VideoAnalysisResult;
		return {
			analysis,
			usage,
			systemPrompt,
			userPrompt,
		};
	}

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

		const result = await this.ai.models.generateContent({
			model: this.model,
			contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
		});

		const text = result.text ?? "";
		const scripts = parseJson(text) as GeneratedScript[];

		const usage: VideoAnalyzerUsage = {
			inputTokens: result.usageMetadata?.promptTokenCount ?? 0,
			outputTokens: result.usageMetadata?.candidatesTokenCount ?? 0,
		};
		this.lastUsage = usage;

		return { scripts, usage, systemPrompt, userPrompt };
	}
}
