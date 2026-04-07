import type { IRecommendationRepository } from "../interfaces/repositories/recommendation.repository.interface";
import type { IRecommendationService } from "../interfaces/services/recommendation.service.interface";

export class RecommendationService implements IRecommendationService {
	constructor(private recommendationRepository: IRecommendationRepository) {}

	async getForBrand(brandId: string) {
		return this.recommendationRepository.findByScopeTypeAndId("brand", brandId);
	}

	async getForProduct(productId: string) {
		return this.recommendationRepository.findByScopeTypeAndId("product", productId);
	}
}
