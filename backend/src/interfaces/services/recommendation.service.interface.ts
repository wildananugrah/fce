export interface IRecommendationService {
	getForBrand(brandId: string): Promise<any | null>;
	getForProduct(productId: string): Promise<any | null>;
}
