import { useEffect } from "react";
import { api } from "../../../services/api";
import { useChatStream, type ChatMessage } from "../../../hooks/useChatStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  workspaceId: string;
  campaignId: string;
  brandId: string | null;
  onPlanEdit?: (revisionId: string) => void;
  onTopicsChanged?: () => void;
  onSummaryChanged?: () => void;
}

interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ChatMessage["blocks"];
  attachments: ChatMessage["attachments"];
  createdAt: string;
}

export function ChatPanel({
  workspaceId,
  campaignId,
  brandId,
  onPlanEdit,
  onTopicsChanged,
  onSummaryChanged,
}: ChatPanelProps) {
  const { messages, isStreaming, send, replaceAll } = useChatStream({
    workspaceId,
    campaignId,
    onPlanEdit,
    onTopicsChanged,
    onSummaryChanged,
  });

  useEffect(() => {
    api<PersistedMessage[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat`)
      .then((rows) => {
        replaceAll(
          rows.map((r) => ({
            id: r.id,
            role: r.role,
            blocks: r.contentBlocks,
            attachments: r.attachments,
            createdAt: r.createdAt,
          })),
        );
      })
      .catch(() => {
        // Silent — empty transcript is fine for fresh campaigns.
      });
  }, [workspaceId, campaignId, replaceAll]);

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <MessageList messages={messages} workspaceId={workspaceId} brandId={brandId} />
      <ChatInput
        workspaceId={workspaceId}
        campaignId={campaignId}
        onSend={(content, attachments) => send({ content, attachments })}
        disabled={isStreaming}
      />
    </div>
  );
}
