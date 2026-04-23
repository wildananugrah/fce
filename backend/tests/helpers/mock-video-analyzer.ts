import type {
	IVideoAnalyzer,
	VideoAnalyzerUsage,
} from "../../src/interfaces/providers/video-analyzer.interface";
import type {
	GeneratedScript,
	VideoAnalysisResult,
} from "../../src/types/competitor-analyzer.types";

export class MockVideoAnalyzer implements IVideoAnalyzer {
	public analyzeCalls: Array<{ instructions: string; byteCount: number }> = [];
	public generateCalls: Array<{ videoCount: number }> = [];
	public analyzeFail: "once" | "always" | null = null;
	public scriptsFail: boolean = false;
	public cannedAnalysis: VideoAnalysisResult | null = null;
	public cannedScripts: GeneratedScript[] = [];

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
		this.analyzeCalls.push({
			instructions: params.instructions,
			byteCount: params.bytes.byteLength,
		});
		if (this.analyzeFail === "always") throw new Error("video analysis failed");
		if (this.analyzeFail === "once") {
			this.analyzeFail = null;
			throw new Error("video analysis failed");
		}
		if (!this.cannedAnalysis) throw new Error("MockVideoAnalyzer.cannedAnalysis not set");
		return {
			analysis: this.cannedAnalysis,
			usage: { inputTokens: 100, outputTokens: 200 },
			systemPrompt: "system",
			userPrompt: params.instructions,
		};
	}

	async generateScripts(params: any): Promise<{
		scripts: GeneratedScript[];
		usage: VideoAnalyzerUsage;
		systemPrompt: string;
		userPrompt: string;
	}> {
		this.generateCalls.push({ videoCount: params.videoAnalyses.length });
		if (this.scriptsFail) throw new Error("script generation failed");
		return {
			scripts: this.cannedScripts,
			usage: { inputTokens: 300, outputTokens: 500 },
			systemPrompt: "system",
			userPrompt: "user",
		};
	}
}
