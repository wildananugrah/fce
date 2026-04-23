import type { AnalysisConfig, PrismaClient } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../interfaces/repositories/analysis-config.repository.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../types/competitor-analyzer.types";

export class AnalysisConfigRepository implements IAnalysisConfigRepository {
	constructor(private prisma: PrismaClient) {}

	async create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig> {
		return this.prisma.analysisConfig.create({
			data: {
				workspaceId: data.workspaceId,
				projectId: data.projectId,
				name: data.input.name,
				targetNiche: data.input.targetNiche ?? null,
				brandContext: data.input.brandContext,
				analysisInstructions: data.input.analysisInstructions,
				outputPreferences: data.input.outputPreferences,
			},
		});
	}

	async findById(id: string): Promise<AnalysisConfigWithCreators | null> {
		const config = await this.prisma.analysisConfig.findUnique({
			where: { id },
			include: {
				creators: { include: { creator: true } },
				_count: { select: { runs: true } },
			},
		});
		if (!config) return null;
		return {
			...config,
			creators: config.creators.map((cc) => cc.creator),
		} as AnalysisConfigWithCreators;
	}

	async findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		const configs = await this.prisma.analysisConfig.findMany({
			where: { projectId, archivedAt: null },
			include: {
				creators: { include: { creator: true } },
				_count: { select: { runs: true } },
			},
			orderBy: { updatedAt: "desc" },
		});
		return configs.map((config) => ({
			...config,
			creators: config.creators.map((cc) => cc.creator),
		})) as AnalysisConfigWithCreators[];
	}

	async update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		return this.prisma.analysisConfig.update({ where: { id }, data });
	}

	async delete(id: string): Promise<void> {
		await this.prisma.analysisConfig.delete({ where: { id } });
	}

	async replaceCreators(configId: string, creatorIds: string[]): Promise<void> {
		await this.prisma.$transaction([
			this.prisma.analysisConfigCreator.deleteMany({ where: { configId } }),
			this.prisma.analysisConfigCreator.createMany({
				data: creatorIds.map((creatorId) => ({ configId, creatorId })),
				skipDuplicates: true,
			}),
		]);
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		await this.prisma.analysisConfigCreator.delete({
			where: { configId_creatorId: { configId, creatorId } },
		});
	}
}
