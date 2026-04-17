import { GoogleGenAI } from "@google/genai";
import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../interfaces/providers/chat-ai.provider.interface";
import type { ChatMessage } from "../types/chat.types";

/**
 * Gemini implementation of IChatAiProvider. v1 emits text_delta + done events
 * only. Tool-call support is added in Phase 6 (propose_topics) and Phase 7
 * (apply_plan_edit); this file is edited in those phases.
 */
export class GeminiChatProvider implements IChatAiProvider {
	private client: GoogleGenAI;

	constructor(
		apiKey: string,
		private model: string,
	) {
		this.client = new GoogleGenAI({ apiKey });
	}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		const contents = this.buildContents(input.messages);
		try {
			const response = await this.client.models.generateContentStream({
				model: this.model,
				contents,
				config: {
					systemInstruction: input.systemPrompt,
					// Tools will be wired in later phases.
				},
			});

			let inputTokens = 0;
			let outputTokens = 0;

			for await (const chunk of response) {
				const text = chunk.text;
				if (text) yield { type: "text_delta", delta: text };

				const usage = chunk.usageMetadata;
				if (usage) {
					inputTokens = usage.promptTokenCount ?? inputTokens;
					outputTokens = usage.candidatesTokenCount ?? outputTokens;
				}
			}

			yield { type: "done", usage: { inputTokens, outputTokens } };
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			yield { type: "error", message };
			yield { type: "done" };
		}
	}

	private buildContents(messages: ChatMessage[]) {
		return messages.map((m) => ({
			role: m.role === "assistant" ? "model" : "user",
			parts: [{ text: m.text }],
		}));
	}
}
