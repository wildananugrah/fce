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

	it("generate: throws with error body on non-2xx response", async () => {
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
		);
		const provider = new OpenRouterImageProvider("k", "model", fetchMock as any);
		await expect(provider.generate({ prompt: "p" })).rejects.toThrow(/403/);
	});
});
