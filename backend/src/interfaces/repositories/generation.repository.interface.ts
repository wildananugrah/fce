import type { GenerationOutput, GenerationRequest, OutputFeedbackEvent } from "@prisma/client";

export interface IGenerationRepository {
	findByWorkspace(workspaceId: string): Promise<GenerationRequest[]>;
	findById(id: string): Promise<(GenerationRequest & { outputs: GenerationOutput[] }) | null>;
	create(data: {
		workspaceId: string;
		brandId: string;
		productId?: string;
		platform: string;
		contentType: string;
		framework: string;
		hookType: string;
		language?: string;
		prompt?: string;
	}): Promise<GenerationRequest>;

	// Library (outputs)
	findOutputsByWorkspace(
		workspaceId: string,
	): Promise<(GenerationOutput & { request: GenerationRequest })[]>;
	findOutputById(id: string): Promise<GenerationOutput | null>;
	updateOutput(id: string, data: { status: string }): Promise<GenerationOutput>;
	addFeedback(data: {
		outputId: string;
		eventType: string;
		before?: any;
		after?: any;
		userId?: string;
	}): Promise<OutputFeedbackEvent>;
}
