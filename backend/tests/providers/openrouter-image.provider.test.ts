import { describe, expect, it, mock } from "bun:test";
import { OpenRouterImageProvider } from "../../src/providers/openrouter-image.provider";

describe("OpenRouterImageProvider", () => {
	it("generate: extracts base64 image from response", async () => {
		const fakeResponse = {
			choices: [
				{
					message: {
						content: "Here is the image",
						images: [
							{
								type: "image_url",
								image_url: { url: "data:image/png;base64,abc123" },
							},
						],
					},
				},
			],
			usage: { prompt_tokens: 5, completion_tokens: 0 },
		};
		const fetchMock = mock(async () => new Response(JSON.stringify(fakeResponse)));
		const provider = new OpenRouterImageProvider(
			"key",
			"google/gemini-2.5-flash-image-preview",
			fetchMock as any,
		);

		const result = await provider.generate({ prompt: "a cat in a hat" });

		expect(result.imageBase64).toBe("abc123");
		expect(result.mimeType).toBe("image/png");
	});

	it("generate: includes aspectRatio hint in prompt when provided", async () => {
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								images: [
									{
										type: "image_url",
										image_url: { url: "data:image/jpeg;base64,xyz" },
									},
								],
							},
						},
					],
					usage: { prompt_tokens: 0, completion_tokens: 0 },
				}),
			),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await provider.generate({ prompt: "stylize", aspectRatio: "1:1" });

		const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
		const init = calls[0][1];
		const body = JSON.parse(init.body as string);
		const userContent = body.messages.find((m: any) => m.role === "user").content;
		// The prompt text should mention the aspect ratio
		const textPart: string = Array.isArray(userContent)
			? userContent.find((p: any) => p.type === "text")?.text ?? ""
			: userContent;
		expect(textPart).toContain("1:1");
	});

	it("generate: throws when response has no images", async () => {
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [{ message: { content: "no image here" } }],
					usage: { prompt_tokens: 0, completion_tokens: 0 },
				}),
			),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await expect(provider.generate({ prompt: "p" })).rejects.toThrow(/no image/i);
	});

	it("generate: handles missing usage gracefully", async () => {
		const fetchMock = mock(async () =>
			new Response(
				JSON.stringify({
					choices: [
						{
							message: {
								images: [
									{
										type: "image_url",
										image_url: { url: "data:image/png;base64,noUsage" },
									},
								],
							},
						},
					],
					// no usage field
				}),
			),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		const result = await provider.generate({ prompt: "test" });
		expect(result.imageBase64).toBe("noUsage");
	});

	it("generate: throws OpenRouterApiError with friendly message on non-2xx response", async () => {
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await expect(provider.generate({ prompt: "p" })).rejects.toThrow(/OpenRouter rejected the request/i);
	});

	it("downloads image from CDN URL when response is not a data URL", async () => {
		const cdnImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
		const fetchMock = mock(async (url: string) => {
			if (url === "https://openrouter.ai/api/v1/chat/completions") {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									images: [{ image_url: { url: "https://cdn.example.com/img.png" } }],
								},
							},
						],
					}),
				);
			}
			// CDN download
			return new Response(cdnImageBytes, {
				status: 200,
				headers: { "Content-Type": "image/png" },
			});
		});

		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		const result = await provider.generate({ prompt: "x" });

		expect(fetchMock).toHaveBeenCalledTimes(2); // OpenRouter + CDN
		expect(result.mimeType).toBe("image/png");
		// Decode base64 and confirm bytes round-trip.
		const decoded = Buffer.from(result.imageBase64, "base64");
		expect(Array.from(decoded)).toEqual([0x89, 0x50, 0x4e, 0x47]);
	});

	it("CDN download: rejects when downloaded image exceeds 20MB", async () => {
		// Use a small synthetic limit to simulate — generate a 21MB buffer.
		const big = new Uint8Array(21 * 1024 * 1024);
		const fetchMock = mock(async (url: string) => {
			if (url.endsWith("/chat/completions")) {
				return new Response(
					JSON.stringify({
						choices: [
							{
								message: {
									images: [{ image_url: { url: "https://cdn.example.com/big.png" } }],
								},
							},
						],
					}),
				);
			}
			return new Response(big, { status: 200, headers: { "Content-Type": "image/png" } });
		});

		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await expect(provider.generate({ prompt: "x" })).rejects.toThrow(/20MB cap/i);
	});
});
