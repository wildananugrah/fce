import type { PrismaClient, ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { IResearchRepository } from "../interfaces/repositories/research.repository.interface";
import type { ResearchRunFilters } from "../types/research.types";

export class ResearchRepository implements IResearchRepository {
	constructor(private prisma: PrismaClient) {}

	async findRunsByWorkspace(workspaceId: string, filters?: ResearchRunFilters) {
		const where: any = { workspaceId };
		if (filters?.actorType) where.actorType = filters.actorType;
		if (filters?.status) where.status = filters.status;
		if (filters?.brandId) where.brandId = filters.brandId;

		return this.prisma.researchRun.findMany({
			where,
			orderBy: { createdAt: "desc" },
			include: {
				brand: { select: { name: true } },
				user: { select: { fullName: true, email: true } },
			},
		});
	}

	async findRunById(id: string) {
		return this.prisma.researchRun.findUnique({
			where: { id },
			include: { results: { orderBy: { createdAt: "asc" } } },
		});
	}

	async createRun(data: {
		workspaceId: string;
		userId: string;
		brandId?: string;
		actorType: string;
		actorId: string;
		input: any;
	}): Promise<ResearchRun> {
		return this.prisma.researchRun.create({ data });
	}

	async updateRun(id: string, data: Partial<ResearchRun>): Promise<ResearchRun> {
		return this.prisma.researchRun.update({ where: { id }, data: data as any });
	}

	async createResults(
		runId: string,
		workspaceId: string,
		results: Array<{
			dataType: string;
			title?: string;
			url?: string;
			content: string;
			metadata: any;
			scrapedAt: Date;
		}>,
	): Promise<number> {
		const data = results.map((r) => ({
			runId,
			workspaceId,
			dataType: r.dataType,
			title: r.title ?? null,
			url: r.url ?? null,
			content: r.content,
			metadata: r.metadata,
			scrapedAt: r.scrapedAt,
		}));
		const { count } = await this.prisma.researchResult.createMany({ data });
		return count;
	}

	async findResultById(id: string): Promise<ResearchResult | null> {
		return this.prisma.researchResult.findUnique({ where: { id } });
	}

	async findResultsByRun(runId: string, skip = 0, take = 50): Promise<ResearchResult[]> {
		return this.prisma.researchResult.findMany({
			where: { runId },
			orderBy: { createdAt: "asc" },
			skip,
			take,
		});
	}

	async getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null> {
		return this.prisma.workspaceSetting.findUnique({ where: { workspaceId } });
	}

	async upsertWorkspaceSetting(
		workspaceId: string,
		data: { apifyApiKey?: string | null },
	): Promise<WorkspaceSetting> {
		return this.prisma.workspaceSetting.upsert({
			where: { workspaceId },
			update: data,
			create: { workspaceId, ...data },
		});
	}
}
