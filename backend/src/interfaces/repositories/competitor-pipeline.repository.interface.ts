import type { CompetitorPipelineRun, PipelineContent, PipelineScript } from "@prisma/client";
import type { PipelineRunWithVideosAndScripts } from "../../types/competitor-analyzer.types";

export interface ICompetitorPipelineRepository {
	createRun(data: {
		workspaceId: string;
		projectId: string;
		configId: string;
		userId: string;
		videosPerCreator: number;
		lookbackPool: number;
		timeframeDays: number;
	}): Promise<CompetitorPipelineRun>;

	findRunById(id: string): Promise<PipelineRunWithVideosAndScripts | null>;

	findRunsByProject(projectId: string): Promise<CompetitorPipelineRun[]>;

	updateRun(
		id: string,
		data: Partial<CompetitorPipelineRun>,
	): Promise<CompetitorPipelineRun>;

	getRunStatus(id: string): Promise<string | null>;

	createContent(
		data: Array<{
			runId: string;
			creatorId: string;
			platform: string;
			platformPostId: string;
			contentType: string;
			contentUrl: string;
			thumbnailUrl?: string | null;
			caption?: string | null;
			viewCount?: number | null;
			likeCount?: number | null;
			shareCount?: number | null;
			commentCount?: number | null;
			hashtags?: any;
			postedAt?: Date | null;
			platformMetadata?: any;
		}>,
	): Promise<PipelineContent[]>;

	findContentByRun(runId: string): Promise<PipelineContent[]>;

	findContentById(id: string): Promise<PipelineContent | null>;

	updateContent(id: string, data: Partial<PipelineContent>): Promise<PipelineContent>;

	createScripts(
		runId: string,
		scripts: Array<{
			scriptNumber: number;
			sourceVideoId?: string | null;
			title?: string | null;
			hook?: string | null;
			body?: string | null;
			broll?: any;
			cta?: string | null;
			rawContent: any;
		}>,
	): Promise<PipelineScript[]>;

	findScriptsByRun(runId: string): Promise<PipelineScript[]>;
}
