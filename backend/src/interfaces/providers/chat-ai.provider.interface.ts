import type { ChatMessage, ToolDefinition } from "../../types/chat.types";

export type ChatStreamEvent =
	| { type: "text_delta"; delta: string }
	| { type: "tool_call"; id: string; name: string; input: unknown }
	| { type: "error"; message: string }
	| { type: "done"; usage?: { inputTokens: number; outputTokens: number } };

export interface ChatStreamInput {
	systemPrompt: string;
	messages: ChatMessage[];
	tools: ToolDefinition[];
}

export interface IChatAiProvider {
	stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent>;
}
