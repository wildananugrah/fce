import type {
	INotificationService,
	SSEEvent,
} from "../interfaces/services/notification.service.interface";

export class NotificationService implements INotificationService {
	private connections = new Map<string, ReadableStreamDefaultController>();

	addConnection(userId: string, controller: ReadableStreamDefaultController): void {
		// Close existing connection if any
		const existing = this.connections.get(userId);
		if (existing) {
			try {
				existing.close();
			} catch {
				/* already closed */
			}
		}
		this.connections.set(userId, controller);
	}

	removeConnection(userId: string): void {
		this.connections.delete(userId);
	}

	notify(userId: string, event: SSEEvent): void {
		const controller = this.connections.get(userId);
		if (!controller) return;

		try {
			const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
			controller.enqueue(new TextEncoder().encode(data));
		} catch {
			this.connections.delete(userId);
		}
	}
}
