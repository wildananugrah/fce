import type { Creator } from "@prisma/client";
import type { PgBoss } from "pg-boss";
import type { ICreatorRepository } from "../interfaces/repositories/creator.repository.interface";
import type { ICreatorService } from "../interfaces/services/creator.service.interface";
import type { ILogger } from "../interfaces/providers/logger.provider.interface";
import type {
	CreateCreatorInput,
	CreatorFilters,
	UpdateCreatorInput,
} from "../types/competitor-analyzer.types";

const SUPPORTED_PLATFORMS_V1 = new Set(["tiktok"]);

/**
 * Pull the handle out of a TikTok URL: matches `/@handle` anywhere in the
 * path. Returns null if the URL doesn't look like a TikTok profile link.
 */
function extractTikTokHandle(url: string): string | null {
	const match = url.match(/\/@([A-Za-z0-9._-]+)/);
	return match ? match[1] : null;
}

/** Canonical TikTok profile URL for a bare handle. */
function tikTokProfileUrl(username: string): string {
	return `https://www.tiktok.com/@${username}`;
}

export class CreatorService implements ICreatorService {
	constructor(
		private creatorRepository: ICreatorRepository,
		private boss: PgBoss,
		private logger: ILogger,
	) {}

	async create(
		workspaceId: string,
		projectId: string,
		userId: string,
		input: CreateCreatorInput,
	): Promise<Creator> {
		if (!SUPPORTED_PLATFORMS_V1.has(input.platform)) {
			throw new Error(`Platform not supported in v1: ${input.platform}`);
		}

		// Accept any one of: (url only), (username only), (both).
		// Derive the missing one from the provided one.
		const providedUrl = (input.profileUrl ?? "").trim();
		const providedUsername = (input.username ?? "").trim().replace(/^@/, "");

		let cleanUsername = providedUsername;
		let cleanProfileUrl = providedUrl;

		if (!cleanUsername && cleanProfileUrl && input.platform === "tiktok") {
			const derived = extractTikTokHandle(cleanProfileUrl);
			if (!derived) {
				throw new Error("Could not extract username from TikTok URL");
			}
			cleanUsername = derived;
		}
		if (!cleanProfileUrl && cleanUsername && input.platform === "tiktok") {
			cleanProfileUrl = tikTokProfileUrl(cleanUsername);
		}

		if (!cleanUsername) {
			throw new Error("Provide a TikTok URL or a username");
		}

		const niche = (input.niche ?? "").trim() || null;

		const exists = await this.creatorRepository.existsByUsername(
			projectId,
			input.platform,
			cleanUsername,
		);
		if (exists) {
			throw new Error(`Creator @${cleanUsername} already exists on ${input.platform}`);
		}

		const creator = await this.creatorRepository.create({
			workspaceId,
			projectId,
			createdBy: userId,
			input: {
				...input,
				username: cleanUsername,
				profileUrl: cleanProfileUrl,
				niche: niche ?? undefined,
			},
		});

		await this.boss.send("creator-enrichment", { creatorId: creator.id });
		this.logger.info("Creator created and enrichment enqueued", {
			creatorId: creator.id,
			platform: creator.platform,
		});

		return creator;
	}

	async list(projectId: string, filters?: CreatorFilters): Promise<Creator[]> {
		return this.creatorRepository.findByProject(projectId, filters);
	}

	async get(id: string): Promise<Creator> {
		const creator = await this.creatorRepository.findById(id);
		if (!creator) throw new Error("Creator not found");
		return creator;
	}

	async update(id: string, input: UpdateCreatorInput): Promise<Creator> {
		await this.get(id); // throws if missing
		return this.creatorRepository.update(id, input);
	}

	async archive(id: string): Promise<Creator> {
		await this.get(id);
		return this.creatorRepository.archive(id);
	}

	async refreshEnrichment(id: string): Promise<Creator> {
		await this.get(id);
		const updated = await this.creatorRepository.updateEnrichment(id, {
			enrichmentStatus: "pending",
			enrichmentError: null,
		});
		await this.boss.send("creator-enrichment", { creatorId: id });
		this.logger.info("Creator enrichment refresh enqueued", { creatorId: id });
		return updated;
	}
}
