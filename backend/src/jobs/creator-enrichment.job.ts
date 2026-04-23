import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { IApifyProvider } from "../interfaces/providers/apify.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type { INotificationService } from "../interfaces/services/notification.service.interface";
import { TikTokProfileParser } from "../providers/apify-parsers/tiktok-profile.parser";

interface CreatorEnrichmentJobData {
	creatorId: string;
}

type ApifyKeyLookup = (workspaceId: string) => Promise<string | null>;

const APIFY_TIKTOK_ACTOR = "clockworks/free-tiktok-scraper";
const APIFY_POLL_TIMEOUT_MS = 2 * 60 * 1000; // 2 min
const APIFY_POLL_MAX_DELAY_MS = 15_000;

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export class CreatorEnrichmentJob {
	constructor(
		private creatorRepository: ICreatorRepository,
		private apifyProvider: IApifyProvider,
		private apifyKeyLookup: ApifyKeyLookup,
		private notificationService: INotificationService,
		private logger: ILogger,
	) {}

	async handle(data: CreatorEnrichmentJobData): Promise<void> {
		const { creatorId } = data;
		const start = Date.now();

		const creator = await this.creatorRepository.findById(creatorId);
		if (!creator) {
			this.logger.error("creator_enrichment_failed", {
				event: "ce_failed",
				creatorId,
				error: "Creator not found",
			});
			return;
		}

		const notifyTarget = creator.createdBy ?? creator.workspaceId;
		// ^ Fallback to workspaceId if a creator was seeded without a user (e.g.
		// from the seed script); NotificationService silently no-ops when no SSE
		// connection matches, which is fine for batch scripts.

		const apifyKey = await this.apifyKeyLookup(creator.workspaceId);
		if (!apifyKey) {
			await this.fail(creatorId, notifyTarget, "Apify API key not configured");
			return;
		}

		try {
			const { runId } = await this.apifyProvider.runActor(
				APIFY_TIKTOK_ACTOR,
				{ profiles: [creator.username], resultsPerPage: 1 },
				apifyKey,
			);

			// Poll for completion.
			let delay = 1000;
			const startPoll = Date.now();
			while (Date.now() - startPoll < APIFY_POLL_TIMEOUT_MS) {
				await sleep(delay);
				const status = await this.apifyProvider.getRunStatus(runId, apifyKey);
				if (status.status === "SUCCEEDED") break;
				if (status.status === "FAILED" || status.status === "ABORTED" || status.status === "TIMED-OUT") {
					await this.fail(creatorId, notifyTarget, `Apify actor ${status.status}`);
					return;
				}
				delay = Math.min(delay * 2, APIFY_POLL_MAX_DELAY_MS);
			}

			const items = await this.apifyProvider.getRunResults(runId, apifyKey);
			const profile = new TikTokProfileParser().parse(items);
			if (!profile) {
				await this.fail(
					creatorId,
					notifyTarget,
					"Profile not found — account may be private or deleted",
				);
				return;
			}

			await this.creatorRepository.updateEnrichment(creatorId, {
				enrichmentStatus: "enriched",
				enrichmentError: null,
				followerCount: profile.followerCount,
				avatarUrl: profile.avatarUrl,
				displayName: profile.displayName,
				bio: profile.bio,
				platformMetadata: profile.platformMetadata,
				lastEnrichedAt: new Date(),
			});

			this.notificationService.notify(notifyTarget, {
				type: "creator_enrichment_completed",
				data: { creatorId, status: "enriched" },
			});

			this.logger.info("creator_enrichment_completed", {
				event: "ce_completed",
				creatorId,
				durationMs: Date.now() - start,
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			await this.fail(creatorId, notifyTarget, msg);
		}
	}

	private async fail(creatorId: string, notifyTarget: string, error: string): Promise<void> {
		await this.creatorRepository.updateEnrichment(creatorId, {
			enrichmentStatus: "failed",
			enrichmentError: error,
			lastEnrichedAt: new Date(),
		});
		this.notificationService.notify(notifyTarget, {
			type: "creator_enrichment_completed",
			data: { creatorId, status: "failed" },
		});
		this.logger.error("creator_enrichment_failed", {
			event: "ce_failed",
			creatorId,
			error,
		});
	}
}
