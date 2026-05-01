import { describe, expect, it, mock } from "bun:test";
import { OpenRouterProvider } from "../../src/providers/openrouter.provider";

function mockFetchOnce(responseBody: unknown, status = 200) {
	return mock(async (_url: string, _init?: RequestInit) => {
		return new Response(JSON.stringify(responseBody), { status });
	});
}

describe("OpenRouterProvider", () => {
	it("generateContent: calls /chat/completions with the configured model and parses JSON response", async () => {
		const fakeResponse = {
			choices: [
				{ message: { content: '{"caption":"hello","hashtags":["#a"],"sections":[]}' } },
			],
			usage: { prompt_tokens: 10, completion_tokens: 20 },
		};
		const fetchMock = mockFetchOnce(fakeResponse);
		const provider = new OpenRouterProvider("api-key", "anthropic/claude-sonnet-4.5", fetchMock as any);

		const result = await provider.generate({
			brandContext: { name: "B", description: "d", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: [],
		} as any);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.model).toBe("anthropic/claude-sonnet-4.5");
		expect(body.messages).toBeArray();
		expect(provider.lastUsage).toEqual({ inputTokens: 10, outputTokens: 20 });
		expect(result).toEqual({ caption: "hello", hashtags: ["#a"], sections: [] } as any);
	});

	it("generateContent: throws a descriptive error when response is not JSON", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: "not json at all" } }],
			usage: { prompt_tokens: 1, completion_tokens: 1 },
		});
		const provider = new OpenRouterProvider("api-key", "model", fetchMock as any);

		await expect(
			provider.generate({
				brandContext: { name: "B", description: "d", language: "en" },
				productContext: null,
				platform: "instagram",
				contentType: "post",
				framework: "aida",
				hookType: "curiosity-hook",
				objective: null,
				referenceImages: [],
			} as any),
		).rejects.toThrow(/OpenRouterProvider: Failed to parse content generation response/);
	});

	it("forwards Authorization header with bearer api key", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: '{"caption":"","hashtags":[],"sections":[]}' } }],
			usage: { prompt_tokens: 0, completion_tokens: 0 },
		});
		const provider = new OpenRouterProvider("sk-or-v1-secret", "model", fetchMock as any);
		await provider.generate({
			brandContext: { name: "B", description: "", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: [],
		} as any);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer sk-or-v1-secret");
	});

	it("includes reference images using OpenAI-compatible image_url format", async () => {
		const fetchMock = mockFetchOnce({
			choices: [{ message: { content: '{"caption":"","hashtags":[],"sections":[]}' } }],
			usage: { prompt_tokens: 0, completion_tokens: 0 },
		});
		const provider = new OpenRouterProvider("k", "model", fetchMock as any);
		await provider.generate({
			brandContext: { name: "B", description: "", language: "en" },
			productContext: null,
			platform: "instagram",
			contentType: "post",
			framework: "aida",
			hookType: "curiosity-hook",
			objective: null,
			referenceImages: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
		} as any);

		const init = fetchMock.mock.calls[0][1] as RequestInit;
		const body = JSON.parse(init.body as string);
		const userContent = body.messages.find((m: any) => m.role === "user").content;
		expect(userContent).toBeArray();
		const imageParts = userContent.filter((p: any) => p.type === "image_url");
		expect(imageParts).toHaveLength(2);
		expect(imageParts[0].image_url.url).toBe("https://example.com/a.jpg");
	});
});
