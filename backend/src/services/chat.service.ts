import type { CampaignChatMessage, CampaignPlanRevision, PrismaClient } from "@prisma/client";
import type { IChatAiProvider } from "../interfaces/providers/chat-ai.provider.interface";
import type { IStorageProvider } from "../interfaces/providers/storage.provider.interface";
import type { IChatMessageRepository } from "../interfaces/repositories/chat-message.repository.interface";
import type { ICampaignRevisionRepository } from "../interfaces/repositories/campaign-revision.repository.interface";
import type {
	ChatStreamEmission,
	IChatService,
	SendChatMessageInput,
	UploadAttachmentInput,
	UploadAttachmentResult,
} from "../interfaces/services/chat.service.interface";
import type { ChatAttachment, ChatBlock, ChatMessage, ToolDefinition } from "../types/chat.types";
import { PDF_EXTRACT_MAX_CHARS, extractPdfText, truncateExtractedText } from "../utils/pdf-extractor";

interface ChatConfig {
	historyWindow: number;
	bucket: string;
}

export class ChatService implements IChatService {
	constructor(
		private prisma: PrismaClient,
		private messageRepo: IChatMessageRepository,
		private revisionRepo: ICampaignRevisionRepository,
		private chatProvider: IChatAiProvider,
		private storage: IStorageProvider,
		private config: ChatConfig,
	) {}

	async listMessages(campaignId: string): Promise<CampaignChatMessage[]> {
		return this.messageRepo.findByCampaign(campaignId);
	}

	async listRevisions(campaignId: string): Promise<CampaignPlanRevision[]> {
		return this.revisionRepo.findByCampaign(campaignId);
	}

	async uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult> {
		const allowed = [
			"application/pdf",
			"image/png",
			"image/jpeg",
			"image/webp",
		];
		if (!allowed.includes(input.file.type)) {
			throw new Error(`Unsupported file type: ${input.file.type}`);
		}
		if (input.file.size > 10 * 1024 * 1024) {
			throw new Error("File exceeds 10 MB limit");
		}

		const ext = input.file.name.split(".").pop() || "bin";
		const key = `chat-uploads/${input.campaignId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
		const buffer = Buffer.from(await input.file.arrayBuffer());
		const fileUrl = await this.storage.upload(this.config.bucket, key, buffer, input.file.type);

		let extractedText: string | undefined;
		if (input.file.type === "application/pdf") {
			try {
				const raw = await extractPdfText(fileUrl);
				extractedText = truncateExtractedText(raw, PDF_EXTRACT_MAX_CHARS);
			} catch {
				extractedText = undefined;
			}
		}

		return {
			fileUrl,
			fileName: input.file.name,
			fileType: input.file.type,
			fileSize: input.file.size,
			extractedText,
		};
	}

	async *sendMessage(input: SendChatMessageInput): AsyncIterable<ChatStreamEmission> {
		// 1. Persist the user message.
		await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "user",
			userId: input.userId,
			contentBlocks: [{ type: "text", content: input.content }],
			attachments: input.attachments,
		});

		// 2. Build system prompt + history.
		const systemPrompt = await this.buildSystemPrompt(input.campaignId);
		const history = await this.buildHistory(input.campaignId);

		// 3. Stream. Text-only v1 — tool handling added in later phases.
		const blocks: ChatBlock[] = [];
		let currentText = "";

		for await (const evt of this.chatProvider.stream({
			systemPrompt,
			messages: history,
			tools: this.getTools(),
		})) {
			if (evt.type === "text_delta") {
				currentText += evt.delta;
				yield { type: "token", delta: evt.delta };
			} else if (evt.type === "error") {
				yield { type: "error", message: evt.message };
			} else if (evt.type === "done") {
				if (currentText.length > 0) {
					blocks.push({ type: "text", content: currentText });
				}
			}
			// tool_call ignored in Phase 3 — handled in Phase 6/7.
		}

		// 4. Persist assistant message.
		const assistant = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "assistant",
			contentBlocks: blocks,
		});

		yield { type: "done", messageId: assistant.id };
	}

	async *restoreRevision(): AsyncIterable<ChatStreamEmission> {
		// Implemented in Phase 7.
		throw new Error("restoreRevision not implemented until Phase 7");
	}

	private async buildSystemPrompt(campaignId: string): Promise<string> {
		// Phase 3: minimal context. Filled out in later phases.
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: {
				outputs: { take: 1, orderBy: { createdAt: "desc" } },
				briefs: { take: 1, orderBy: { createdAt: "desc" } },
			},
		});
		return [
			"You are a campaign strategy expert helping the user refine a social media campaign.",
			"",
			"=== Current campaign plan ===",
			JSON.stringify({
				name: campaign?.name,
				objective: campaign?.objective,
				audienceSegment: campaign?.audienceSegment,
				keyMessage: campaign?.keyMessage,
				bigIdea: campaign?.outputs?.[0]?.bigIdea ?? null,
				messagingPillars: campaign?.outputs?.[0]?.messagingPillars ?? null,
			}),
			"",
			"Respond in markdown. Use tables and bullet lists where helpful.",
		].join("\n");
	}

	private async buildHistory(campaignId: string): Promise<ChatMessage[]> {
		const rows = await this.messageRepo.findLatestByCampaign(campaignId, this.config.historyWindow);
		return rows.map((m) => {
			const atts = (m.attachments as unknown as ChatAttachment[]) ?? [];
			const attachmentText = atts
				.filter((a) => a.extractedText && a.extractedText.length > 0)
				.map((a) => `\n\n[Attached file "${a.fileName}"]\n${a.extractedText}`)
				.join("");
			return {
				role: m.role as "user" | "assistant",
				text: flattenBlocks(m.contentBlocks as ChatBlock[]) + attachmentText,
				attachments: atts,
			};
		});
	}

	private getTools(): ToolDefinition[] {
		// Empty in Phase 3. Populated in Phase 6 (propose_topics) and Phase 7 (apply_plan_edit).
		return [];
	}
}

function flattenBlocks(blocks: ChatBlock[]): string {
	return blocks
		.map((b) => {
			if (b.type === "text") return b.content;
			if (b.type === "plan_edit") return `[plan was updated: ${b.summary}]`;
			if (b.type === "topics") return `[proposed ${b.topicIds.length} topics]`;
			return "";
		})
		.join("\n\n");
}
