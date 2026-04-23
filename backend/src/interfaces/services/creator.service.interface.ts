import type { Creator } from "@prisma/client";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../../types/competitor-analyzer.types";

export interface ICreatorService {
	create(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreateCreatorInput,
	): Promise<Creator>;
	list(projectId: string, filters?: CreatorFilters): Promise<Creator[]>;
	get(id: string): Promise<Creator>;
	update(id: string, input: UpdateCreatorInput): Promise<Creator>;
	archive(id: string): Promise<Creator>;
	refreshEnrichment(id: string): Promise<Creator>;
}
