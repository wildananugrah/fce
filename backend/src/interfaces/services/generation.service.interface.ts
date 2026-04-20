import type { GenerationRequest } from "@prisma/client";
import type { CreateGenerationInput } from "../../types/generation.types";

export interface IGenerationService {
	list(workspaceId: string): Promise<GenerationRequest[]>;
	getById(id: string): Promise<any>;
	// Soft-delete: archives requests and their outputs (via filtering).
	deleteMany(workspaceId: string, ids: string[]): Promise<number>;
	restoreMany(workspaceId: string, ids: string[]): Promise<number>;
	permanentDeleteMany(workspaceId: string, ids: string[]): Promise<number>;
	create(
		workspaceId: string,
		userId: string,
		input: CreateGenerationInput,
	): Promise<GenerationRequest>;
}
