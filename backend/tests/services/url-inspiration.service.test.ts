import { beforeEach, describe, expect, it, mock } from "bun:test";
import { UrlInspirationService } from "../../src/services/url-inspiration.service";

// ─── Mocks ──────────────────────────────────────────────────────

class MockCacheRepository {
	rows = new Map<string, {
		urlHash: string;
		url: string;
		kind: string;
		rawData: unknown;
		summary: string | null;
		videoSummary: string | null;
		expiresAt: Date;
	}>();

	async findByHash(urlHash: string) {
		return this.rows.get(urlHash) ?? null;
	}
	async upsert(data: { urlHash: string; url: string; kind: string; rawData: unknown; summary: string | null; expiresAt: Date }) {
		const existing = this.rows.get(data.urlHash);
		this.rows.set(data.urlHash, {
			...data,
			videoSummary: existing?.videoSummary ?? null,
		});
	}
	async setVideoSummary(urlHash: string, videoSummary: string) {
		const row = this.rows.get(urlHash);
		if (row) row.videoSummary = videoSummary;
	}
	clear() {
		this.rows.clear();
	}
}

class MockApifyProvider {
	rawResult: any = { videoUrl: "https://cdn.example.com/v.mp4", videoDuration: 30 };
	async runActor() {
		return { runId: "fake-run" };
	}
	async getRunStatus() {
		return { status: "SUCCEEDED" as const };
	}
	async getRunResults() {
		return [this.rawResult];
	}
}

class MockResearchService {
	hasKey = true;
	async getSettings() {
		return { hasApifyKey: this.hasKey };
	}
	async getRawApifyKey() {
		return this.hasKey ? "fake-key" : null;
	}
}

class MockSummarizer {
	lastUsage = { inputTokens: 100, outputTokens: 50 };
	lastPrompts = { systemPrompt: "sys", userPrompt: "usr" };
	lastResponseText = "{}";
	async summarizeInspiration() {
		return { angle: "test angle", tone: "neutral", format: "Reel", keyPoints: ["a"] };
	}
}

class MockAiFactory {
	hasGemini = true;
	async getContentGenerator() {
		return new MockSummarizer();
	}
	async getSettings() {
		return { providers: { content: this.hasGemini ? "gemini" : "anthropic" } };
	}
}

class MockLogger {
	warn = mock(() => {});
	info = mock(() => {});
	error = mock(() => {});
	debug = mock(() => {});
}

const fetcherCalls: string[] = [];
const fakeVideoFetcher = async (url: string) => {
	fetcherCalls.push(url);
	const bytes = new Uint8Array(1024 * 1024 * 5); // 5 MB
	return { bytes, mimeType: "video/mp4" };
};

const analyzerCalls: { kind: "bytes" | "uri"; payload: any }[] = [];
const fakeAnalyzer = {
	analyzeVideo: async (params: any) => {
		analyzerCalls.push({ kind: "bytes", payload: params });
		return {
			analysis: { description: "video shows X" },
			usage: { inputTokens: 200, outputTokens: 100 },
			systemPrompt: "sys",
			userPrompt: "usr",
		};
	},
	analyzeVideoFromUri: async (params: any) => {
		analyzerCalls.push({ kind: "uri", payload: params });
		return {
			analysis: { description: "youtube video shows Y" },
			usage: { inputTokens: 150, outputTokens: 80 },
			systemPrompt: "sys",
			userPrompt: "usr",
		};
	},
	generateScripts: async (_params: any) => {
		return { scripts: [], usage: { inputTokens: 0, outputTokens: 0 }, systemPrompt: "", userPrompt: "" };
	},
};
const fakeBuildAnalyzer = async () => fakeAnalyzer;

const fakePrismaStub = {
	aiProviderLog: { create: async () => ({}) },
} as any;

