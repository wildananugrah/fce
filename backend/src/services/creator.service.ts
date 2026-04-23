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

		const cleanUsername = input.username.trim().replace(/^@/, "");
		if (!cleanUsername) throw new Error("Username is required");

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
			input: { ...input, username: cleanUsername },
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
