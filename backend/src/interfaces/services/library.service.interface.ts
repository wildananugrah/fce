import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";

export interface ILibraryService {
	list(workspaceId: string): Promise<any[]>;
	updateStatus(id: string, status: string): Promise<GenerationOutput>;
	addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
	): Promise<OutputFeedbackEvent>;
}
