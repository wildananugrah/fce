import type { PrismaClient } from "@prisma/client";
import { APIFY_ACTORS } from "../config/apify-actors";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";

interface ResearchRunJobData {
	researchRunId: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ResearchRunJob {
	constructor(
		private prisma: PrismaClient,
		private apifyProvider: IApifyProvider,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: ResearchRunJobData): Promise<void> {
		const { researchRunId } = data;

		const run = await this.prisma.researchRun.findUnique({
			where: { id: researchRunId },
		});
		if (!run) {
			this.logger.error("Research run not found", { researchRunId });
			return;
		}

		const settings = await this.prisma.workspaceSetting.findUnique({
			where: { workspaceId: run.workspaceId },
		});
		if (!settings?.apifyApiKey) {
			await this.failRun(run.id, run.userId, run.actorType, "No Apify API key configured");
			return;
		}
		const apiKey = settings.apifyApiKey;

		const actorConfig = APIFY_ACTORS[run.actorType as keyof typeof APIFY_ACTORS];
		if (!actorConfig) {
			await this.failRun(run.id, run.userId, run.actorType, `Unknown actor type: ${run.actorType}`);
			return;
		}

		try {
			const { runId: apifyRunId } = await this.apifyProvider.runActor(
				actorConfig.actorId,
				run.input as Record<string, any>,
				apiKey,
			);

			await this.prisma.researchRun.update({
				where: { id: run.id },
				data: { apifyRunId, status: "running", startedAt: new Date() },
			});

			let delay = 1000;
			const maxDelay = 30000;
			const timeout = 5 * 60 * 1000;
			const startTime = Date.now();

			while (Date.now() - startTime < timeout) {
				await sleep(delay);
				const status = await this.apifyProvider.getRunStatus(apifyRunId, apiKey);

				if (status.status === "SUCCEEDED") {
					break;
				}
				if (
					status.status === "FAILED" ||
					status.status === "ABORTED" ||
					status.status === "TIMED-OUT"
				) {
					await this.failRun(run.id, run.userId, run.actorType, `Apify run ${status.status}`);
					return;
				}

				delay = Math.min(delay * 2, maxDelay);
			}

			if (Date.now() - startTime >= timeout) {
				await this.failRun(
					run.id,
					run.userId,
					run.actorType,
					"Apify run timed out after 5 minutes",
				);
				return;
			}

			const rawResults = await this.apifyProvider.getRunResults(apifyRunId, apiKey);
			const parsed = actorConfig.parser.parse(rawResults);

			let resultCount = 0;
			if (parsed.length > 0) {
				resultCount = await this.prisma.researchResult
					.createMany({
						data: parsed.map((r) => ({
							runId: run.id,
							workspaceId: run.workspaceId,
							dataType: r.dataType,
							title: r.title ?? null,
							url: r.url ?? null,
							content: r.content,
							metadata: r.metadata,
							scrapedAt: r.scrapedAt,
						})),
					})
					.then((r) => r.count);
			}

			await this.prisma.researchRun.update({
				where: { id: run.id },
				data: { status: "completed", resultCount, completedAt: new Date() },
			});

			this.notificationService.notify(run.userId, {
				type: "research_run_complete",
				data: { runId: run.id, actorType: run.actorType, resultCount },
			});

			this.logger.info("Research run completed", {
				runId: run.id,
				actorType: run.actorType,
				resultCount,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			await this.failRun(run.id, run.userId, run.actorType, message);
		}
	}

	private async failRun(
		runId: string,
		userId: string,
		actorType: string,
		errorMessage: string,
	): Promise<void> {
		await this.prisma.researchRun.update({
			where: { id: runId },
			data: { status: "failed", errorMessage, completedAt: new Date() },
		});
		this.notificationService.notify(userId, {
			type: "research_run_failed",
			data: { runId, actorType, errorMessage },
		});
		this.logger.error("Research run failed", { runId, actorType, error: errorMessage });
	}
}
