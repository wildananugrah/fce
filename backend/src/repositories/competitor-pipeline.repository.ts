import type {
	CompetitorPipelineRun,
	PipelineContent,
	PipelineScript,
	PrismaClient,
} from "@prisma/client";
import type { ICompetitorPipelineRepository } from "../interfaces/repositories/competitor-pipeline.repository.interface";
import type { PipelineRunWithVideosAndScripts } from "../types/competitor-analyzer.types";

export class CompetitorPipelineRepository implements ICompetitorPipelineRepository {
	constructor(private prisma: PrismaClient) {}

	async createRun(data: {
		workspaceId: string;
		projectId: string;
		configId: string;
		userId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	}): Promise<CompetitorPipelineRun> {
		return this.prisma.competitorPipelineRun.create({ data });
	}

	async findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null> {
		return this.prisma.competitorPipelineRun.findUnique({
			where: { id },
			include: {
				videos: { orderBy: { createdAt: "asc" } },
				scripts: { orderBy: { scriptNumber: "asc" } },
				config: true,
			},
		}) as Promise<PipelineRunWithVideosAndScripts | null>;
	}

	async findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.prisma.competitorPipelineRun.findMany({
			where: { projectId },
			orderBy: { createdAt: "desc" },
		});
	}

	async updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun> {
		return this.prisma.competitorPipelineRun.update({ where: { id }, data: data as any });
	}

	async getRunStatus(id: string): Promise<string | null> {
		const run = await this.prisma.competitorPipelineRun.findUnique({
			where: { id },
			select: { status: true },
		});
		return run?.status ?? null;
	}

	async createContent(data: any[]): Promise<PipelineContent[]> {
		if (data.length === 0) return [];
		await this.prisma.pipelineContent.createMany({ data, skipDuplicates: true });
		const runIds = [...new Set(data.map((d) => d.runId))];
		return this.prisma.pipelineContent.findMany({
			where: { runId: { in: runIds } },
			orderBy: { createdAt: "asc" },
		});
	}

	async findContentByRun(runId: string): Promise<PipelineContent[]> {
		return this.prisma.pipelineContent.findMany({
			where: { runId },
			orderBy: { createdAt: "asc" },
		});
	}

	async findContentById(id: string): Promise<PipelineContent | null> {
		return this.prisma.pipelineContent.findUnique({ where: { id } });
	}

	async updateContent(id: string, data: Partial<PipelineContent>): Promise<PipelineContent> {
		return this.prisma.pipelineContent.update({ where: { id }, data: data as any });
	}

	async createScripts(runId: string, scripts: any[]): Promise<PipelineScript[]> {
		if (scripts.length === 0) return [];
		await this.prisma.pipelineScript.createMany({
			data: scripts.map((s) => ({ ...s, runId })),
		});
		return this.prisma.pipelineScript.findMany({
			where: { runId },
			orderBy: { scriptNumber: "asc" },
		});
	}

	async findScriptsByRun(runId: string): Promise<PipelineScript[]> {
		return this.prisma.pipelineScript.findMany({
			where: { runId },
			orderBy: { scriptNumber: "asc" },
		});
	}
}
