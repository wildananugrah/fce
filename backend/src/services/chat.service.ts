import type { CampaignChatMessage, CampaignPlanRevision, PrismaClient } from "@prisma/client";
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
import { logAiActivity } from "../utils/ai-activity-logger";
import { humanizeChatError } from "../utils/humanize-error";
import { PDF_EXTRACT_MAX_CHARS, extractPdfText, truncateExtractedText } from "../utils/pdf-extractor";
import { buildSkillContextFromSlugs } from "../utils/skill-context-builder";
import type { SkillRegistry } from "../config/skills/loader";
import type { AiProviderFactory } from "./ai-provider-factory.service";

interface ChatConfig {
	historyWindow: number;
	bucket: string;
}

export class ChatService implements IChatService {
	constructor(
		private prisma: PrismaClient,
		private messageRepo: IChatMessageRepository,
		private revisionRepo: ICampaignRevisionRepository,
		private aiFactory: AiProviderFactory,
		private storage: IStorageProvider,
		private config: ChatConfig,
		private skillRegistry: SkillRegistry = new Map(),
	) {}

	async listMessages(campaignId: string): Promise<CampaignChatMessage[]> {
		return this.messageRepo.findByCampaign(campaignId);
	}

	async clearMessages(campaignId: string): Promise<{ deletedCount: number }> {
		const deletedCount = await this.messageRepo.deleteByCampaign(campaignId);
		return { deletedCount };
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
		// Cap skillSlugs to keep prompt size bounded.
		const requestedSkillSlugs = Array.from(new Set(input.skillSlugs ?? [])).slice(0, 5);
		const skillCtx = buildSkillContextFromSlugs(this.skillRegistry, requestedSkillSlugs);

		// 1. Persist the user message.
		const userMsg = await this.messageRepo.create({
			campaignId: input.campaignId,
			role: "user",
			userId: input.userId,
			contentBlocks: [{ type: "text", content: input.content }],
			attachments: input.attachments,
			skillIds: skillCtx.skillSlugs,
		});

		const systemPrompt = await this.buildSystemPrompt(input.campaignId, skillCtx);
		let history = await this.buildHistory(input.campaignId);
		const chatProvider = await this.aiFactory.getChatProvider(input.workspaceId);

		const finalBlocks: ChatBlock[] = [];
		let currentText = "";
		let safety = 0;

		while (safety++ < 4) {
			let sawToolCall = false;
			const toolCalls: Array<{ id: string; name: string; input: unknown }> = [];
			let streamUsage: { inputTokens: number; outputTokens: number } | undefined;
			const turnStart = Date.now();

			for await (const evt of chatProvider.stream({
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
					yield { type: "error", message: humanizeChatError(evt.message) };
				} else if (evt.type === "done") {
					if (currentText.length > 0) {
						finalBlocks.push({ type: "text", content: currentText });
						currentText = "";
					}
					streamUsage = evt.usage;
				}
			}

			await logAiActivity(
				this.prisma,
				{
					workspaceId: input.workspaceId,
					generator: "campaign-chat",
					provider: (await this.aiFactory.getSettings(input.workspaceId)).providers.chat,
					userId: input.userId,
					systemPrompt: `<chat system prompt omitted — campaign id: ${input.campaignId}>`,
					userPrompt: input.content,
					skillSlugs: skillCtx.skillSlugs.length > 0 ? skillCtx.skillSlugs : undefined,
					skillNames: skillCtx.skillNames.length > 0 ? skillCtx.skillNames : undefined,
				},
				{
					responseJson: { blocks: finalBlocks },
					durationMs: Date.now() - turnStart,
					status: "success",
					inputTokens: streamUsage?.inputTokens,
					outputTokens: streamUsage?.outputTokens,
				},
			);

			if (!sawToolCall) break;

			// Execute each tool call.
			const toolResults: Array<{ toolUseId: string; result: unknown }> = [];
			for (const call of toolCalls) {
				const toolSection: "plan" | "summary" | "topics" | null =
					call.name === "apply_plan_edit"
						? "plan"
						: call.name === "update_document_summary"
						? "summary"
						: call.name === "propose_topics"
						? "topics"
						: null;

				if (toolSection) {
					yield { type: "section_update", section: toolSection, status: "start" };
				}

				try {
					if (call.name === "propose_topics") {
						const result = await this.executeProposeTopics(input.campaignId, call.input as any);
						finalBlocks.push({ type: "topics", topicIds: result.topicIds, mode: result.mode });
						yield {
							type: "topics",
							block: { type: "topics", topicIds: result.topicIds, mode: result.mode },
							topics: result.topics,
						};
						toolResults.push({ toolUseId: call.id, result: { ok: true, topicCount: result.topics.length, mode: result.mode } });
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
					} else if (call.name === "update_document_summary") {
						const result = await this.executeUpdateSummary(input.campaignId, call.input as any);
						finalBlocks.push({ type: "summary_edit", summary: result.summary });
						yield {
							type: "summary_edit",
							block: { type: "summary_edit", summary: result.summary },
							summary: result.summary,
						};
						toolResults.push({ toolUseId: call.id, result: { ok: true } });
					} else {
						yield { type: "error", message: `Unknown tool: ${call.name}`, toolName: call.name };
						toolResults.push({ toolUseId: call.id, result: { ok: false, error: "unknown tool" } });
					}
				} catch (e) {
					const rawMsg = e instanceof Error ? e.message : String(e);
					yield { type: "error", message: humanizeChatError(rawMsg), toolName: call.name };
					toolResults.push({ toolUseId: call.id, result: { ok: false, error: rawMsg } });
				} finally {
					if (toolSection) {
						yield { type: "section_update", section: toolSection, status: "end" };
					}
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
		args: {
			topics: Array<{ title: string; description: string; pillar: string; platform: string; format: string; objective: string; publishDate?: string }>;
			mode?: "replace" | "append";
		},
	): Promise<{ topicIds: string[]; mode: "replace" | "append"; topics: Array<{ id: string; title: string; description: string | null; pillar: string | null; platform: string | null; format: string | null; objective: string | null; publishDate: string | null }> }> {
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			select: { workspaceId: true, brandId: true, productId: true },
		});
		if (!campaign) throw new Error("Campaign not found");

		const mode: "replace" | "append" = args.mode === "replace" ? "replace" : "append";

		// Capture the state BEFORE any mutation so Rev 1 (if seeded here) reflects
		// the pre-change world.
		await this.seedRev1IfNeeded(campaignId);

		if (mode === "replace") {
			await this.prisma.contentTopic.deleteMany({ where: { campaignId } });
		}

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
			if (campaign.productId) {
				await this.prisma.contentTopicProduct.create({
					data: { contentTopicId: row.id, productId: campaign.productId },
				});
			}
			created.push(row);
		}

		// Snapshot the post-change world (full plan + summary + topics) so this
		// revision can be restored later.
		const snapshot = await this.captureFullSnapshot(campaignId);
		const label =
			mode === "replace"
				? `Regenerated topics (${created.length})`
				: `Added ${created.length} topic${created.length === 1 ? "" : "s"}`;
		await this.revisionRepo.create({
			campaignId,
			triggerMessageId: null,
			label,
			snapshot,
		});

		return {
			topicIds: created.map((r) => r.id),
			mode,
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

	private async executeUpdateSummary(
		campaignId: string,
		args: { summary: string },
	): Promise<{ summary: string }> {
		if (!args.summary || typeof args.summary !== "string") {
			throw new Error("summary is required");
		}
		// Route through executeApplyPlanEdit so a revision row is created and summary
		// edits participate in undo/restore alongside plan edits.
		await this.executeApplyPlanEdit(campaignId, null, {
			documentSummary: args.summary,
			label: "Rewrote document summary",
		});
		return { summary: args.summary };
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
			documentSummary?: string;
			label: string;
		},
	): Promise<{ revisionId: string; revisionNumber: number; summary: string; snapshot: any }> {
		// Load current state.
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: {
				outputs: { take: 1, orderBy: { createdAt: "desc" } },
				briefs: { take: 1, orderBy: { createdAt: "desc" } },
			},
		});
		if (!campaign) throw new Error("Campaign not found");
		const output = campaign.outputs[0];
		const brief = campaign.briefs[0];

		// Seed Rev 1 if no revisions exist yet so we can always undo back to
		// the state before the very first chat-driven edit.
		await this.seedRev1IfNeeded(campaignId);

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
			if (output) {
				await this.prisma.campaignOutput.update({
					where: { id: output.id },
					data: outputPatch,
				});
			} else {
				await this.prisma.campaignOutput.create({
					data: { campaignId, ...outputPatch },
				});
			}
		}

