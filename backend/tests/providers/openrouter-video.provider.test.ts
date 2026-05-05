import { describe, expect, it, mock } from "bun:test";
import { OpenRouterVideoAnalyzerProvider } from "../../src/providers/openrouter-video.provider";

// Minimal mock of MinioStorageProvider — only the methods we actually call.
function makeMockMinio(publicUrl: string, signedUrl?: string) {
	return {
		upload: mock(async (_bucket: string, _key: string, _data: Buffer, _contentType: string) => {
			return publicUrl;
		}),
		getUrl: mock((_bucket: string, _key: string) => publicUrl),
		getSignedUrl: mock(async (_bucket: string, _key: string, _ttlSeconds: number) => {
			return signedUrl ?? publicUrl;
		}),
		delete: mock(async (_bucket: string, _key: string) => {}),
	} as any;
}

const BUCKET = "test-bucket";

describe("OpenRouterVideoAnalyzerProvider", () => {
	describe("analyzeVideo", () => {
		it("uploads bytes to MinIO, sends signed URL as video_url to OpenRouter, returns parsed analysis, and deletes the object", async () => {
			const SIGNED_URL = "https://minio.example.com/test-bucket/video-123.mp4?X-Amz-Signature=abc";
			const minio = makeMockMinio(
				"https://minio.example.com/test-bucket/video-123.mp4",
				SIGNED_URL,
			);

			const analysisJson = JSON.stringify({
				hook: "bold opening",
				retentionMechanisms: ["text overlays", "quick cuts"],
				pacingNotes: "fast",
				onScreenText: ["Buy now"],
				audioStyle: "upbeat",
				whyItWentViral: "relatable",
				ctaAnalysis: "strong CTA",
			});

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: analysisJson } }],
						usage: { prompt_tokens: 100, completion_tokens: 30 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"test-key",
				"google/gemini-2.5-flash",
				minio,
				BUCKET,
				fetchMock as any,
			);

			const result = await provider.analyzeVideo({
				bytes: new Uint8Array([1, 2, 3, 4]),
				mimeType: "video/mp4",
				instructions: "analyze this video",
			});

			// MinIO upload was called once with the correct content type.
			expect(minio.upload).toHaveBeenCalledTimes(1);
			const uploadCall = (minio.upload.mock.calls as unknown as Array<[string, string, Buffer, string]>)[0];
			expect(uploadCall[0]).toBe(BUCKET);
			expect(uploadCall[3]).toBe("video/mp4");

			// getSignedUrl was called with the correct bucket and key.
			expect(minio.getSignedUrl).toHaveBeenCalledTimes(1);
			const signedUrlCall = (minio.getSignedUrl.mock.calls as unknown as Array<[string, string, number]>)[0];
			expect(signedUrlCall[0]).toBe(BUCKET);
			expect(signedUrlCall[1]).toMatch(/^competitor-videos\//);

			// Fetch was called once to OpenRouter.
			expect(fetchMock).toHaveBeenCalledTimes(1);

			// The request body contained a video_url pointing at the SIGNED URL (not public URL).
			const init = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
			const body = JSON.parse(init.body as string);
			const systemMsg = body.messages.find((m: any) => m.role === "system");
			expect(systemMsg).toBeDefined();
			const userMsg = body.messages.find((m: any) => m.role === "user");
			expect(userMsg).toBeDefined();
			const videoPart = (userMsg.content as any[]).find((p: any) => p.type === "video_url");
			expect(videoPart).toBeDefined();
			expect(videoPart.video_url.url).toBe(SIGNED_URL);

			// MinIO delete was called after successful analysis.
			expect(minio.delete).toHaveBeenCalledTimes(1);
			const deleteCall = (minio.delete.mock.calls as unknown as Array<[string, string]>)[0];
			expect(deleteCall[0]).toBe(BUCKET);
			expect(deleteCall[1]).toMatch(/^competitor-videos\//);

			// Result matches the VideoAnalysisResult shape.
			expect(result.analysis.hook).toBe("bold opening");
			expect(result.analysis.retentionMechanisms).toEqual(["text overlays", "quick cuts"]);
			expect(result.usage.inputTokens).toBe(100);
			expect(result.usage.outputTokens).toBe(30);
			expect(typeof result.systemPrompt).toBe("string");
			expect(result.userPrompt).toBe("analyze this video");
		});

		it("forwards the signed URL (not the public URL) to OpenRouter as video_url", async () => {
			const SIGNED_URL = "https://minio.example.com/bucket/vid.mp4?X-Amz-Signature=presigned";
			const minio = makeMockMinio("https://minio.example.com/bucket/vid.mp4", SIGNED_URL);

			const analysisJson = JSON.stringify({
				hook: "h",
				retentionMechanisms: [],
				pacingNotes: "p",
				onScreenText: [],
				audioStyle: "a",
				whyItWentViral: "w",
				ctaAnalysis: "c",
			});

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: analysisJson } }],
						usage: { prompt_tokens: 10, completion_tokens: 5 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await provider.analyzeVideo({
				bytes: new Uint8Array([0]),
				mimeType: "video/mp4",
				instructions: "describe",
			});

			const init = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
			const body = JSON.parse(init.body as string);
			const userMsg = body.messages.find((m: any) => m.role === "user");
			const videoPart = (userMsg.content as any[]).find((p: any) => p.type === "video_url");
			// Must be the signed URL, not the plain public URL.
			expect(videoPart.video_url.url).toBe(SIGNED_URL);
			expect(videoPart.video_url.url).toContain("X-Amz-Signature");
		});

		it("calls minio.delete even when the OpenRouter call fails (cleanup on error)", async () => {
			const minio = makeMockMinio("https://minio.example.com/bucket/vid.mp4");

			const fetchMock = mock(
				async () =>
					new Response(JSON.stringify({ error: { message: "Service Unavailable" } }), {
						status: 503,
					}),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await expect(
				provider.analyzeVideo({
					bytes: new Uint8Array([0]),
					mimeType: "video/mp4",
					instructions: "describe",
				}),
			).rejects.toThrow(/temporary/i);

			// Delete must still be called despite the OpenRouter error.
			expect(minio.delete).toHaveBeenCalledTimes(1);
			const deleteCall = (minio.delete.mock.calls as unknown as Array<[string, string]>)[0];
			expect(deleteCall[0]).toBe(BUCKET);
			expect(deleteCall[1]).toMatch(/^competitor-videos\//);
		});

		it("returns guarded usage when usage field is absent", async () => {
			const minio = makeMockMinio("https://minio.example.com/test-bucket/video.mp4");

			const analysisJson = JSON.stringify({
				hook: "h",
				retentionMechanisms: [],
				pacingNotes: "p",
				onScreenText: [],
				audioStyle: "a",
				whyItWentViral: "w",
				ctaAnalysis: "c",
			});

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: analysisJson } }],
						// no usage field
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			const result = await provider.analyzeVideo({
				bytes: new Uint8Array([0]),
				mimeType: "video/mp4",
				instructions: "describe",
			});

			expect(result.usage.inputTokens).toBe(0);
			expect(result.usage.outputTokens).toBe(0);
		});

		it("throws an explicit error when response content is not parseable JSON", async () => {
			const minio = makeMockMinio("https://minio.example.com/test-bucket/video.mp4");

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: "not json at all" } }],
						usage: { prompt_tokens: 5, completion_tokens: 5 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await expect(
				provider.analyzeVideo({
					bytes: new Uint8Array([0]),
					mimeType: "video/mp4",
					instructions: "describe",
				}),
			).rejects.toThrow(/parse/i);
		});

		it("throws OpenRouterApiError with friendly message on non-2xx response", async () => {
			const minio = makeMockMinio("https://minio.example.com/test-bucket/video.mp4");

			const fetchMock = mock(
				async () =>
					new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await expect(
				provider.analyzeVideo({
					bytes: new Uint8Array([0]),
					mimeType: "video/mp4",
					instructions: "describe",
				}),
			).rejects.toThrow(/invalid or expired/i);
		});

		it("throws when response choices are empty", async () => {
			const minio = makeMockMinio("https://minio.example.com/test-bucket/video.mp4");

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [],
						usage: { prompt_tokens: 0, completion_tokens: 0 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await expect(
				provider.analyzeVideo({
					bytes: new Uint8Array([0]),
					mimeType: "video/mp4",
					instructions: "describe",
				}),
			).rejects.toThrow(/empty/i);
		});
	});

	describe("analyzeVideoFromUri", () => {
		it("sends the video URI directly as video_url without uploading to MinIO", async () => {
			const minio = makeMockMinio("https://minio.example.com/bucket/v.mp4");

			const analysisJson = JSON.stringify({
				hook: "hook",
				retentionMechanisms: ["rm"],
				pacingNotes: "pacing",
				onScreenText: [],
				audioStyle: "audio",
				whyItWentViral: "viral",
				ctaAnalysis: "cta",
			});

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: analysisJson } }],
						usage: { prompt_tokens: 50, completion_tokens: 20 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			const result = await provider.analyzeVideoFromUri({
				videoUri: "https://cdn.example.com/my-video.mp4",
				mimeType: "video/mp4",
				instructions: "describe this video",
			});

			// MinIO upload must NOT be called — URI is passed through directly.
			expect(minio.upload).not.toHaveBeenCalled();

			// The video_url should be the original URI.
			const init = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
			const body = JSON.parse(init.body as string);
			const userMsg = body.messages.find((m: any) => m.role === "user");
			const videoPart = (userMsg.content as any[]).find((p: any) => p.type === "video_url");
			expect(videoPart.video_url.url).toBe("https://cdn.example.com/my-video.mp4");

			expect(result.analysis.hook).toBe("hook");
			expect(result.usage.inputTokens).toBe(50);
		});
	});

	describe("generateScripts", () => {
		it("generates scripts from video analyses without any MinIO interaction", async () => {
			const minio = makeMockMinio("https://minio.example.com/bucket/v.mp4");

			const scriptsJson = JSON.stringify([
				{
					scriptNumber: 1,
					title: "Script A",
					hook: "open strong",
					body: "body content",
					broll: [{ scene: "exterior", description: "wide shot" }],
					cta: "follow us",
				},
			]);

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: scriptsJson } }],
						usage: { prompt_tokens: 200, completion_tokens: 80 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			const result = await provider.generateScripts({
				brandContext: "A fitness brand",
				analysisInstructions: "focus on hooks",
				outputPreferences: "punchy short scripts",
				videoAnalyses: [
					{
						caption: "trending fitness video",
						viewCount: 1_000_000,
						analysis: {
							hook: "energetic",
							retentionMechanisms: ["quick cuts"],
							pacingNotes: "fast",
							onScreenText: ["Subscribe!"],
							audioStyle: "upbeat",
							whyItWentViral: "relatable",
							ctaAnalysis: "strong",
						},
					},
				],
			});

			expect(minio.upload).not.toHaveBeenCalled();
			expect(result.scripts).toHaveLength(1);
			expect(result.scripts[0].scriptNumber).toBe(1);
			expect(result.scripts[0].hook).toBe("open strong");
			expect(result.usage.inputTokens).toBe(200);
			expect(result.usage.outputTokens).toBe(80);
			expect(typeof result.systemPrompt).toBe("string");
			expect(typeof result.userPrompt).toBe("string");
		});

		it("throws an explicit parse error when script response is not valid JSON", async () => {
			const minio = makeMockMinio("https://minio.example.com/bucket/v.mp4");

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: "definitely not json" } }],
						usage: { prompt_tokens: 5, completion_tokens: 5 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			await expect(
				provider.generateScripts({
					brandContext: "brand",
					analysisInstructions: "instruct",
					outputPreferences: "prefs",
					videoAnalyses: [],
				}),
			).rejects.toThrow(/parse/i);
		});
	});

	describe("lastUsage", () => {
		it("is null before any call and reflects the last successful call", async () => {
			const minio = makeMockMinio("https://minio.example.com/bucket/v.mp4");

			const analysisJson = JSON.stringify({
				hook: "h",
				retentionMechanisms: [],
				pacingNotes: "p",
				onScreenText: [],
				audioStyle: "a",
				whyItWentViral: "w",
				ctaAnalysis: "c",
			});

			const fetchMock = mock(async () =>
				new Response(
					JSON.stringify({
						choices: [{ message: { content: analysisJson } }],
						usage: { prompt_tokens: 42, completion_tokens: 7 },
					}),
				),
			);

			const provider = new OpenRouterVideoAnalyzerProvider(
				"key",
				"model",
				minio,
				BUCKET,
				fetchMock as any,
			);

			expect(provider.lastUsage).toBeNull();

			await provider.analyzeVideo({
				bytes: new Uint8Array([0]),
				mimeType: "video/mp4",
				instructions: "test",
			});

			expect(provider.lastUsage).toEqual({ inputTokens: 42, outputTokens: 7 });
		});
	});
});
