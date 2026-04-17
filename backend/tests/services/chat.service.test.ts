import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { PrismaClient } from "@prisma/client";
import { ChatService } from "../../src/services/chat.service";
import { MockChatAiProvider } from "../helpers/mock-chat-ai.provider";
import { MockChatMessageRepository } from "../helpers/mock-chat-message.repository";
import { MockCampaignRevisionRepository } from "../helpers/mock-campaign-revision.repository";

describe("ChatService.sendMessage (text-only)", () => {
	let chatProvider: MockChatAiProvider;
	let messageRepo: MockChatMessageRepository;
	let revisionRepo: MockCampaignRevisionRepository;
	let service: ChatService;
	// Stubs for the parts of Prisma the service touches.
	const prisma = {
		campaign: {
			findUnique: async () => ({ id: "c1", workspaceId: "w1", objective: null, audienceSegment: null, keyMessage: null, outputs: [], briefs: [], brandId: null }),
			update: async () => ({}),
		},
		campaignOutput: {
			findFirst: async () => null,
			upsert: async () => ({}),
		},
		brandBrainVersion: { findFirst: async () => null },
		contentTopic: {
			findMany: async () => [],
			create: async (args: any) => ({ id: crypto.randomUUID(), ...args.data }),
		},
	} as unknown as PrismaClient;

	beforeEach(() => {
		chatProvider = new MockChatAiProvider();
		messageRepo = new MockChatMessageRepository();
		revisionRepo = new MockCampaignRevisionRepository();
		service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, { historyWindow: 20 });
	});

	afterEach(() => {
		messageRepo.clear();
		revisionRepo.clear();
		chatProvider.clear();
	});

	it("persists the user message then streams assistant tokens", async () => {
		chatProvider.queue([
			{ type: "text_delta", delta: "Hello, " },
			{ type: "text_delta", delta: "world." },
			{ type: "done" },
		]);

		const emissions: any[] = [];
		for await (const e of service.sendMessage({
			workspaceId: "w1",
			campaignId: "c1",
			userId: "u1",
			content: "Hi",
		})) {
			emissions.push(e);
		}

		// User message first, assistant message second.
		const all = await messageRepo.findByCampaign("c1");
		expect(all).toHaveLength(2);
		expect(all[0].role).toBe("user");
		expect(all[1].role).toBe("assistant");

		// Stream emitted tokens + done.
		const tokens = emissions.filter((e) => e.type === "token").map((e) => e.delta);
		expect(tokens).toEqual(["Hello, ", "world."]);
		const done = emissions.find((e) => e.type === "done");
		expect(done).toBeTruthy();
		expect(done.messageId).toBe(all[1].id);

		// Assistant message blocks assembled correctly.
		const blocks = all[1].contentBlocks as any[];
		expect(blocks).toEqual([{ type: "text", content: "Hello, world." }]);
	});
});
