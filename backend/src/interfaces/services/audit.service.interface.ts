export interface AuditLogInput {
	workspaceId: string | null;
	userId: string;
	action: string;
	entityType: string;
	entityId: string | null;
	metadata?: Record<string, unknown>;
}

export interface IAuditService {
	log(input: AuditLogInput): Promise<void>;
}
