import { describe, expect, it } from "bun:test";
import { DashboardService } from "../../src/services/dashboard.service";

function createMockPrisma() {
	return {
		brand: { count: async () => 3 },
		product: { count: async () => 7 },
		generationRequest: {
			count: async () => 15,
			findMany: async () => [
				{
					id: "g1",
					platform: "instagram",
					contentType: "single_image",
					status: "completed",
					createdAt: new Date("2026-04-06"),
				},
			],
		},
		campaign: { count: async () => 4 },
		workspace: {
			findUnique: async () => ({ id: "ws1", apiUsageUsd: 12.5, apiLimitUsd: 50.0 }),
		},
	} as any;
}

describe("DashboardService", () => {
	it("should return workspace stats", async () => {
		const service = new DashboardService(createMockPrisma());
		const result = await service.getStats("ws1");
		expect(result.brandCount).toBe(3);
		expect(result.productCount).toBe(7);
		expect(result.generationCount).toBe(15);
		expect(result.campaignCount).toBe(4);
		expect(result.apiUsageUsd).toBe(12.5);
		expect(result.apiLimitUsd).toBe(50.0);
		expect(result.recentGenerations).toHaveLength(1);
	});
});
