import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../interfaces/providers/chat-ai.provider.interface";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

/**
 * OpenRouter implementation of IChatAiProvider. Streams text deltas via SSE
 * from OpenRouter's /chat/completions endpoint, emitting text_delta events for
 * each content token, and a done event (with usage when available) when the
 * stream ends.
 *
 * Tool calls are not yet supported by this provider — OpenRouter exposes them
 * but the shape varies by underlying model; a future task can add that.
 */
export class OpenRouterChatProvider implements IChatAiProvider {
	constructor(
		private apiKey: string,
		private model: string,
		private fetchFn: typeof fetch = globalThis.fetch,
	) {}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		// Build message list: system prompt as a leading "system" role message.
		const messages: Array<{ role: string; content: string }> = [];
		if (input.systemPrompt) {
			messages.push({ role: "system", content: input.systemPrompt });
		}
		for (const m of input.messages) {
			messages.push({ role: m.role, content: m.text });
		}

		let response: Response;
		try {
			response = await this.fetchFn(`${OPENROUTER_BASE}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages,
					stream: true,
				}),
			});
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			yield { type: "error", message };
			yield { type: "done" };
			return;
		}

		if (!response.ok || !response.body) {
			yield { type: "error", message: `OpenRouterChatProvider: HTTP ${response.status}` };
			yield { type: "done" };
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let usageAccum: { inputTokens: number; outputTokens: number } | undefined;

		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let newlineIdx: number;
				while ((newlineIdx = buffer.indexOf("\n\n")) >= 0) {
					const event = buffer.slice(0, newlineIdx);
					buffer = buffer.slice(newlineIdx + 2);

					const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
					if (!dataLine) continue;

					const payload = dataLine.slice("data: ".length).trim();
					if (payload === "[DONE]") continue;

					try {
						const parsed = JSON.parse(payload);

						// Capture usage when the server includes it (common on the final chunk).
						if (parsed.usage) {
							usageAccum = {
								inputTokens: parsed.usage.prompt_tokens ?? 0,
								outputTokens: parsed.usage.completion_tokens ?? 0,
							};
						}

						const token: string = parsed.choices?.[0]?.delta?.content ?? "";
						if (token) {
							yield { type: "text_delta", delta: token };
						}
					} catch {
						// Tolerate keep-alive / heartbeat / non-JSON lines.
					}
				}
			}
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			yield { type: "error", message };
		}

		yield { type: "done", usage: usageAccum };
	}
}
