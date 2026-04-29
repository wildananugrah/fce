import type { PrismaClient } from "@prisma/client";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { AuditLogInput, IAuditService } from "../interfaces/services/audit.service.interface";

export class AuditService implements IAuditService {
	constructor(
		private prisma: PrismaClient,
		private logger: ILogger,
	) {}

	async log(input: AuditLogInput): Promise<void> {
		try {
			await this.prisma.auditLog.create({
				data: {
					workspaceId: input.workspaceId,
					userId: input.userId,
					action: input.action,
					entityType: input.entityType,
					entityId: input.entityId,
					metadata: (input.metadata ?? null) as any,
				},
			});
		} catch (err) {
			this.logger.error("audit.log failed", {
				action: input.action,
				entityType: input.entityType,
				entityId: input.entityId,
				err: err instanceof Error ? err.message : String(err),
			});
		}
	}
}
