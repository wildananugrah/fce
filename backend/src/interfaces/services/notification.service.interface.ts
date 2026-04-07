export interface SSEEvent {
	type: string;
	data: Record<string, unknown>;
}

export interface INotificationService {
	addConnection(userId: string, controller: ReadableStreamDefaultController): void;
	removeConnection(userId: string): void;
	notify(userId: string, event: SSEEvent): void;
}
