import type { PrismaClient, WorkspaceSetting } from "@prisma/client";

export type AiSettingsPatch = Partial<{
	aiProvider: string | null;
	aiContentProvider: string | null;
	aiCampaignProvider: string | null;
	aiTopicProvider: string | null;
	aiBrandScraperProvider: string | null;
	aiChatProvider: string | null;
	anthropicApiKey: string | null;
	anthropicModel: string | null;
	geminiApiKey: string | null;
	geminiModel: string | null;
	geminiImageModel: string | null;
	openrouterApiKey: string | null;
	openrouterModel: string | null;
	openrouterContentModel: string | null;
	openrouterCampaignModel: string | null;
	openrouterTopicModel: string | null;
	openrouterBrandScraperModel: string | null;
	openrouterChatModel: string | null;
	openrouterImageModel: string | null;
	openrouterVideoModel: string | null;
	openrouterCreditAlertEmail: string | null;
	openrouterCreditAlertThreshold: number | null;
}>;

/**
 * Thin repo over the `workspace_settings` table. Intentionally a separate
 * module from research.repository so AI settings evolve independently of the
 * Apify integration's code path.
 */
export class WorkspaceSettingRepository {
	constructor(private prisma: PrismaClient) {}

	async findByWorkspace(workspaceId: string): Promise<WorkspaceSetting | null> {
		return this.prisma.workspaceSetting.findUnique({ where: { workspaceId } });
	}

	async upsertAiSettings(workspaceId: string, patch: AiSettingsPatch): Promise<WorkspaceSetting> {
		// Only the fields caller explicitly set land in the update — undefined
		// keys fall through, so callers clear a value by passing `null`.
		return this.prisma.workspaceSetting.upsert({
			where: { workspaceId },
			update: patch,
			create: { workspaceId, ...patch },
		});
	}
}
