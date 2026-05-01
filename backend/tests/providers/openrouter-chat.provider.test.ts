import { describe, expect, it, mock } from "bun:test";
import { OpenRouterChatProvider } from "../../src/providers/openrouter-chat.provider";

function streamingResponse(chunks: string[]): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const c of chunks) {
				controller.enqueue(encoder.encode(c));
			}
			controller.close();
		},
	});
	return new Response(stream, {
		status: 200,
		headers: { "Content-Type": "text/event-stream" },
	});
}

describe("OpenRouterChatProvider", () => {
	it("stream: emits text_delta events in order from SSE events", async () => {
		const sse = [
			'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
			'data: {"choices":[{"delta":{"content":" "}}]}\n\n',
			'data: {"choices":[{"delta":{"content":"world"}}]}\n\n',
			"data: [DONE]\n\n",
		];
		const fetchMock = mock(async () => streamingResponse(sse));
		const provider = new OpenRouterChatProvider("k", "model", fetchMock as any);

		const events: string[] = [];
		let doneReceived = false;
		for await (const evt of provider.stream({
			systemPrompt: "You are a helper",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			if (evt.type === "text_delta") events.push(evt.delta);
			if (evt.type === "done") doneReceived = true;
		}

		expect(events).toEqual(["Hello", " ", "world"]);
		expect(doneReceived).toBe(true);
	});

	it("forwards Authorization header, stream:true, system message, and model", async () => {
		const fetchMock = mock(async () =>
			streamingResponse([
				'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
				"data: [DONE]\n\n",
			]),
		);
		const provider = new OpenRouterChatProvider("sk-secret", "my-model", fetchMock as any);
		for await (const _ of provider.stream({
			systemPrompt: "You are helpful",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			// consume
		}

		const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		const init = firstCall[1];
		const headers = init.headers as Record<string, string>;
		expect(headers["Authorization"]).toBe("Bearer sk-secret");
		const body = JSON.parse(init.body as string);
		expect(body.stream).toBe(true);
		expect(body.model).toBe("my-model");
		// System prompt is injected as first message with role "system"
		expect(body.messages[0]).toEqual({ role: "system", content: "You are helpful" });
		expect(body.messages[1]).toEqual({ role: "user", content: "hi" });
	});

	it("emits error event and done event on HTTP error", async () => {
		const fetchMock = mock(async () => new Response(null, { status: 401 }));
		const provider = new OpenRouterChatProvider("bad-key", "model", fetchMock as any);

		const types: string[] = [];
		for await (const evt of provider.stream({
			systemPrompt: "",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			types.push(evt.type);
		}

		expect(types).toContain("error");
		expect(types[types.length - 1]).toBe("done");
	});

	it("emits done with usage when finish_reason stop and usage present", async () => {
		const sse = [
			'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n',
			'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":3}}\n\n',
			"data: [DONE]\n\n",
		];
		const fetchMock = mock(async () => streamingResponse(sse));
		const provider = new OpenRouterChatProvider("k", "model", fetchMock as any);

		let doneEvt: { type: "done"; usage?: { inputTokens: number; outputTokens: number } } | null =
			null;
		for await (const evt of provider.stream({
			systemPrompt: "",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			if (evt.type === "done") doneEvt = evt;
		}

		expect(doneEvt).not.toBeNull();
		expect(doneEvt?.usage?.inputTokens).toBe(5);
		expect(doneEvt?.usage?.outputTokens).toBe(3);
	});

	it("includes max_tokens and temperature in request body", async () => {
		const sse = ['data: {"choices":[{"delta":{"content":"x"}}]}\n\n', "data: [DONE]\n\n"];
		const fetchMock = mock(async () => streamingResponse(sse));
		const provider = new OpenRouterChatProvider("k", "model", fetchMock as any);
		const events = [];
		for await (const e of provider.stream({
			systemPrompt: "",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			events.push(e);
		}
		const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
		const body = JSON.parse(init.body as string);
		expect(body.max_tokens).toBeGreaterThan(0);
		expect(body.temperature).toBeGreaterThanOrEqual(0);
	});

	it("HTTP error path: error event includes upstream response body", async () => {
		const fetchMock = mock(async () =>
			new Response('{"error":{"message":"Invalid API key"}}', {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
		);
		const provider = new OpenRouterChatProvider("bad-key", "model", fetchMock as any);
		const events = [];
		for await (const e of provider.stream({
			systemPrompt: "",
			messages: [{ role: "user", text: "hi" }],
			tools: [],
		})) {
			events.push(e);
		}
		const errEvent = events.find((e) => e.type === "error");
		expect(errEvent).toBeDefined();
		expect((errEvent as any).message).toMatch(/HTTP 401/);
		expect((errEvent as any).message).toMatch(/Invalid API key/);
	});
});
