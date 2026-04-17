// Message block shapes — match what gets stored in CampaignChatMessage.contentBlocks.
export type ChatBlock =
	| { type: "text"; content: string }
	| { type: "plan_edit"; revisionId: string; summary: string }
	| { type: "topics"; topicIds: string[] };

// Attachment shape — stored on CampaignChatMessage.attachments.
export interface ChatAttachment {
	fileUrl: string;
	fileName: string;
	fileType: string; // MIME
	fileSize: number;
	extractedText?: string;
}

// Provider-agnostic chat message shape passed to IChatAiProvider.
export interface ChatMessage {
	role: "user" | "assistant";
	text: string; // already flattened from blocks for history
	attachments?: ChatAttachment[];
}

// JSON Schema fragment — both providers accept it.
export interface ToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
}
