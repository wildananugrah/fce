import { afterEach, describe, expect, it } from "bun:test";
import { GenerationService } from "../../src/services/generation.service";
import { MockGenerationRepository } from "../helpers/mock-generation.repository";

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

// Minimal prisma mock — brand.findUnique returns a brand with a configurable language
class MockPrisma {
	brandLanguage = "id";

	brand = {
		findUnique: async (_args: unknown): Promise<{ language: string } | null> => {
			return { language: this.brandLanguage };
		},
	};
}

describe("GenerationService", () => {
	const generationRepo = new MockGenerationRepository();
	const mockBoss = new MockPgBoss();
	const mockPrisma = new MockPrisma();
	// Cast mocks to satisfy types — only the exercised methods are implemented
	const generationService = new GenerationService(generationRepo, mockBoss as any, mockPrisma as any);

	afterEach(() => {
		generationRepo.clear();
		mockBoss.clear();
		mockPrisma.brandLanguage = "id";
	});

	describe("create", () => {
		it("should create request with status 'pending' and enqueue a pgboss job", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const input = {
				brandId: crypto.randomUUID(),
				platform: "instagram",
				contentType: "reels",
				framework: "aida",
				hookType: "question",
				prompt: "Sell our new product",
			};

			// language is sourced from brand.language, not the request body
			mockPrisma.brandLanguage = "en";
			const request = await generationService.create(workspaceId, userId, input);

			// The created record should carry the correct workspace / fields
			expect(request.workspaceId).toBe(workspaceId);
			expect(request.brandId).toBe(input.brandId);
			expect(request.platform).toBe(input.platform);
			expect(request.contentType).toBe(input.contentType);
			expect(request.framework).toBe(input.framework);
			expect(request.hookType).toBe(input.hookType);
			expect(request.language).toBe("en");
			expect(request.prompt).toBe(input.prompt);

			// Status must be "pending" (set by the repository default)
			expect(request.status).toBe("pending");

			// Exactly one pgboss job should have been enqueued
			expect(mockBoss.sentJobs).toHaveLength(1);
			const job = mockBoss.sentJobs[0];
			expect(job.name).toBe("content-generation");
			expect((job.data as any).requestId).toBe(request.id);
			expect((job.data as any).userId).toBe(userId);
		});

		it("should use language from brand (not request body)", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const input = {
				brandId: crypto.randomUUID(),
				platform: "tiktok",
				contentType: "video",
				framework: "pas",
				hookType: "statement",
				// language is intentionally absent — sourced from brand.language
			};

			// mockPrisma defaults to brandLanguage = "id"
			const request = await generationService.create(workspaceId, userId, input);

			expect(request.language).toBe("id");
			expect(mockBoss.sentJobs).toHaveLength(1);
		});

		it("forwards pillars to the content-generation job", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			await generationService.create(workspaceId, userId, {
				brandId: crypto.randomUUID(),
				platform: "instagram",
				contentType: "carousel",
				framework: "aida",
				hookType: "question",
				pillars: ["Education", "Lifestyle"],
			});

			expect(mockBoss.sentJobs).toHaveLength(1);
			const job = mockBoss.sentJobs[0];
			expect(job.name).toBe("content-generation");
			expect((job.data as any).pillars).toEqual(["Education", "Lifestyle"]);
		});
	});

	describe("list", () => {
		it("should return generation requests for a workspace", async () => {
			const workspaceId = crypto.randomUUID();
			const otherWorkspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			const baseInput = {
				brandId: crypto.randomUUID(),
				platform: "instagram",
				contentType: "post",
				framework: "aida",
				hookType: "question",
			};

			await generationService.create(workspaceId, userId, baseInput);
			await generationService.create(workspaceId, userId, { ...baseInput, platform: "tiktok" });
			await generationService.create(otherWorkspaceId, userId, baseInput);

			const results = await generationService.list(workspaceId);

			expect(results).toHaveLength(2);
			for (const r of results) {
				expect(r.workspaceId).toBe(workspaceId);
			}
		});

		it("should return an empty array when workspace has no requests", async () => {
			const results = await generationService.list(crypto.randomUUID());
			expect(results).toHaveLength(0);
		});
	});

	describe("getById", () => {
		it("should return the generation request when found", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const created = await generationService.create(workspaceId, userId, {
				brandId: crypto.randomUUID(),
				platform: "instagram",
				contentType: "post",
				framework: "aida",
				hookType: "question",
			});

			const found = await generationService.getById(created.id);

			expect(found.id).toBe(created.id);
			expect(found.workspaceId).toBe(workspaceId);
			// outputs relation is included by the repository
			expect(found.outputs).toBeDefined();
		});

		it("should throw 'Generation request not found' when not found", async () => {
			await expect(generationService.getById("nonexistent-id")).rejects.toThrow(
				"Generation request not found",
			);
		});
	});
});
