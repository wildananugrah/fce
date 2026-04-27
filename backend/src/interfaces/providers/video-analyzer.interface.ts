import type { VideoAnalysisResult, GeneratedScript } from "../../types/competitor-analyzer.types";

export interface VideoAnalyzerUsage {
	inputTokens: number;
	outputTokens: number;
}

export interface IVideoAnalyzer {
	/**
	 * Uploads `bytes` to Gemini's Files API, polls for ACTIVE, runs structured
	 * analysis, and deletes the file. Returns structured analysis.
	 *
	 * Throws on: download/upload errors, timeouts, malformed JSON response.
	 */
	analyzeVideo(params: {
		bytes: Uint8Array;
		mimeType: string;
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}>;

	/**
	 * Sends the video URL directly to Gemini as fileData.fileUri so the model
	 * fetches it server-side. Used for YouTube URLs in URL inspiration to skip
	 * the download + Files API upload roundtrip.
	 */
	analyzeVideoFromUri(params: {
		videoUri: string;
		mimeType?: string; // optional; YouTube URLs don't need it
		instructions: string;
	}): Promise<{
		analysis: VideoAnalysisResult;
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}>;

	/**
	 * One call that takes all prior analyses + the Config's brand context and
	 * generates a list of scripts.
	 */
	generateScripts(params: {
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
	}>;
}
