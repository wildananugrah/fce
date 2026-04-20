import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";

export interface ILibraryService {
	list(workspaceId: string, status?: string): Promise<any[]>;
	updateStatus(id: string, status: string): Promise<GenerationOutput>;
	updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
	// Soft-delete. Library "Delete" moves outputs into Trash.
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	restoreMany(workspaceId: string, ids: string[]): Promise<number>;
	permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number>;
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
