import type { PrismaClient } from "@prisma/client";

export interface AiActivityInput {
	workspaceId: string;
	generator: string;
	provider: string;
	model?: string;
	requestId?: string;
	userId?: string;
	systemPrompt: string;
	userPrompt: string;
	brandId?: string;
	productId?: string;
	platform?: string;
	contentType?: string;
	skillIds?: string[];
	skillNames?: string[];
}

export interface AiActivityResult {
	responseText?: string;
	responseJson?: unknown;
	inputTokens?: number;
	outputTokens?: number;
	durationMs?: number;
	estimatedCost?: number;
	status: "success" | "error";
	errorMessage?: string;
}

export async function logAiActivity(
	prisma: PrismaClient,
	input: AiActivityInput,
	result: AiActivityResult,
): Promise<void> {
	try {
		await prisma.aiProviderLog.create({
			data: {
				workspaceId: input.workspaceId,
				generator: input.generator,
				provider: input.provider,
				model: input.model ?? null,
				requestId: input.requestId ?? null,
				userId: input.userId ?? null,
				systemPrompt: input.systemPrompt,
				userPrompt: input.userPrompt,
				responseText: result.responseText ?? null,
				responseJson: result.responseJson ?? undefined,
				brandId: input.brandId ?? null,
				productId: input.productId ?? null,
				platform: input.platform ?? null,
				contentType: input.contentType ?? null,
				skillIds: input.skillIds ?? undefined,
				skillNames: input.skillNames ?? undefined,
				inputTokens: result.inputTokens ?? null,
				outputTokens: result.outputTokens ?? null,
				durationMs: result.durationMs ?? null,
				estimatedCost: result.estimatedCost ?? null,
				status: result.status,
				errorMessage: result.errorMessage ?? null,
			},
		});
	} catch {
		// Don't let logging failures break generation
	}
}
