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

	async list(workspaceId: string, status?: string, projectId?: string): Promise<any[]> {
		return this.generationRepository.findOutputsByWorkspace(workspaceId, status, projectId);
	}

	async updateStatus(id: string, status: string): Promise<GenerationOutput> {
		return this.generationRepository.updateOutput(id, { status });
	}

	async changeStatus(
		id: string,
		newStatus: string,
		userId: string,
		oldStatus: string,
		note?: string,
	): Promise<GenerationOutput> {
		if (newStatus === "rejected" && !note?.trim()) {
			throw new Error("A note is required when rejecting content");
		}
		const output = await this.generationRepository.updateOutput(id, { status: newStatus });
		await this.addFeedback(
			id,
			"status_change",
			userId,
			{ status: oldStatus },
			{ status: newStatus },
			note,
		);
		return output;
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string): Promise<number> {
		const allowed = ["draft", "approved", "rejected", "in_review"];
		if (!allowed.includes(status)) {
			throw new Error(`Invalid status. Must be one of: ${allowed.join(", ")}`);
		}
		return this.generationRepository.updateManyOutputStatus(workspaceId, ids, status);
	}

	async deleteMany(workspaceId: string, ids: string[]): Promise<number> {
		return this.generationRepository.archiveManyOutputs(workspaceId, ids);
	}

	async restoreMany(workspaceId: string, ids: string[]): Promise<number> {
		return this.generationRepository.restoreManyOutputs(workspaceId, ids);
	}

	async permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number> {
		return this.generationRepository.deleteManyOutputs(workspaceId, ids);
	}

	async addFeedback(
		outputId: string,
		eventType: string,
		userId: string,
		before?: any,
		after?: any,
		note?: string,
	): Promise<OutputFeedbackEvent> {
		const event = await this.generationRepository.addFeedback({
			outputId,
			eventType,
			userId,
			before,
			after,
			note,
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

	// Creates a new section for an output (used when the user edits a field
	// whose section doesn't exist yet — e.g. older outputs where caption
	// lives in content.caption but has no OutputSection row).
	async createSection(
		outputId: string,
		sectionType: string,
		contentText: string,
		userId: string,
	): Promise<any> {
		if (!this.outputSectionRepository) {
			throw new Error("Output section repository not available");
		}
		const existing = await this.outputSectionRepository.findByOutputId(outputId);
		const maxOrder = existing.reduce((acc, s) => Math.max(acc, s.sectionOrder), -1);
		await this.outputSectionRepository.createMany(outputId, [
			{ sectionType, sectionOrder: maxOrder + 1, contentText },
		]);
		const refreshed = await this.outputSectionRepository.findByOutputId(outputId);
		const created = refreshed.find(
			(s) => s.sectionType === sectionType && s.sectionOrder === maxOrder + 1,
		);
		if (!created) {
			throw new Error("Failed to create section");
		}
		await this.generationRepository.addFeedback({
			outputId,
			eventType: "section_create",
			userId,
			before: null,
			after: { sectionType, contentText },
		});
		return created;
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

	async listStatusHistory(outputId: string) {
		return this.generationRepository.findStatusChangesByOutput(outputId);
	}
}
