import Anthropic from "@anthropic-ai/sdk";
import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../interfaces/providers/chat-ai.provider.interface";

/**
 * Anthropic implementation of IChatAiProvider. Mirrors GeminiChatProvider:
 * streams text deltas, surfaces tool_use blocks as tool_call events after the
 * stream finalizes, and emits a single done event with usage totals.
 */
export class AnthropicChatProvider implements IChatAiProvider {
	private client: Anthropic;

	constructor(
		apiKey: string,
		private model: string,
	) {
		this.client = new Anthropic({ apiKey });
	}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		const messages = input.messages.map((m) => ({
			role: m.role,
			content: m.text,
		}));
		const tools = input.tools.map((t) => ({
			name: t.name,
			description: t.description,
			input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
		}));

		try {
			const stream = this.client.messages.stream({
				model: this.model,
				system: input.systemPrompt,
				max_tokens: 4096,
				messages: messages as Anthropic.MessageParam[],
				tools: tools.length > 0 ? tools : undefined,
			});

			for await (const evt of stream) {
				if (
					evt.type === "content_block_delta" &&
					(evt.delta as { type?: string }).type === "text_delta"
				) {
					yield { type: "text_delta", delta: (evt.delta as { text: string }).text };
				}
			}

			const final = await stream.finalMessage();
			for (const block of final.content) {
				if (block.type === "tool_use") {
					yield {
						type: "tool_call",
						id: block.id,
						name: block.name,
						input: block.input,
					};
				}
			}

			yield {
				type: "done",
				usage: final.usage
					? { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens }
					: undefined,
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			yield { type: "error", message };
			yield { type: "done" };
		}
	}
}
