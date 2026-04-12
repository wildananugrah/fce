import type { ResearchResult, ResearchRun, WorkspaceSetting } from "@prisma/client";
import type { IResearchRepository } from "../../src/interfaces/repositories/research.repository.interface";
import type { ResearchRunFilters } from "../../src/types/research.types";

export class MockResearchRepository implements IResearchRepository {
	private runs: any[] = [];
	private results: ResearchResult[] = [];
	private settings: WorkspaceSetting[] = [];

	async findRunsByWorkspace(workspaceId: string, filters?: ResearchRunFilters) {
		let filtered = this.runs.filter((r) => r.workspaceId === workspaceId);
		if (filters?.actorType) filtered = filtered.filter((r) => r.actorType === filters.actorType);
		if (filters?.status) filtered = filtered.filter((r) => r.status === filters.status);
		if (filters?.brandId) filtered = filtered.filter((r) => r.brandId === filters.brandId);
		return filtered;
	}

	async findRunById(id: string) {
		const run = this.runs.find((r) => r.id === id);
		if (!run) return null;
		return { ...run, results: this.results.filter((r) => r.runId === id) };
	}

	async createRun(data: any): Promise<ResearchRun> {
		const run = {
			id: crypto.randomUUID(),
			...data,
			apifyRunId: null,
			status: "pending",
			errorMessage: null,
			resultCount: 0,
			startedAt: null,
			completedAt: null,
			createdAt: new Date(),
			brand: data.brandId ? { name: "Test Brand" } : null,
			user: { fullName: "Test User", email: "test@test.com" },
		};
		this.runs.push(run);
		return run as any;
	}

	async updateRun(id: string, data: any): Promise<ResearchRun> {
		const idx = this.runs.findIndex((r) => r.id === id);
		if (idx === -1) throw new Error("Run not found");
		this.runs[idx] = { ...this.runs[idx], ...data };
		return this.runs[idx] as any;
	}

	async createResults(runId: string, workspaceId: string, results: any[]): Promise<number> {
		for (const r of results) {
			this.results.push({
				id: crypto.randomUUID(), runId, workspaceId,
				dataType: r.dataType, title: r.title ?? null, url: r.url ?? null,
				content: r.content, metadata: r.metadata, scrapedAt: r.scrapedAt, createdAt: new Date(),
			} as any);
		}
		return results.length;
	}

	async findResultById(id: string): Promise<ResearchResult | null> {
		return this.results.find((r) => r.id === id) ?? null;
	}

	async findResultsByRun(runId: string, skip = 0, take = 50): Promise<ResearchResult[]> {
		return this.results.filter((r) => r.runId === runId).slice(skip, skip + take);
	}

	async getWorkspaceSetting(workspaceId: string): Promise<WorkspaceSetting | null> {
		return this.settings.find((s) => s.workspaceId === workspaceId) ?? null;
	}

	async upsertWorkspaceSetting(workspaceId: string, data: { apifyApiKey?: string | null }): Promise<WorkspaceSetting> {
		const idx = this.settings.findIndex((s) => s.workspaceId === workspaceId);
		if (idx >= 0) {
			this.settings[idx] = { ...this.settings[idx], ...data, updatedAt: new Date() } as any;
			return this.settings[idx];
		}
		const setting = {
			id: crypto.randomUUID(), workspaceId,
			apifyApiKey: data.apifyApiKey ?? null,
			createdAt: new Date(), updatedAt: new Date(),
		} as WorkspaceSetting;
		this.settings.push(setting);
		return setting;
	}

	clear(): void {
		this.runs = [];
		this.results = [];
		this.settings = [];
	}
}
