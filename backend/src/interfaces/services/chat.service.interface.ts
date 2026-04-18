import type { CampaignChatMessage, CampaignPlanRevision } from "@prisma/client";
import type { ChatAttachment, ChatBlock } from "../../types/chat.types";

export type SectionName = "plan" | "summary" | "topics";

export type ChatStreamEmission =
	| { type: "token"; delta: string }
	| { type: "plan_edit"; block: Extract<ChatBlock, { type: "plan_edit" }>; revisionId: string; revisionNumber: number; snapshot: unknown }
	| { type: "topics"; block: Extract<ChatBlock, { type: "topics" }>; topics: Array<{ id: string; title: string; description: string | null; pillar: string | null; platform: string | null; format: string | null; objective: string | null; publishDate: string | null }> }
	| { type: "summary_edit"; block: Extract<ChatBlock, { type: "summary_edit" }>; summary: string }
	| { type: "section_update"; section: SectionName; status: "start" | "end" }
	| { type: "error"; message: string; toolName?: string }
	| { type: "done"; messageId: string };

export interface SendChatMessageInput {
	workspaceId: string;
	campaignId: string;
	userId: string;
	content: string;
	attachments?: ChatAttachment[];
	skillIds?: string[];
}

export interface UploadAttachmentInput {
	workspaceId: string;
	campaignId: string;
	file: File;
}

export interface UploadAttachmentResult {
	fileUrl: string;
	fileName: string;
	fileType: string;
	fileSize: number;
	extractedText?: string;
}

export interface IChatService {
	listMessages(campaignId: string): Promise<CampaignChatMessage[]>;
	sendMessage(input: SendChatMessageInput): AsyncIterable<ChatStreamEmission>;
	listRevisions(campaignId: string): Promise<CampaignPlanRevision[]>;
	restoreRevision(input: {
		workspaceId: string;
		campaignId: string;
		revisionId: string;
		userId: string;
	}): AsyncIterable<ChatStreamEmission>;
	uploadAttachment(input: UploadAttachmentInput): Promise<UploadAttachmentResult>;
	clearMessages(campaignId: string): Promise<{ deletedCount: number }>;
}
