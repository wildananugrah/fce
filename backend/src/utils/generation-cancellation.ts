import type { PrismaClient } from "@prisma/client";

/**
 * True iff the given GenerationRequest's status is currently "cancelled".
 * Workers call this between phases so a user-clicked Cancel halts further
 * work without stopping the in-flight AI call (which can't be aborted).
 */
export async function isGenerationCancelled(
	prisma: PrismaClient,
	requestId: string,
): Promise<boolean> {
	const row = await prisma.generationRequest.findUnique({
		where: { id: requestId },
		select: { status: true },
	});
	return row?.status === "cancelled";
}

/**
 * True iff the given TopicGenerationRun's status is currently "cancelled".
 * Workers call this between phases so a user-clicked Cancel halts further
 * work without stopping the in-flight AI call (which can't be aborted).
 */
export async function isTopicRunCancelled(
	prisma: PrismaClient,
	runId: string,
): Promise<boolean> {
	const row = await prisma.topicGenerationRun.findUnique({
		where: { id: runId },
		select: { status: true },
	});
	return row?.status === "cancelled";
}
