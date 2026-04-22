import { afterEach, describe, expect, it } from "bun:test";
import { LibraryService } from "../../src/services/library.service";

// Minimal repo mock — only the methods exercised in these tests are implemented.
class MockGenerationRepository {
	feedbackCalls: any[] = [];
	feedbackStore: any[] = [];

	async addFeedback(data: any) {
		const event = {
			id: crypto.randomUUID(),
			outputId: data.outputId,
			eventType: data.eventType,
			before: data.before ?? null,
			after: data.after ?? null,
			note: data.note ?? null,
			userId: data.userId ?? null,
			createdAt: new Date(),
		};
		this.feedbackCalls.push(data);
		this.feedbackStore.push(event);
		return event;
	}

	async findStatusChangesByOutput(outputId: string) {
		return this.feedbackStore
			.filter((e) => e.outputId === outputId && e.eventType === "status_change")
			.map((e) => ({
				...e,
				user: e.userId
					? { id: e.userId, fullName: "Test User", email: "t@example.com" }
					: null,
			}))
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	}

	async findOutputById() {
		return null;
	}

	async findById() {
		return null;
	}

	async updateOutput(id: string, data: { status: string }) {
		return { id, status: data.status } as any;
	}

	async updateManyOutputStatus() {
		return 0;
	}

	async archiveManyOutputs() {
		return 0;
	}

	async restoreManyOutputs() {
		return 0;
	}

	async deleteManyOutputs() {
		return 0;
	}

	async findOutputsByWorkspace() {
		return [];
	}

	clear() {
		this.feedbackCalls = [];
		this.feedbackStore = [];
	}
}

describe("LibraryService", () => {
	const repo = new MockGenerationRepository();
	const service = new LibraryService(repo as any);

	afterEach(() => repo.clear());

	describe("addFeedback", () => {
		it("forwards note through to the repository", async () => {
			await service.addFeedback(
				"output-1",
				"status_change",
				"user-1",
				{ status: "draft" },
				{ status: "in_review" },
				"Ready for review",
			);
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].note).toBe("Ready for review");
		});

		it("passes note as undefined when not provided", async () => {
			await service.addFeedback("output-1", "status_change", "user-1");
			expect(repo.feedbackCalls[0].note).toBeUndefined();
		});
	});

	describe("changeStatus", () => {
		it("throws when rejecting without a note", async () => {
			await expect(
				service.changeStatus("output-1", "rejected", "user-1", "draft"),
			).rejects.toThrow("A note is required when rejecting content");
		});

		it("records a status_change feedback event with the note when rejecting", async () => {
			await service.changeStatus(
				"output-1",
				"rejected",
				"user-1",
				"draft",
				"tone is off",
			);
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].eventType).toBe("status_change");
			expect(repo.feedbackCalls[0].before).toEqual({ status: "draft" });
			expect(repo.feedbackCalls[0].after).toEqual({ status: "rejected" });
			expect(repo.feedbackCalls[0].note).toBe("tone is off");
		});

		it("allows non-reject changes without a note", async () => {
			await service.changeStatus("output-1", "approved", "user-1", "in_review");
			expect(repo.feedbackCalls).toHaveLength(1);
			expect(repo.feedbackCalls[0].note).toBeUndefined();
		});
	});

	describe("listStatusHistory", () => {
		it("returns newest-first events with user info", async () => {
			await service.changeStatus("o1", "in_review", "u1", "draft", "looks good");
			await new Promise((r) => setTimeout(r, 5));
			await service.changeStatus("o1", "approved", "u2", "in_review");

			const history = await service.listStatusHistory("o1");
			expect(history).toHaveLength(2);
			expect(history[0].after).toEqual({ status: "approved" });
			expect(history[1].after).toEqual({ status: "in_review" });
			expect(history[0].user?.id).toBe("u2");
		});
	});
});
