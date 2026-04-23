import type { Creator } from "@prisma/client";
import type { ICreatorRepository } from "../../src/interfaces/repositories/creator.repository.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../../src/types/competitor-analyzer.types";

export class MockCreatorRepository implements ICreatorRepository {
	public creators: Creator[] = [];

	async create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator> {
		const row: Creator = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			createdBy: data.createdBy,
			platform: data.input.platform,
			profileUrl: data.input.profileUrl ?? "",
			username: data.input.username ?? "",
			displayName: null,
			niche: data.input.niche ?? null,
			followerCount: null,
			avatarUrl: null,
			bio: null,
			platformMetadata: null,
			enrichmentStatus: "pending",
			enrichmentError: null,
			lastEnrichedAt: null,
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as Creator;
		this.creators.push(row);
		return row;
	}

	async findById(id: string): Promise<Creator | null> {
		return this.creators.find((c) => c.id === id) ?? null;
	}

	async findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		let rows = this.creators.filter((c) => c.projectId === projectId);
		if (!filters?.includeArchived) rows = rows.filter((c) => c.archivedAt === null);
		if (filters?.platform) rows = rows.filter((c) => c.platform === filters.platform);
		if (filters?.niche) {
			const q = filters.niche.toLowerCase();
			rows = rows.filter((c) => c.niche?.toLowerCase().includes(q) ?? false);
		}
		return rows;
	}

	async findByIds(ids: string[]): Promise<Creator[]> {
		return this.creators.filter((c) => ids.includes(c.id));
	}

	async update(id: string, data: UpdateCreatorInput): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async updateEnrichment(id: string, data: any): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async archive(id: string): Promise<Creator> {
		const row = this.creators.find((c) => c.id === id);
		if (!row) throw new Error("Creator not found");
		row.archivedAt = new Date();
		return row;
	}

	async existsByUsername(
		projectId: string,
		platform: string,
		username: string,
	): Promise<boolean> {
		return this.creators.some(
			(c) => c.projectId === projectId && c.platform === platform && c.username === username,
		);
	}

	clear(): void {
		this.creators = [];
	}
}
