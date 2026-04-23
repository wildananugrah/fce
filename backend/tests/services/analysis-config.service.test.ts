// backend/tests/services/analysis-config.service.test.ts
import { afterEach, describe, expect, it } from "bun:test";
import { AnalysisConfigService } from "../../src/services/analysis-config.service";
import { MockAnalysisConfigRepository } from "../helpers/mock-analysis-config.repository";
import { MockCreatorRepository } from "../helpers/mock-creator.repository";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {} } as any;

describe("AnalysisConfigService", () => {
	const configRepo = new MockAnalysisConfigRepository();
	const creatorRepo = new MockCreatorRepository();
	const service = new AnalysisConfigService(configRepo, creatorRepo, mockLogger);
	const workspaceId = crypto.randomUUID();
	const projectId = crypto.randomUUID();

	afterEach(() => {
		configRepo.clear();
		creatorRepo.clear();
	});

	describe("create", () => {
		it("requires name and brandContext", async () => {
			await expect(
				service.create(workspaceId, projectId, {
					name: "",
					brandContext: "ctx",
					analysisInstructions: "do it",
					outputPreferences: "3 scripts",
				}),
			).rejects.toThrow("Name is required");

			await expect(
				service.create(workspaceId, projectId, {
					name: "my config",
					brandContext: "",
					analysisInstructions: "do it",
					outputPreferences: "3 scripts",
				}),
			).rejects.toThrow("Brand context is required");
		});

		it("creates with trimmed values", async () => {
			const c = await service.create(workspaceId, projectId, {
				name: "  Test  ",
				brandContext: "  ctx  ",
				analysisInstructions: "instr",
				outputPreferences: "prefs",
			});
			expect(c.name).toBe("Test");
			expect(c.brandContext).toBe("ctx");
		});
	});

	describe("replaceCreators", () => {
		it("rejects creators that don't belong to the project", async () => {
			const c = await service.create(workspaceId, projectId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			// Creator belongs to a DIFFERENT project.
			const otherProjectId = crypto.randomUUID();
			const stray = await creatorRepo.create({
				workspaceId,
				projectId: otherProjectId,
				createdBy: "test-user",
				input: {
					platform: "tiktok",
					profileUrl: "u",
					username: "stray",
					niche: "x",
				},
			});
			await expect(service.replaceCreators(c.id, [stray.id], projectId)).rejects.toThrow(
				"do not belong to this project",
			);
		});

		it("replaces membership atomically", async () => {
			const c = await service.create(workspaceId, projectId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			const a = await creatorRepo.create({
				workspaceId,
				projectId,
				createdBy: "test-user",
				input: { platform: "tiktok", profileUrl: "u1", username: "a", niche: "x" },
			});
			const b = await creatorRepo.create({
				workspaceId,
				projectId,
				createdBy: "test-user",
				input: { platform: "tiktok", profileUrl: "u2", username: "b", niche: "x" },
			});

			await service.replaceCreators(c.id, [a.id, b.id], projectId);
			expect(configRepo.joinRows.filter((j) => j.configId === c.id)).toHaveLength(2);

			await service.replaceCreators(c.id, [a.id], projectId);
			const rows = configRepo.joinRows.filter((j) => j.configId === c.id);
			expect(rows).toHaveLength(1);
			expect(rows[0].creatorId).toBe(a.id);
		});
	});

	describe("delete", () => {
		it("deletes the config (runs survive via SetNull — DB-level concern, not service)", async () => {
			const c = await service.create(workspaceId, projectId, {
				name: "c",
				brandContext: "b",
				analysisInstructions: "i",
				outputPreferences: "o",
			});
			await service.delete(c.id);
			await expect(service.get(c.id)).rejects.toThrow("not found");
		});
	});
});
