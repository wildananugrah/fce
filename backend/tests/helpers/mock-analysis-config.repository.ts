import type { AnalysisConfig, Creator } from "@prisma/client";
import type { IAnalysisConfigRepository } from "../../src/interfaces/repositories/analysis-config.repository.interface";
import type {
	AnalysisConfigWithCreators,
	CreateAnalysisConfigInput,
	UpdateAnalysisConfigInput,
} from "../../src/types/competitor-analyzer.types";

export class MockAnalysisConfigRepository implements IAnalysisConfigRepository {
	public configs: AnalysisConfig[] = [];
	public joinRows: Array<{ configId: string; creatorId: string }> = [];
	/** Set by tests that want findById/findByProject to expose creators. */
	public creatorStore: Creator[] = [];

	async create(data: {
		workspaceId: string;
		projectId: string;
		input: CreateAnalysisConfigInput;
	}): Promise<AnalysisConfig> {
		const row: AnalysisConfig = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			name: data.input.name,
			targetNiche: data.input.targetNiche ?? null,
			brandContext: data.input.brandContext,
			analysisInstructions: data.input.analysisInstructions,
			outputPreferences: data.input.outputPreferences,
			archivedAt: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		} as AnalysisConfig;
		this.configs.push(row);
		return row;
	}

	async findById(id: string): Promise<AnalysisConfigWithCreators | null> {
		const config = this.configs.find((c) => c.id === id);
		if (!config) return null;
		const creatorIds = this.joinRows.filter((j) => j.configId === id).map((j) => j.creatorId);
		const creators = this.creatorStore.filter((c) => creatorIds.includes(c.id));
		return { ...config, creators } as AnalysisConfigWithCreators;
	}

	async findByProject(projectId: string): Promise<AnalysisConfigWithCreators[]> {
		return Promise.all(
			this.configs
				.filter((c) => c.projectId === projectId && c.archivedAt === null)
				.map(async (c) => (await this.findById(c.id)) as AnalysisConfigWithCreators),
		);
	}

	async update(id: string, data: UpdateAnalysisConfigInput): Promise<AnalysisConfig> {
		const row = this.configs.find((c) => c.id === id);
		if (!row) throw new Error("Config not found");
		Object.assign(row, data, { updatedAt: new Date() });
		return row;
	}

	async delete(id: string): Promise<void> {
		this.configs = this.configs.filter((c) => c.id !== id);
		this.joinRows = this.joinRows.filter((j) => j.configId !== id);
	}

	async replaceCreators(configId: string, creatorIds: string[]): Promise<void> {
		this.joinRows = this.joinRows.filter((j) => j.configId !== configId);
		for (const creatorId of creatorIds) {
			this.joinRows.push({ configId, creatorId });
		}
	}

	async removeCreator(configId: string, creatorId: string): Promise<void> {
		this.joinRows = this.joinRows.filter(
			(j) => !(j.configId === configId && j.creatorId === creatorId),
		);
	}

	clear(): void {
		this.configs = [];
		this.joinRows = [];
		this.creatorStore = [];
	}
}
