export interface IRecommendationRepository {
	findByScopeTypeAndId(scopeType: string, scopeId: string): Promise<any | null>;
	upsert(
		scopeType: string,
		scopeId: string,
		data: {
			workspaceId?: string;
			preferredFrameworks?: any;
			preferredHooks?: any;
			preferredTones?: any;
			preferredVisualStyles?: any;
			preferredPlatforms?: any;
			commonEditPatterns?: any;
			sampleSize: number;
		},
	): Promise<any>;
}
