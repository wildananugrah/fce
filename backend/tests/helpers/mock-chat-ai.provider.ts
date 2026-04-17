import type {
	ChatStreamEvent,
	ChatStreamInput,
	IChatAiProvider,
} from "../../src/interfaces/providers/chat-ai.provider.interface";

/**
 * Test-only chat provider. Replays a scripted list of events. Tests can also
 * inspect `lastInput` to assert what the service sent.
 */
export class MockChatAiProvider implements IChatAiProvider {
	public lastInput: ChatStreamInput | null = null;
	private scripts: ChatStreamEvent[][] = [];
	private index = 0;

	queue(events: ChatStreamEvent[]): void {
		this.scripts.push(events);
	}

	async *stream(input: ChatStreamInput): AsyncIterable<ChatStreamEvent> {
		this.lastInput = input;
		const events = this.scripts[this.index] ?? [];
		this.index += 1;
		for (const evt of events) yield evt;
	}

	clear(): void {
		this.scripts = [];
		this.index = 0;
		this.lastInput = null;
	}
}
