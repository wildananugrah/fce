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
		const userMsg = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "user",
			userId: input.userId,
			contentBlocks: [{ type: "text", content: input.content }],
			attachments: input.attachments,
		});

		const systemPrompt = await this.buildSystemPrompt(input.campaignId);
		let history = await this.buildHistory(input.campaignId);

		const finalBlocks: ChatBlock[] = [];
		let currentText = "";
		let safety = 0;

		while (safety++ < 4) {
			let sawToolCall = false;
			const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];

			for await (const evt of this.chatProvider.stream({
				systemPrompt,
				messages: history,
				tools: this.getTools(),
			})) {
				if (evt.type === "text_delta") {
					currentText += evt.delta;
					yield { type: "token", delta: evt.delta };
				} else if (evt.type === "tool_call") {
					sawToolCall = true;
					toolCalls.push({ id: evt.id, name: evt.name, input: evt.input });
				} else if (evt.type === "error") {
					yield { type: "error", message: evt.message };
				} else if (evt.type === "done") {
					if (currentText.length > 0) {
						finalBlocks.push({ type: "text", content: currentText });
						currentText = "";
					}
				}
			}

			if (!sawToolCall) break;

			// Execute each tool call.
			const toolResults: Array<{ toolUseId: string; result: unknown }> = [];
			for (const call of toolCalls) {
				try {
					if (call.name === "propose_topics") {
						const result = await this.executeProposeTopics(input.campaignId, call.input as any);
						finalBlocks.push({ type: "topics", topicIds: result.topicIds });
						yield {
							type: "topics",
							block: { type: "topics", topicIds: result.topicIds },
							topics: result.topics,
						};
						toolResults.push({ toolUseId: call.id, result: { ok: true, topicCount: result.topics.length } });
					} else if (call.name === "apply_plan_edit") {
						const result = await this.executeApplyPlanEdit(input.campaignId, null, call.input as any);
						finalBlocks.push({ type: "plan_edit", revisionId: result.revisionId, summary: result.summary });
						yield {
							type: "plan_edit",
							block: { type: "plan_edit", revisionId: result.revisionId, summary: result.summary },
							revisionId: result.revisionId,
							revisionNumber: result.revisionNumber,
							snapshot: result.snapshot,
						};
						toolResults.push({ toolUseId: call.id, result: { ok: true, revisionId: result.revisionId, revisionNumber: result.revisionNumber } });
					} else {
						yield { type: "error", message: `Unknown tool: ${call.name}`, toolName: call.name };
						toolResults.push({ toolUseId: call.id, result: { ok: false, error: "unknown tool" } });
					}
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					yield { type: "error", message: msg, toolName: call.name };
					toolResults.push({ toolUseId: call.id, result: { ok: false, error: msg } });
				}
			}

			// Feed the tool results back into history so the provider can wrap up.
			history = [
				...history,
				{ role: "assistant", text: `[invoked tools: ${toolCalls.map((c) => c.name).join(", ")}]` },
				{ role: "user", text: `[tool results: ${JSON.stringify(toolResults.map((r) => r.result))}]` },
			];
		}

		const assistant = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "assistant",
			contentBlocks: finalBlocks,
		});

		yield { type: "done", messageId: assistant.id };
		void userMsg;
	}

	private async executeProposeTopics(
		campaignId: string,
		args: { topics: Array<{ title: string; description: string; pillar: string; platform: string; format: string; objective: string; publishDate?: string }> },
	): Promise<{ topicIds: string[]; topics: Array<{ id: string; title: string; description: string | null; pillar: string | null; platform: string | null; format: string | null; objective: string | null; publishDate: string | null }> }> {
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			select: { workspaceId: true, brandId: true },
		});
		if (!campaign) throw new Error("Campaign not found");

		const created: any[] = [];
		for (const t of args.topics) {
			const row = await this.prisma.contentTopic.create({
				data: {
					workspaceId: campaign.workspaceId,
					brandId: campaign.brandId,
					campaignId,
					title: t.title,
					description: t.description,
					pillar: t.pillar,
					platform: t.platform,
					format: t.format,
					objective: t.objective,
					publishDate: t.publishDate ? new Date(t.publishDate) : null,
					status: "draft",
				},
			});
			created.push(row);
		}

		return {
			topicIds: created.map((r) => r.id),
			topics: created.map((r) => ({
				id: r.id,
				title: r.title,
				description: r.description,
				pillar: r.pillar,
				platform: r.platform,
				format: r.format,
				objective: r.objective,
				publishDate: r.publishDate ? r.publishDate.toISOString().slice(0, 10) : null,
			})),
		};
	}

	private async executeApplyPlanEdit(
		campaignId: string,
		triggerMessageId: string | null,
		args: {
			objective?: string;
			audienceSegment?: string;
			keyMessage?: string;
			bigIdea?: string;
			messagingPillars?: Array<{ name: string; description: string }>;
			label: string;
		},
	): Promise<{ revisionId: string; revisionNumber: number; summary: string; snapshot: any }> {
		// Load current state.
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: { outputs: { take: 1, orderBy: { createdAt: "desc" } } },
		});
		if (!campaign) throw new Error("Campaign not found");
		const output = campaign.outputs[0];

		// Seed Rev 1 if none exists.
		const existingCount = await this.revisionRepo.countByCampaign(campaignId);
		if (existingCount === 0) {
			await this.revisionRepo.create({
				campaignId,
				triggerMessageId: null,
				label: "Initial plan",
				snapshot: {
					objective: campaign.objective ?? null,
					audienceSegment: campaign.audienceSegment ?? null,
					keyMessage: campaign.keyMessage ?? null,
					bigIdea: output?.bigIdea ?? null,
					messagingPillars: (output?.messagingPillars as any) ?? null,
				},
			});
		}

		// Apply changes.
		const campaignPatch: any = {};
		if (args.objective !== undefined) campaignPatch.objective = args.objective;
		if (args.audienceSegment !== undefined) campaignPatch.audienceSegment = args.audienceSegment;
		if (args.keyMessage !== undefined) campaignPatch.keyMessage = args.keyMessage;
		if (Object.keys(campaignPatch).length > 0) {
			await this.prisma.campaign.update({ where: { id: campaignId }, data: campaignPatch });
		}

		if (args.bigIdea !== undefined || args.messagingPillars !== undefined) {
			const outputPatch: any = {};
			if (args.bigIdea !== undefined) outputPatch.bigIdea = args.bigIdea;
			if (args.messagingPillars !== undefined) outputPatch.messagingPillars = args.messagingPillars as any;
			await this.prisma.campaignOutput.upsert({
				where: { id: output?.id ?? "__none__" },
				create: { campaignId, ...outputPatch },
				update: outputPatch,
			});
		}

		// Build post-change snapshot.
		const snapshot = {
			objective: args.objective ?? campaign.objective ?? null,
			audienceSegment: args.audienceSegment ?? campaign.audienceSegment ?? null,
			keyMessage: args.keyMessage ?? campaign.keyMessage ?? null,
			bigIdea: args.bigIdea ?? output?.bigIdea ?? null,
			messagingPillars: args.messagingPillars ?? (output?.messagingPillars as any) ?? null,
		};

		const newRev = await this.revisionRepo.create({
			campaignId,
			triggerMessageId,
			label: args.label,
			snapshot,
		});

		return {
			revisionId: newRev.id,
			revisionNumber: newRev.revisionNumber,
			summary: args.label,
			snapshot,
		};
	}

	async *restoreRevision(input: {
		workspaceId: string;
		campaignId: string;
		revisionId: string;
		userId: string;
	}): AsyncIterable<ChatStreamEmission> {
		const target = await this.revisionRepo.findById(input.revisionId);
		if (!target || target.campaignId !== input.campaignId) {
			yield { type: "error", message: "Revision not found" };
			return;
		}

		const snap = target.snapshot as any;
		const result = await this.executeApplyPlanEdit(input.campaignId, null, {
			objective: snap.objective ?? undefined,
			audienceSegment: snap.audienceSegment ?? undefined,
			keyMessage: snap.keyMessage ?? undefined,
			bigIdea: snap.bigIdea ?? undefined,
			messagingPillars: snap.messagingPillars ?? undefined,
			label: `Reverted to revision ${target.revisionNumber}`,
		});

		const assistant = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "assistant",
			contentBlocks: [{ type: "plan_edit", revisionId: result.revisionId, summary: result.summary }],
		});

		yield {
			type: "plan_edit",
			block: { type: "plan_edit", revisionId: result.revisionId, summary: result.summary },
			revisionId: result.revisionId,
			revisionNumber: result.revisionNumber,
			snapshot: result.snapshot,
		};
		yield { type: "done", messageId: assistant.id };
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
		return [
			{
				name: "apply_plan_edit",
				description:
					"Update one or more fields on the campaign plan. Omit fields you're not changing. Always include a short human-readable label.",
				inputSchema: {
					type: "object",
					properties: {
						objective:       { type: "string" },
						audienceSegment: { type: "string" },
						keyMessage:      { type: "string" },
						bigIdea:         { type: "string" },
						messagingPillars: {
							type: "array",
							items: {
								type: "object",
								properties: { name: { type: "string" }, description: { type: "string" } },
								required: ["name", "description"],
							},
						},
						label: { type: "string" },
					},
					required: ["label"],
				},
			},
			{
				name: "propose_topics",
				description: "Propose a list of content topics for this campaign. Topics auto-save to the Topic Library.",
				inputSchema: {
					type: "object",
					properties: {
						topics: {
							type: "array",
							items: {
								type: "object",
								properties: {
									title: { type: "string" }, description: { type: "string" }, pillar: { type: "string" },
									platform: { type: "string" }, format: { type: "string" }, objective: { type: "string" },
									publishDate: { type: "string" },
								},
								required: ["title", "description", "pillar", "platform", "format", "objective"],
							},
						},
					},
					required: ["topics"],
				},
			},
		];
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
