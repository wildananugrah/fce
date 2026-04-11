import type { GenerationOutput, GenerationRequest, OutputFeedbackEvent } from "@prisma/client";

export interface IGenerationRepository {
	findByWorkspace(workspaceId: string): Promise<GenerationRequest[]>;
	findById(id: string): Promise<(GenerationRequest & { outputs: GenerationOutput[] }) | null>;
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	create(data: {
		workspaceId: string;
		brandId: string;
		productId?: string | null;
		platform: string;
		contentType: string;
		framework: string;
		hookType: string;
		language?: string;
		prompt?: string | null;
		objective?: string | null;
		tonePreset?: string | null;
		visualStyle?: string | null;
		outputLength?: string | null;
	}): Promise<GenerationRequest>;

	// Library (outputs)
	findOutputsByWorkspace(
		workspaceId: string,
		status?: string,
	): Promise<(GenerationOutput & { request: GenerationRequest })[]>;
	findOutputById(id: string): Promise<GenerationOutput | null>;
	updateOutput(id: string, data: { status: string }): Promise<GenerationOutput>;
	updateManyOutputStatus(workspaceId: string, ids: string[], status: string): Promise<number>;
	deleteManyOutputs(workspaceId: string, ids: string[]): Promise<number>;
	addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
	}): Promise<OutputFeedbackEvent>;
}
