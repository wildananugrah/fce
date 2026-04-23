import type { Creator } from "@prisma/client";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../../types/competitor-analyzer.types";

export interface ICreatorRepository {
	create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator>;

	findById(id: string): Promise<Creator | null>;

	findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]>;

	findByIds(ids: string[]): Promise<Creator[]>;

	update(id: string, data: UpdateCreatorInput): Promise<Creator>;

	updateEnrichment(
		id: string,
		data: {
			enrichmentStatus: "pending" | "enriched" | "failed";
			enrichmentError?: string | null;
			followerCount?: number | null;
			avatarUrl?: string | null;
			displayName?: string | null;
			bio?: string | null;
			platformMetadata?: any;
			lastEnrichedAt?: Date | null;
		},
	): Promise<Creator>;

	archive(id: string): Promise<Creator>;

	existsByUsername(projectId: string, platform: string, username: string): Promise<boolean>;
}