		if (args.documentSummary !== undefined) {
			if (brief) {
				await this.prisma.campaignBrief.update({
					where: { id: brief.id },
					data: { documentSummary: args.documentSummary },
				});
			} else {
				await this.prisma.campaignBrief.create({
					data: { campaignId, documentSummary: args.documentSummary },
				});
			}
		}

		// Build post-change snapshot (reads the freshly-applied state from DB so
		// topics / any side-effects are included alongside the plan + summary).
		const snapshot = await this.captureFullSnapshot(campaignId);

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

		// 1) Restore plan fields + summary via the usual plan-edit path (also
		//    creates the "Reverted to revision N" revision row).
		const result = await this.executeApplyPlanEdit(input.campaignId, null, {
			objective: snap.objective ?? undefined,
			audienceSegment: snap.audienceSegment ?? undefined,
			keyMessage: snap.keyMessage ?? undefined,
			bigIdea: snap.bigIdea ?? undefined,
			messagingPillars: snap.messagingPillars ?? undefined,
			documentSummary: snap.documentSummary ?? undefined,
			label: `Reverted to revision ${target.revisionNumber}`,
		});

		// 2) Restore topics if the snapshot has them. Hard replace: wipe the
		//    current topic list and recreate from the snapshot.
		if (Array.isArray(snap.topics)) {
			await this.restoreTopicsFromSnapshot(input.campaignId, snap.topics);
		}

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

