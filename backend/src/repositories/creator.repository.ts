import type { Creator, PrismaClient } from "@prisma/client";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../types/competitor-analyzer.types";

export class CreatorRepository implements ICreatorRepository {
	constructor(private prisma: PrismaClient) {}

	async create(data: {
		workspaceId: string;
		projectId: string;
		createdBy: string;
		input: CreateCreatorInput;
	}): Promise<Creator> {
		if (!data.input.profileUrl || !data.input.username) {
			// Service layer enforces both are set after deriving from whichever
			// was provided. This guard is a defensive check — if we're here with
			// one missing, the caller skipped the service and tried to write
			// directly, which is a programming error.
			throw new Error("Creator create requires profileUrl and username");
		}
		return this.prisma.creator.create({
			data: {
				workspaceId: data.workspaceId,
				projectId: data.projectId,
				createdBy: data.createdBy,
				platform: data.input.platform,
				profileUrl: data.input.profileUrl,
				username: data.input.username,
				niche: data.input.niche ?? null,
			},
		});
	}

	async findById(id: string): Promise<Creator | null> {
		return this.prisma.creator.findUnique({ where: { id } });
	}

	async findByProject(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		const where: any = { projectId };
		if (!filters?.includeArchived) where.archivedAt = null;
		if (filters?.platform) where.platform = filters.platform;
		if (filters?.niche) where.niche = { contains: filters.niche, mode: "insensitive" };
		return this.prisma.creator.findMany({
			where,
			orderBy: [{ createdAt: "desc" }],
		});
	}

	async findByIds(ids: string[]): Promise<Creator[]> {
		if (ids.length === 0) return [];
		return this.prisma.creator.findMany({ where: { id: { in: ids } } });
	}

	async update(id: string, data: UpdateCreatorInput): Promise<Creator> {
		return this.prisma.creator.update({ where: { id }, data });
	}

	async updateEnrichment(
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
	): Promise<Creator> {
		return this.prisma.creator.update({ where: { id }, data: data as any });
	}

	async archive(id: string): Promise<Creator> {
		return this.prisma.creator.update({
			where: { id },
			data: { archivedAt: new Date() },
		});
	}

	async existsByUsername(
		projectId: string,
		platform: string,
		username: string,
	): Promise<boolean> {
		const found = await this.prisma.creator.findUnique({
			where: { projectId_platform_username: { projectId, platform, username } },
		});
		return found !== null;
	}
}