function buildService(opts: {
	capMb?: number;
	capSeconds?: number;
	geminiAvailable?: boolean;
	apifyResult?: any;
} = {}) {
	const cache = new MockCacheRepository();
	const apify = new MockApifyProvider();
	if (opts.apifyResult !== undefined) apify.rawResult = opts.apifyResult;
	const research = new MockResearchService();
	const aiFactory = new MockAiFactory();
	if (opts.geminiAvailable === false) aiFactory.hasGemini = false;
	const logger = new MockLogger();

	const service = new UrlInspirationService(
		fakePrismaStub,
		apify as any,
		research as any,
		aiFactory as any,
		cache as any,
		logger as any,
		fakeVideoFetcher,
		fakeBuildAnalyzer as any,
		{
			maxMb: opts.capMb ?? 100,
			maxDurationSeconds: opts.capSeconds ?? 300,
		},
	);

	return { service, cache, apify, aiFactory, logger };
}

// Reset between tests
beforeEach(() => {
	fetcherCalls.length = 0;
	analyzerCalls.length = 0;
});

// ─── Tests ─────────────────────────────────────────────────────

describe("UrlInspirationService.enrichWithVideo", () => {
	it("skips video stage when extractMedia returns null", async () => {
		const { service } = buildService({ apifyResult: { title: "page", text: "some article" } });
		const result = await service.enrichWithVideo("ws-1", "https://example.com/article");
		expect(result.media).toBeUndefined();
		expect(analyzerCalls).toHaveLength(0);
		expect(fetcherCalls).toHaveLength(0);
	});

	it("YouTube path: calls analyzeVideoFromUri, never videoFetcher or analyzeVideo", async () => {
		const { service } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(fetcherCalls).toHaveLength(0);
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("uri");
		expect(analyzerCalls[0].payload.videoUri).toBe("https://www.youtube.com/watch?v=abc");
	});

	it("bytes path: calls videoFetcher and analyzeVideo for non-YouTube hosts", async () => {
		const { service } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(fetcherCalls).toHaveLength(1);
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("bytes");
	});

	it("size cap exceeded: skips video, returns mediaSkipped", async () => {
		const { service } = buildService({ capMb: 1 }); // 1 MB cap, fetcher returns 5 MB
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("size cap exceeded");
		expect(result.media?.skipped?.capMb).toBe(1);
	});

	it("duration cap exceeded: skips video, returns mediaSkipped", async () => {
		const { service } = buildService({ capSeconds: 10 }); // 10 s cap, mock duration is 30 s
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("duration cap exceeded");
		expect(result.media?.skipped?.capSeconds).toBe(10);
	});

	it("YouTube duration cap exceeded: same reason but no fetcher call", async () => {
		const { service } = buildService({ capSeconds: 10 });
		const result = await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(fetcherCalls).toHaveLength(0);
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("duration cap exceeded");
	});

	it("size cap is not enforced on YouTube path", async () => {
		const { service } = buildService({ capMb: 1 });
		const result = await service.enrichWithVideo("ws-1", "https://www.youtube.com/watch?v=abc");
		expect(analyzerCalls).toHaveLength(1);
		expect(analyzerCalls[0].kind).toBe("uri");
		expect(result.media?.skipped).toBeUndefined();
	});

	it("caches videoSummary; second call returns cached without re-analysis", async () => {
		const { service, cache } = buildService();
		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		const callsAfterFirst = analyzerCalls.length;

		await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(callsAfterFirst); // no additional analyzer call
		expect(cache.rows.size).toBe(1);
	});

	it("caps set to 0: video stage entirely skipped", async () => {
		const { service } = buildService({ capMb: 0, capSeconds: 0 });
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(fetcherCalls).toHaveLength(0);
		expect(result.media).toBeUndefined();
	});

	it("workspace has no Gemini provider: skips with reason", async () => {
		const { service } = buildService({ geminiAvailable: false });
		const result = await service.enrichWithVideo("ws-1", "https://www.tiktok.com/@x/video/1");
		expect(analyzerCalls).toHaveLength(0);
		expect(result.media?.skipped?.reason).toBe("video analysis requires Gemini");
	});
});
