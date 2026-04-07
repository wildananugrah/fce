import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";
import type { ILibraryService } from "../interfaces/services/library.service.interface";

export class LibraryService implements ILibraryService {
	constructor(
		private generationRepository: IGenerationRepository,
		private outputSectionRepository?: IOutputSectionRepository,
	) {}

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

	async getSections(outputId: string): Promise<any[]> {
		if (!this.outputSectionRepository) return [];
		return this.outputSectionRepository.findByOutputId(outputId);
	}

	async updateSection(sectionId: string, contentText: string, userId: string): Promise<any> {
		if (!this.outputSectionRepository) {
			throw new Error("Output section repository not available");
		}

		const section = await this.outputSectionRepository.findById(sectionId);
		if (!section) {
			throw new Error("Section not found");
		}

		// Record feedback event for the edit
		await this.generationRepository.addFeedback({
			outputId: section.outputId,
			eventType: "section_edit",
			userId,
			before: { contentText: section.contentText },
			after: { contentText },
		});

		return this.outputSectionRepository.update(sectionId, { contentText });
	}
}
