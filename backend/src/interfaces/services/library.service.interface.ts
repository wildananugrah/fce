import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";

export interface ILibraryService {
	list(workspaceId: string, status?: string): Promise<any[]>;
	updateStatus(id: string, status: string): Promise<GenerationOutput>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
	): Promise<OutputFeedbackEvent>;
	getSections(outputId: string): Promise<any[]>;
	updateSection(sectionId: string, contentText: string, userId: string): Promise<any>;
	createSection(
		outputId: string,
		sectionType: string,
		contentText: string,
		userId: string,
	): Promise<any>;
}
