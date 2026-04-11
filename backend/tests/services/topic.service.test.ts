import { afterEach, describe, expect, it } from "bun:test";
import { TopicService } from "../../src/services/topic.service";

// ─── Mock repository ────────────────────────────────────────────
class MockTopicRepository {
	topics: any[] = [];

	async findByWorkspace(workspaceId: string) {
		return this.topics.filter((t) => t.workspaceId === workspaceId);
	}

	async findById(id: string) {
		return this.topics.find((t) => t.id === id) ?? null;
	}

	async create(data: any) {
		const topic = {
			id: crypto.randomUUID(),
			...data,
			status: "draft",
			createdAt: new Date(),
			updatedAt: new Date(),
			products: (data.productIds ?? []).map((pid: string) => ({
				id: crypto.randomUUID(),
				product: { id: pid, name: `Product ${pid.slice(0, 4)}` },
			})),
		};
		this.topics.push(topic);
		return topic;
	}

	async update(id: string, data: any) {
		const idx = this.topics.findIndex((t) => t.id === id);
		if (idx === -1) throw new Error("Topic not found");
		this.topics[idx] = { ...this.topics[idx], ...data, updatedAt: new Date() };
		return this.topics[idx];
	}

	async deleteMany(workspaceId: string, ids: string[]) {
		const before = this.topics.length;
		this.topics = this.topics.filter((t) => !(t.workspaceId === workspaceId && ids.includes(t.id)));
		return before - this.topics.length;
	}

	async updateManyStatus(workspaceId: string, ids: string[], status: string) {
		let count = 0;
		for (const t of this.topics) {
			if (t.workspaceId === workspaceId && ids.includes(t.id)) {
				t.status = status;
				count++;
			}
		}
		return count;
	}

	clear() {
		this.topics = [];
	}
}

// ─── Mock PgBoss ────────────────────────────────────────────────
class MockPgBoss {
	sentJobs: { name: string; data: unknown }[] = [];

	async send(name: string, data: unknown): Promise<string | null> {
		this.sentJobs.push({ name, data });
		return crypto.randomUUID();
	}

	clear() {
		this.sentJobs = [];
	}
}

describe("TopicService", () => {
	const repo = new MockTopicRepository();
	const boss = new MockPgBoss();
	const service = new TopicService(repo as any, boss as any);

	afterEach(() => {
		repo.clear();
		boss.clear();
	});

	describe("generate", () => {
		it("should enqueue topic-generation job with productIds and formats", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const productIds = [crypto.randomUUID(), crypto.randomUUID()];

			const result = await service.generate(workspaceId, userId, {
				brandId: crypto.randomUUID(),
				productIds,
				platform: "instagram",
				objective: "awareness",
				formats: ["carousel", "reels"],
				count: 5,
			});

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-generation");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.productIds).toEqual(productIds);
			expect(jobData.formats).toEqual(["carousel", "reels"]);
			expect(jobData.count).toBe(5);
		});
	});

	describe("create", () => {
		it("should create a topic with multiple productIds", async () => {
			const workspaceId = crypto.randomUUID();
			const productIds = [crypto.randomUUID(), crypto.randomUUID()];

			const topic = await service.create(workspaceId, {
				title: "Cross-product topic",
				productIds,
				brandId: crypto.randomUUID(),
			});

			expect(topic.title).toBe("Cross-product topic");
			expect((topic as any).products).toHaveLength(2);
		});
	});

	describe("regenerate", () => {
		it("should enqueue topic-regeneration job for a saved topic", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();
			const topic = await service.create(workspaceId, { title: "Old idea" });

			const result = await service.regenerate(workspaceId, userId, topic.id, "make it funnier");

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-regeneration");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.topicId).toBe(topic.id);
			expect(jobData.hint).toBe("make it funnier");
		});
	});

	describe("regeneratePreview", () => {
		it("should enqueue topic-regeneration job with preview flag", async () => {
			const workspaceId = crypto.randomUUID();
			const userId = crypto.randomUUID();

			const result = await service.regeneratePreview(
				workspaceId,
				userId,
				{ brandId: crypto.randomUUID(), platform: "instagram", format: "reels" },
				"more educational",
			);

			expect(result.jobId).toBeTruthy();
			expect(boss.sentJobs).toHaveLength(1);
			expect(boss.sentJobs[0].name).toBe("topic-regeneration");
			const jobData = boss.sentJobs[0].data as any;
			expect(jobData.preview).toBe(true);
			expect(jobData.hint).toBe("more educational");
			expect(jobData.format).toBe("reels");
		});
	});
});
