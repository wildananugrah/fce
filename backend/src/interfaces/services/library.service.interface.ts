import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";

export interface ILibraryService {
	list(workspaceId: string, status?: string): Promise<any[]>;
	updateStatus(id: string, status: string): Promise<GenerationOutput>;
	changeStatus(
		id: string,
		newStatus: string,
		userId: string,
		oldStatus: string,
		note?: string,
	): Promise<GenerationOutput>;
	listStatusHistory(
		outputId: string,
	): Promise<
		Array<
			OutputFeedbackEvent & {
				user: { id: string; fullName: string | null; email: string } | null;
			}
		>
	>;
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
		note?: string,
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
