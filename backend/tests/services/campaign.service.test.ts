import { afterEach, describe, expect, it } from "bun:test";
import { Decimal } from "@prisma/client/runtime/client";
import { CampaignService } from "../../src/services/campaign.service";
import { MockCampaignRepository } from "../helpers/mock-campaign.repository";

// Minimal pgboss mock — records all jobs sent via .send()
class MockPgBoss {
	sentJobs: { name: string; data: unknown }[] = [];

	async send(name: string, data: unknown): Promise<string | null> {
		this.sentJobs.push({ name, data });
		return crypto.randomUUID();
	}

	clear(): void {
		this.sentJobs = [];
	}
}

describe("CampaignService", () => {
	const campaignRepo = new MockCampaignRepository();
	const mockBoss = new MockPgBoss();
	const campaignService = new CampaignService(campaignRepo, mockBoss as any);

	afterEach(() => {
		campaignRepo.clear();
		mockBoss.clear();
	});

	describe("create", () => {
		it("should create a campaign with basic fields", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Test Campaign",
				description: "A test campaign",
				objective: "awareness",
				budget: "10000",
			});

			expect(campaign.workspaceId).toBe(workspaceId);
			expect(campaign.name).toBe("Test Campaign");
			expect(campaign.description).toBe("A test campaign");
			expect(campaign.objective).toBe("awareness");
			expect(campaign.budget).toBe("10000");
			expect(campaign.status).toBe("draft");
		});

		it("should create a campaign with new extended fields", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const productId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Extended Campaign",
				productId,
				audienceSegment: "millennials",
				durationStart: "2026-04-01T00:00:00.000Z",
				durationEnd: "2026-05-01T00:00:00.000Z",
				budgetMin: 5000,
				budgetMax: 15000,
				keyMessage: "Innovation matters",
			});

			expect(campaign.productId).toBe(productId);
			expect(campaign.audienceSegment).toBe("millennials");
			expect(campaign.durationStart).toBeInstanceOf(Date);
			expect(campaign.durationEnd).toBeInstanceOf(Date);
			expect(campaign.budgetMin).toEqual(new Decimal(5000));
			expect(campaign.budgetMax).toEqual(new Decimal(15000));
			expect(campaign.keyMessage).toBe("Innovation matters");
		});

		it("should enqueue a job when generate is true", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Generate Campaign",
				generate: true,
			});

			expect(mockBoss.sentJobs).toHaveLength(1);
			const job = mockBoss.sentJobs[0];
			expect(job.name).toBe("campaign-generation");
			expect((job.data as any).campaignId).toBe(campaign.id);
			expect((job.data as any).userId).toBe(userId);
		});

		it("should not enqueue a job when generate is false", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			await campaignService.create(workspaceId, userId, {
				name: "No Generate Campaign",
			});

			expect(mockBoss.sentJobs).toHaveLength(0);
		});
	});

	describe("list", () => {
		it("should return campaigns for a workspace", async () => {
			const workspaceId = crypto.randomUUID();
			const otherWorkspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			await campaignService.create(workspaceId, userId, {
				name: "Campaign A",
			});
			await campaignService.create(workspaceId, userId, {
				name: "Campaign B",
			});
			await campaignService.create(otherWorkspaceId, userId, {
				name: "Other Campaign",
			});

			const campaigns = await campaignService.list(workspaceId);
			expect(campaigns).toHaveLength(2);
		});
	});

	describe("getById", () => {
		it("should return campaign with outputs and briefs", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const created = await campaignService.create(workspaceId, userId, {
				name: "Find Me",
			});

			const found = await campaignService.getById(created.id);
			expect(found.id).toBe(created.id);
			expect(found.name).toBe("Find Me");
			expect(found.outputs).toBeDefined();
			expect(found.briefs).toBeDefined();
		});

		it("should throw 'Campaign not found' when not found", async () => {
			await expect(
				campaignService.getById("nonexistent-id"),
			).rejects.toThrow("Campaign not found");
		});
	});

	describe("createBrief", () => {
		it("should create a brief for a campaign", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Brief Campaign",
			});

			const brief = await campaignService.createBrief(campaign.id, {
				objectiveDetail: "Increase brand awareness among Gen Z",
				channelMix: ["instagram", "tiktok"],
				mandatoryDeliverables: ["hero-video", "carousel"],
				culturalContext: "Summer festival season",
				trendContext: "Short-form video is king",
				competitiveContext: "Competitor X launched similar campaign",
				kpiPreference: { reach: 1000000, engagement: 0.05 },
				toneDirection: "Bold and energetic",
			});

			expect(brief.campaignId).toBe(campaign.id);
			expect(brief.objectiveDetail).toBe(
				"Increase brand awareness among Gen Z",
			);
			expect(brief.channelMix).toEqual(["instagram", "tiktok"]);
			expect(brief.mandatoryDeliverables).toEqual([
				"hero-video",
				"carousel",
			]);
			expect(brief.culturalContext).toBe("Summer festival season");
			expect(brief.trendContext).toBe("Short-form video is king");
			expect(brief.competitiveContext).toBe(
				"Competitor X launched similar campaign",
			);
			expect(brief.kpiPreference).toEqual({
				reach: 1000000,
				engagement: 0.05,
			});
			expect(brief.toneDirection).toBe("Bold and energetic");
		});

		it("should create a brief with partial fields", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Partial Brief",
			});

			const brief = await campaignService.createBrief(campaign.id, {
				objectiveDetail: "Increase sales",
				toneDirection: "Professional",
			});

			expect(brief.campaignId).toBe(campaign.id);
			expect(brief.objectiveDetail).toBe("Increase sales");
			expect(brief.toneDirection).toBe("Professional");
			expect(brief.channelMix).toBeNull();
			expect(brief.trendContext).toBeNull();
		});
	});

	describe("getBrief", () => {
		it("should return the brief for a campaign", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Get Brief Campaign",
			});

			await campaignService.createBrief(campaign.id, {
				objectiveDetail: "Drive conversions",
			});

			const brief = await campaignService.getBrief(campaign.id);
			expect(brief).not.toBeNull();
			expect(brief!.objectiveDetail).toBe("Drive conversions");
		});

		it("should return null when no brief exists", async () => {
			const brief = await campaignService.getBrief(crypto.randomUUID());
			expect(brief).toBeNull();
		});
	});

	describe("updateBrief", () => {
		it("should update brief fields", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Update Brief Campaign",
			});

			const brief = await campaignService.createBrief(campaign.id, {
				objectiveDetail: "Original objective",
				toneDirection: "Casual",
			});

			const updated = await campaignService.updateBrief(brief.id, {
				objectiveDetail: "Updated objective",
				competitiveContext: "New competitor analysis",
			});

			expect(updated.objectiveDetail).toBe("Updated objective");
			expect(updated.competitiveContext).toBe("New competitor analysis");
			// toneDirection should be preserved
			expect(updated.toneDirection).toBe("Casual");
		});
	});

	describe("generateFromBrief", () => {
		it("should enqueue a campaign-generation job", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const campaign = await campaignService.create(workspaceId, userId, {
				name: "Generate from Brief",
			});

			await campaignService.generateFromBrief(campaign.id, userId);

			expect(mockBoss.sentJobs).toHaveLength(1);
			const job = mockBoss.sentJobs[0];
			expect(job.name).toBe("campaign-generation");
			expect((job.data as any).campaignId).toBe(campaign.id);
			expect((job.data as any).userId).toBe(userId);
		});

		it("should throw 'Campaign not found' for invalid campaign", async () => {
			await expect(
				campaignService.generateFromBrief(
					"nonexistent-id",
					crypto.randomUUID(),
				),
			).rejects.toThrow("Campaign not found");
		});
	});
});
