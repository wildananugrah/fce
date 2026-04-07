import type { ILogger } from "../interfaces/providers/logger.provider.interface";

export class ConsoleLogger implements ILogger {
	private meta: Record<string, unknown>;

	constructor(
		private serviceName: string,
		parentMeta: Record<string, unknown> = {},
	) {
		this.meta = { service: serviceName, ...parentMeta };
	}

	info(message: string, meta?: Record<string, unknown>): void {
		console.log(JSON.stringify({ level: "INFO", message, ...this.meta, ...meta }));
	}

	warn(message: string, meta?: Record<string, unknown>): void {
		console.warn(JSON.stringify({ level: "WARN", message, ...this.meta, ...meta }));
	}

	error(message: string, meta?: Record<string, unknown>): void {
		console.error(JSON.stringify({ level: "ERROR", message, ...this.meta, ...meta }));
	}

	debug(message: string, meta?: Record<string, unknown>): void {
		console.debug(JSON.stringify({ level: "DEBUG", message, ...this.meta, ...meta }));
	}

	child(meta: Record<string, unknown>): ILogger {
		return new ConsoleLogger(this.serviceName, { ...this.meta, ...meta });
	}
}
