import type { CompetitorPipelineRun, PipelineContent, PipelineScript } from "@prisma/client";
import type { ICompetitorPipelineRepository } from "../../src/interfaces/repositories/competitor-pipeline.repository.interface";
import type { PipelineRunWithVideosAndScripts } from "../../src/types/competitor-analyzer.types";

export class MockCompetitorPipelineRepository implements ICompetitorPipelineRepository {
	public runs: CompetitorPipelineRun[] = [];
	public videos: PipelineContent[] = [];
	public scripts: PipelineScript[] = [];

	async createRun(data: any): Promise<CompetitorPipelineRun> {
		const row: CompetitorPipelineRun = {
			id: crypto.randomUUID(),
			workspaceId: data.workspaceId,
			projectId: data.projectId,
			configId: data.configId,
			userId: data.userId,
			videosPerCreator: data.videosPerCreator,
			lookbackPool: data.lookbackPool,
			timeframeDays: data.timeframeDays,
			status: "pending",
			stage: null,
			errorMessage: null,
			startedAt: null,
			completedAt: null,
			createdAt: new Date(),
		} as CompetitorPipelineRun;
		this.runs.push(row);
		return row;
	}

	async findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null> {
		const run = this.runs.find((r) => r.id === id);
		if (!run) return null;
		return {
			...run,
			videos: this.videos.filter((v) => v.runId === id),
			scripts: this.scripts.filter((s) => s.runId === id),
			config: null,
		} as PipelineRunWithVideosAndScripts;
	}

	async findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]> {
		return this.runs.filter((r) => r.projectId === projectId);
	}

	async updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun> {
		const row = this.runs.find((r) => r.id === id);
		if (!row) throw new Error("Run not found");
		Object.assign(row, data);
		return row;
	}

	async getRunStatus(id: string): Promise<string | null> {
		return this.runs.find((r) => r.id === id)?.status ?? null;
	}

	async createContent(data: any[]): Promise<PipelineContent[]> {
		for (const d of data) {
			const row: PipelineContent = {
				id: crypto.randomUUID(),
				runId: d.runId,
				creatorId: d.creatorId,
				platform: d.platform,
				platformPostId: d.platformPostId,
				contentType: d.contentType,
				contentUrl: d.contentUrl,
				thumbnailUrl: d.thumbnailUrl ?? null,
				caption: d.caption ?? null,
				viewCount: d.viewCount ?? null,
				likeCount: d.likeCount ?? null,
				shareCount: d.shareCount ?? null,
				commentCount: d.commentCount ?? null,
				hashtags: d.hashtags ?? null,
				postedAt: d.postedAt ?? null,
				platformMetadata: d.platformMetadata ?? null,
				analysisStatus: "pending",
				analysisJson: null,
				analysisError: null,
				createdAt: new Date(),
			} as PipelineContent;
			this.videos.push(row);
		}
		return [...this.videos];
	}

	async findContentByRun(runId: string): Promise<PipelineContent[]> {
		return this.videos.filter((v) => v.runId === runId);
	}

	async findContentById(id: string): Promise<PipelineContent | null> {
		return this.videos.find((v) => v.id === id) ?? null;
	}

	async updateContent(
		id: string,
		data: Partial<PipelineContent>,
	): Promise<PipelineContent> {
		const row = this.videos.find((v) => v.id === id);
		if (!row) throw new Error("Content not found");
		Object.assign(row, data);
		return row;
	}

	async createScripts(runId: string, scripts: any[]): Promise<PipelineScript[]> {
		for (const s of scripts) {
			const row: PipelineScript = {
				id: crypto.randomUUID(),
				runId,
				sourceVideoId: s.sourceVideoId ?? null,
				scriptNumber: s.scriptNumber,
				title: s.title ?? null,
				hook: s.hook ?? null,
				body: s.body ?? null,
				broll: s.broll ?? null,
				cta: s.cta ?? null,
				rawContent: s.rawContent,
				createdAt: new Date(),
			} as PipelineScript;
			this.scripts.push(row);
		}
		return this.scripts.filter((s) => s.runId === runId);
	}

	async findScriptsByRun(runId: string): Promise<PipelineScript[]> {
		return this.scripts.filter((s) => s.runId === runId);
	}

	clear(): void {
		this.runs = [];
		this.videos = [];
		this.scripts = [];
	}
}