	/**
	 * Reads the campaign's current plan + summary + topics from the database
	 * into a PlanSnapshot-shaped object. Used both for seeding the initial
	 * revision and for building post-change snapshots.
	 */
	private async captureFullSnapshot(campaignId: string): Promise<{
		objective: string | null;
		audienceSegment: string | null;
		keyMessage: string | null;
		bigIdea: string | null;
		messagingPillars: any;
		documentSummary: string | null;
		topics: Array<{
			title: string;
			description: string | null;
			pillar: string | null;
			platform: string | null;
			format: string | null;
			objective: string | null;
			publishDate: string | null;
			productIds: string[];
		}>;
	}> {
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: {
				outputs: { take: 1, orderBy: { createdAt: "desc" } },
				briefs: { take: 1, orderBy: { createdAt: "desc" } },
			},
		});
		const output = campaign?.outputs[0];
		const brief = campaign?.briefs[0];

		const topicRows = await this.prisma.contentTopic.findMany({
			where: { campaignId },
			orderBy: { createdAt: "asc" },
			include: { products: { select: { productId: true } } },
		});

		return {
			objective: campaign?.objective ?? null,
			audienceSegment: campaign?.audienceSegment ?? null,
			keyMessage: campaign?.keyMessage ?? null,
			bigIdea: output?.bigIdea ?? null,
			messagingPillars: (output?.messagingPillars as any) ?? null,
			documentSummary: brief?.documentSummary ?? null,
			topics: topicRows.map((t) => ({
				title: t.title,
				description: t.description,
				pillar: t.pillar,
				platform: t.platform,
				format: t.format,
				objective: t.objective,
				publishDate: t.publishDate ? t.publishDate.toISOString().slice(0, 10) : null,
				productIds: t.products.map((p) => p.productId),
			})),
		};
	}

	private async seedRev1IfNeeded(campaignId: string): Promise<void> {
		const existing = await this.revisionRepo.countByCampaign(campaignId);
		if (existing > 0) return;
		const snapshot = await this.captureFullSnapshot(campaignId);
		await this.revisionRepo.create({
			campaignId,
			triggerMessageId: null,
			label: "Initial plan",
			snapshot,
		});
	}

	private async restoreTopicsFromSnapshot(
		campaignId: string,
		topics: Array<{
			title: string;
			description: string | null;
			pillar: string | null;
			platform: string | null;
			format: string | null;
			objective: string | null;
			publishDate: string | null;
			productIds?: string[];
		}>,
	): Promise<void> {
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			select: { workspaceId: true, brandId: true },
		});
		if (!campaign) return;

		await this.prisma.contentTopic.deleteMany({ where: { campaignId } });
		for (const t of topics) {
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
			for (const productId of t.productIds ?? []) {
				await this.prisma.contentTopicProduct.create({
					data: { contentTopicId: row.id, productId },
				});
			}
		}
	}

	private async buildSystemPrompt(
		campaignId: string,
		skillCtx: ReturnType<typeof buildSkillContextFromSlugs> = {
			context: "",
			skillSlugs: [],
			skillNames: [],
			includedCount: 0,
			truncatedCount: 0,
		},
	): Promise<string> {
		const campaign = await this.prisma.campaign.findUnique({
			where: { id: campaignId },
			include: {
				outputs: { take: 1, orderBy: { createdAt: "desc" } },
				briefs: { take: 1, orderBy: { createdAt: "desc" } },
			},
		});
		const topics = await this.prisma.contentTopic.findMany({
			where: { campaignId },
			orderBy: { createdAt: "asc" },
			select: { id: true, title: true, pillar: true, platform: true, format: true },
		});

		const parts = [
			"You are a campaign strategy expert helping the user refine a social media campaign.",
			"You can edit campaign state by calling tools:",
			"- apply_plan_edit: update Big Idea / Messaging Pillars / Objective / Audience / Key Message.",
			"- propose_topics: add (mode=append) or regenerate (mode=replace) the Generated Topics list.",
			"- update_document_summary: rewrite the Document Summary shown at the top of the page.",
			"Prefer the smallest relevant tool. Do not call a tool unless the user is clearly asking to change that section.",
		];

		if (skillCtx.includedCount > 0) {
			parts.push(
				"",
				"The user invoked the following skills for this turn via @-mentions.",
				"Apply each skill's instructions when generating your response:",
				"",
				skillCtx.context,
			);
		}

		parts.push(
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
			"=== Current document summary ===",
			campaign?.briefs?.[0]?.documentSummary ?? "(none)",
			"",
			"=== Current generated topics ===",
			topics.length === 0 ? "(none)" : JSON.stringify(topics),
			"",
			"Respond in markdown. Use tables and bullet lists where helpful.",
		);

		return parts.join("\n");
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
				description:
					"Propose content topics for this campaign. Use mode=\"append\" (default) when the user wants more topics added. Use mode=\"replace\" when the user asks to regenerate, redo, or overhaul the topic list — this deletes existing campaign topics first.",
				inputSchema: {
					type: "object",
					properties: {
						mode: { type: "string", enum: ["append", "replace"] },
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
			{
				name: "update_document_summary",
				description:
					"Replace the campaign's document summary (the brief overview shown at the top of the page). Use when the user asks to rewrite, refine, shorten, or translate the summary.",
				inputSchema: {
					type: "object",
					properties: {
						summary: { type: "string" },
					},
					required: ["summary"],
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
			if (b.type === "topics")
				return `[${b.mode === "replace" ? "replaced topic list with" : "added"} ${b.topicIds.length} topics]`;
			if (b.type === "summary_edit") return `[document summary was rewritten]`;
			return "";
		})
		.join("\n\n");
}
