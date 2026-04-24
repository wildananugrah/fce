import { beforeEach, describe, expect, it } from "bun:test";
import { OnboardingService } from "../../src/services/onboarding.service";
import { MockUserRepository } from "../helpers/mock-user.repository";

describe("OnboardingService", () => {
	const userRepo = new MockUserRepository();

	// Minimal Prisma stub: only the three count methods are exercised. Each
	// stub's filter argument is captured so we can assert the archivedAt
	// filters match what dashboard.service.ts already uses.
	type CountArgs = { where?: Record<string, unknown> };
	const counts = {
		brand: 0,
		product: 0,
		generationRequest: 0,
	};
	const lastWhere = {
		brand: null as Record<string, unknown> | null,
		product: null as Record<string, unknown> | null,
		generationRequest: null as Record<string, unknown> | null,
	};
	const prismaStub = {
		brand: {
			count: async (args: CountArgs) => {
				lastWhere.brand = args.where ?? null;
				return counts.brand;
			},
		},
		product: {
			count: async (args: CountArgs) => {
				lastWhere.product = args.where ?? null;
				return counts.product;
			},
		},
		generationRequest: {
			count: async (args: CountArgs) => {
				lastWhere.generationRequest = args.where ?? null;
				return counts.generationRequest;
			},
		},
	} as any;

	const service = new OnboardingService(userRepo, prismaStub);

	async function freshUser() {
		userRepo.clear();
		return userRepo.create({ email: `u+${crypto.randomUUID()}@x.com`, passwordHash: "h" });
	}

	beforeEach(() => {
		counts.brand = 0;
		counts.product = 0;
		counts.generationRequest = 0;
		lastWhere.brand = null;
		lastWhere.product = null;
		lastWhere.generationRequest = null;
	});

	describe("getFlags", () => {
		it("returns null flags and empty array for a new user", async () => {
			const user = await freshUser();
			const flags = await service.getFlags(user.id);
			expect(flags.welcomeSeenAt).toBeNull();
			expect(flags.checklistDismissedAt).toBeNull();
			expect(flags.seenCoachMarks).toEqual([]);
		});

		it("throws when user does not exist", async () => {
			userRepo.clear();
			await expect(service.getFlags("missing-id")).rejects.toThrow();
		});
	});

	describe("patchFlags", () => {
		it("sets welcomeSeenAt when welcomeSeen=true on a fresh user", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { welcomeSeen: true });
			expect(flags.welcomeSeenAt).toBeInstanceOf(Date);
		});

		it("is idempotent — re-calling welcomeSeen=true leaves the timestamp unchanged", async () => {
			const user = await freshUser();
			const first = await service.patchFlags(user.id, { welcomeSeen: true });
			const firstStamp = first.welcomeSeenAt;
			const second = await service.patchFlags(user.id, { welcomeSeen: true });
			expect(second.welcomeSeenAt).toEqual(firstStamp);
		});

		it("sets checklistDismissedAt when checklistDismissed=true", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { checklistDismissed: true });
			expect(flags.checklistDismissedAt).toBeInstanceOf(Date);
		});

		it("appends to seenCoachMarks on markCoachSeen", async () => {
			const user = await freshUser();
			const flags = await service.patchFlags(user.id, { markCoachSeen: "brands" });
			expect(flags.seenCoachMarks).toEqual(["brands"]);
		});

		it("dedupes seenCoachMarks — marking the same key twice keeps one entry", async () => {
			const user = await freshUser();
			await service.patchFlags(user.id, { markCoachSeen: "brands" });
			const flags = await service.patchFlags(user.id, { markCoachSeen: "brands" });
			expect(flags.seenCoachMarks).toEqual(["brands"]);
		});

		it("accumulates multiple distinct coach-mark keys", async () => {
			const user = await freshUser();
			await service.patchFlags(user.id, { markCoachSeen: "brands" });
			await service.patchFlags(user.id, { markCoachSeen: "products" });
			const flags = await service.patchFlags(user.id, { markCoachSeen: "generate" });
			expect(flags.seenCoachMarks.sort()).toEqual(["brands", "generate", "products"]);
		});
	});

	describe("getProgress", () => {
		it("returns all false when workspace is empty", async () => {
			const progress = await service.getProgress("ws-1");
			expect(progress).toEqual({ hasBrand: false, hasProduct: false, hasGenerated: false });
		});

		it("reflects counts > 0 as true", async () => {
			counts.brand = 2;
			counts.product = 0;
			counts.generationRequest = 5;
			const progress = await service.getProgress("ws-1");
			expect(progress).toEqual({ hasBrand: true, hasProduct: false, hasGenerated: true });
		});

		it("filters out archived rows — brand.archivedAt: null must be in the where clause", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.brand).toEqual({ workspaceId: "ws-1", archivedAt: null });
		});

		it("product filter respects both product and parent brand archive state", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.product).toEqual({
				workspaceId: "ws-1",
				archivedAt: null,
				brand: { archivedAt: null },
			});
		});

		it("generation filter scopes by workspace and excludes archived rows", async () => {
			await service.getProgress("ws-1");
			expect(lastWhere.generationRequest).toEqual({
				workspaceId: "ws-1",
				archivedAt: null,
				brand: { archivedAt: null },
			});
		});
	});
});
