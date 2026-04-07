import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { ILibraryService } from "../interfaces/services/library.service.interface";

export class LibraryService implements ILibraryService {
	constructor(private generationRepository: IGenerationRepository) {}

	async list(workspaceId: string): Promise<any[]> {
		return this.generationRepository.findOutputsByWorkspace(workspaceId);
	}

	async updateStatus(id: string, status: string): Promise<GenerationOutput> {
		return this.generationRepository.updateOutput(id, { status });
	}

	async addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
	): Promise<OutputFeedbackEvent> {
		return this.generationRepository.addFeedback({ outputId, eventType, userId, before, after });
	}
}
