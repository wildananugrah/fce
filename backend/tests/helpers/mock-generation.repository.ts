import type { GenerationOutput, GenerationRequest, OutputFeedbackEvent } from "@prisma/client";
import type { IGenerationRepository } from "../../src/interfaces/repositories/generation.repository.interface";

export class MockGenerationRepository implements IGenerationRepository {
	private requests: GenerationRequest[] = [];
	private outputs: GenerationOutput[] = [];
	private feedbackEvents: OutputFeedbackEvent[] = [];

	async findByWorkspace(workspaceId: string): Promise<GenerationRequest[]> {
		return this.requests.filter((r) => r.workspaceId === workspaceId);
	}

	async findById(
		id: string,
	): Promise<(GenerationRequest & { outputs: GenerationOutput[] }) | null> {
		const request = this.requests.find((r) => r.id === id);
		if (!request) return null;
		const outputs = this.outputs.filter((o) => o.requestId === id);
		return { ...request, outputs };
	}

	async create(data: {
		workspaceId: string;
		brandId: string;
		productId?: string;
		platform: string;
		contentType: string;
		framework: string;
		hookType: string;
		language?: string;
		prompt?: string;
	}): Promise<GenerationRequest> {
		const request: GenerationRequest = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			brandId: data.brandId,
			productId: data.productId ?? null,
			platform: data.platform,
			contentType: data.contentType,
			framework: data.framework,
			hookType: data.hookType,
			language: data.language ?? "id",
			prompt: data.prompt ?? null,
			status: "pending",
			errorMessage: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
		this.requests.push(request);
		return request;
	}

	async findOutputsByWorkspace(
		workspaceId: string,
	): Promise<(GenerationOutput & { request: GenerationRequest })[]> {
		return this.outputs
			.map((o) => {
				const request = this.requests.find((r) => r.id === o.requestId);
				if (!request) return null;
				return { ...o, request };
			})
			.filter((o): o is GenerationOutput & { request: GenerationRequest } => o !== null)
			.filter((o) => o.request.workspaceId === workspaceId);
	}

	async findOutputById(id: string): Promise<GenerationOutput | null> {
		return this.outputs.find((o) => o.id === id) ?? null;
	}

	async updateOutput(id: string, data: { status: string }): Promise<GenerationOutput> {
		const index = this.outputs.findIndex((o) => o.id === id);
		if (index === -1) throw new Error("Output not found");
		this.outputs[index] = { ...this.outputs[index], status: data.status, updatedAt: new Date() };
		return this.outputs[index];
	}

	async updateManyOutputStatus(
		workspaceId: string,
		ids: string[],
		status: string,
	): Promise<number> {
		let count = 0;
		for (let i = 0; i < this.outputs.length; i++) {
			const o = this.outputs[i];
			if (!ids.includes(o.id)) continue;
			const request = this.requests.find((r) => r.id === o.requestId);
			if (!request || request.workspaceId !== workspaceId) continue;
			this.outputs[i] = { ...o, status, updatedAt: new Date() };
			count++;
		}
		return count;
	}

	async deleteManyOutputs(workspaceId: string, ids: string[]): Promise<number> {
		const before = this.outputs.length;
		this.outputs = this.outputs.filter((o) => {
			if (!ids.includes(o.id)) return true;
			const request = this.requests.find((r) => r.id === o.requestId);
			if (!request || request.workspaceId !== workspaceId) return true;
			return false;
		});
		return before - this.outputs.length;
	}

	async addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
	}): Promise<OutputFeedbackEvent> {
		const event: OutputFeedbackEvent = {
			id: crypto.randomUUID(),
			outputId: data.outputId,
			eventType: data.eventType,
			before: data.before ?? null,
			after: data.after ?? null,
			userId: data.userId ?? null,
			createdAt: new Date(),
		};
		this.feedbackEvents.push(event);
		return event;
	}

	clear(): void {
		this.requests = [];
		this.outputs = [];
		this.feedbackEvents = [];
	}
}
