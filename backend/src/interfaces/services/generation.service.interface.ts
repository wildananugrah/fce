import type { GenerationRequest } from "@prisma/client";
import type { CreateGenerationInput } from "../../types/generation.types";

export interface IGenerationService {
	list(workspaceId: string): Promise<GenerationRequest[]>;
	getById(id: string): Promise<any>;
	create(
		workspaceId: string,
		userId: string,
		input: CreateGenerationInput,
	): Promise<GenerationRequest>;
}
