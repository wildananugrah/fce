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
		const mockStorage = {
			upload: async (_b: string, _k: string, _buf: Buffer, _t: string) => `http://minio/${_k}`,
			init: async () => new Map(),
		} as any;
		service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, mockStorage, {
			historyWindow: 20,
			bucket: "test-bucket",
		});
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

describe("ChatService.sendMessage (propose_topics)", () => {
	let chatProvider: MockChatAiProvider;
	let messageRepo: MockChatMessageRepository;
	let revisionRepo: MockCampaignRevisionRepository;
	let service: ChatService;
	const createdTopics: any[] = [];
	const prisma = {
		campaign: {
			findUnique: async () => ({ id: "c1", workspaceId: "w1", name: "Test", objective: null, audienceSegment: null, keyMessage: null, outputs: [], briefs: [], brandId: null }),
		},
		campaignOutput: { findFirst: async () => null, upsert: async () => ({}) },
		brandBrainVersion: { findFirst: async () => null },
		contentTopic: {
			findMany: async () => [],
			create: async (args: any) => {
				const row = { id: crypto.randomUUID(), ...args.data };
				createdTopics.push(row);
				return row;
			},
		},
	} as unknown as PrismaClient;
	const mockStorage = { upload: async () => "http://minio/x", init: async () => new Map() } as any;

	beforeEach(() => {
		chatProvider = new MockChatAiProvider();
		messageRepo = new MockChatMessageRepository();
		revisionRepo = new MockCampaignRevisionRepository();
		createdTopics.length = 0;
		service = new ChatService(prisma, messageRepo, revisionRepo, chatProvider, mockStorage, { historyWindow: 20, bucket: "b" });
	});

	it("creates ContentTopic rows and emits a topics block", async () => {
		chatProvider.queue([
			{ type: "text_delta", delta: "Here are some ideas:" },
			{
				type: "tool_call",
				id: "call-1",
				name: "propose_topics",
				input: {
					topics: [
						{ title: "Topic 1", description: "desc 1", pillar: "Education", platform: "instagram", format: "single_image", objective: "awareness" },
						{ title: "Topic 2", description: "desc 2", pillar: "Education", platform: "tiktok", format: "tiktok_video", objective: "engagement" },
					],
				},
			},
			{ type: "done" },
		]);
		// The provider is called AGAIN after the tool call to finish the turn.
		chatProvider.queue([
			{ type: "text_delta", delta: "Let me know what you think." },
			{ type: "done" },
		]);

		const emissions: any[] = [];
		for await (const e of service.sendMessage({
			workspaceId: "w1", campaignId: "c1", userId: "u1", content: "Give me topic ideas",
		})) emissions.push(e);

		expect(createdTopics).toHaveLength(2);
		expect(createdTopics[0].title).toBe("Topic 1");

		const topicsEmission = emissions.find((e) => e.type === "topics");
		expect(topicsEmission).toBeTruthy();
		expect(topicsEmission.topics).toHaveLength(2);

		const msgs = await messageRepo.findByCampaign("c1");
		const assistant = msgs.find((m) => m.role === "assistant")!;
		const blocks = assistant.contentBlocks as any[];
		const topicsBlock = blocks.find((b) => b.type === "topics");
		expect(topicsBlock?.topicIds).toHaveLength(2);
	});
});
