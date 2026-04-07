import type { PrismaClient } from "@prisma/client";
import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";

export class RecommendationRepository implements IRecommendationRepository {
	constructor(private prisma: PrismaClient) {}

	async findByScopeTypeAndId(scopeType: string, scopeId: string) {
		return this.prisma.recommendationProfile.findUnique({
			where: { scopeType_scopeId: { scopeType, scopeId } },
		});
	}

	async upsert(scopeType: string, scopeId: string, data: any) {
		return this.prisma.recommendationProfile.upsert({
			where: { scopeType_scopeId: { scopeType, scopeId } },
			update: { ...data },
			create: { scopeType, scopeId, ...data },
		});
	}
}
