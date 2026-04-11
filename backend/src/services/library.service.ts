import type { GenerationOutput, OutputFeedbackEvent } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { IGenerationRepository } from "../interfaces/repositories/generation.repository.interface";
import type { IOutputSectionRepository } from "../interfaces/repositories/output-section.repository.interface";
import type { ILibraryService } from "../interfaces/services/library.service.interface";

export class LibraryService implements ILibraryService {
	constructor(
		private generationRepository: IGenerationRepository,
		private outputSectionRepository?: IOutputSectionRepository,
		private boss?: PgBoss,
	) {}

	async list(workspaceId: string): Promise<any[]> {
		return this.generationRepository.findOutputsByWorkspace(workspaceId);
	}

	async updateStatus(id: string, status: string): Promise<GenerationOutput> {
		return this.generationRepository.updateOutput(id, { status });
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const allowed = ["draft", "approved", "rejected"];
		if (!allowed.includes(status)) {
			throw new Error(`Invalid status. Must be one of: ${allowed.join(", ")}`);
		}
		return this.generationRepository.updateManyOutputStatus(workspaceId, ids, status);
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		return this.generationRepository.deleteManyOutputs(workspaceId, ids);
	}

	async addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
	): Promise<OutputFeedbackEvent> {
		const event = await this.generationRepository.addFeedback({
			outputId,
			eventType,
			userId,
			before,
			after,
		});

		if (this.boss && (eventType === "approve" || eventType === "reject")) {
			const output = await this.generationRepository.findOutputById(outputId);
			if (output) {
				// Fetch the request to get brandId and workspaceId
				const request = await this.generationRepository.findById((output as any).requestId);
				if (request) {
					await this.boss.send("recommendation-recompute", {
						brandId: request.brandId,
						workspaceId: request.workspaceId,
					});
				}
			}
		}

		return event;
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
