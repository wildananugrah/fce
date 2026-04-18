import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Trash2 } from "lucide-react";
import { api } from "../../../services/api";
import { useChatStream, type ChatMessage, type ChatSection } from "../../../hooks/useChatStream";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";

interface ChatPanelProps {
  workspaceId: string;
  campaignId: string;
  brandId: string | null;
  onPlanEdit?: (revisionId: string) => void;
  onTopicsChanged?: () => void;
  onSummaryChanged?: () => void;
  onSectionUpdate?: (section: ChatSection, status: "start" | "end") => void;
  onToast?: (msg: string, type: "success" | "error" | "info") => void;
}

interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  contentBlocks: ChatMessage["blocks"];
  attachments: ChatMessage["attachments"];
  skillIds?: string[] | null;
  createdAt: string;
}

export function ChatPanel({
  workspaceId,
  campaignId,
  brandId,
  onPlanEdit,
  onTopicsChanged,
  onSummaryChanged,
  onSectionUpdate,
  onToast,
}: ChatPanelProps) {
  const { messages, isStreaming, send, stop, replaceAll } = useChatStream({
    workspaceId,
    campaignId,
    onPlanEdit,
    onTopicsChanged,
    onSummaryChanged,
    onSectionUpdate,
  });
  const [clearing, setClearing] = useState(false);

  const loadMessages = useCallback(() => {
    api<PersistedMessage[]>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat`)
      .then((rows) => {
        replaceAll(
          rows.map((r) => ({
            id: r.id,
            role: r.role,
            blocks: r.contentBlocks,
            attachments: r.attachments,
            skillIds: r.skillIds ?? undefined,
            createdAt: r.createdAt,
          })),
        );
      })
      .catch(() => {
        // Silent — empty transcript is fine for fresh campaigns.
      });
  }, [workspaceId, campaignId, replaceAll]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleClear = async () => {
    if (clearing || isStreaming) return;
    if (messages.length === 0) return;
    if (!confirm("Clear all chat messages for this campaign? This can't be undone.")) return;
    setClearing(true);
    try {
      await api<{ deletedCount: number }>(
        `/api/workspaces/${workspaceId}/campaigns/${campaignId}/chat`,
        { method: "DELETE" },
      );
      replaceAll([]);
      onToast?.("Chat cleared", "success");
    } catch (e) {
      onToast?.(
        e instanceof Error ? `Failed to clear chat: ${e.message}` : "Failed to clear chat",
        "error",
      );
    } finally {
      setClearing(false);
    }
  };

  const canClear = !clearing && !isStreaming && messages.length > 0;

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
          <MessageSquare size={12} className="text-gray-500" />
          <span>Chat</span>
          {messages.length > 0 && (
            <span className="text-[10px] font-normal text-gray-400">
              ({messages.length})
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleClear}
          disabled={!canClear}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-600 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-gray-600 rounded transition-colors"
          title={
            isStreaming
              ? "Stop generating first"
              : messages.length === 0
              ? "No messages to clear"
              : "Clear chat"
          }
        >
          <Trash2 size={12} />
          Clear
        </button>
      </div>
      <MessageList messages={messages} workspaceId={workspaceId} brandId={brandId} />
      <ChatInput
        workspaceId={workspaceId}
        campaignId={campaignId}
        onSend={(content, attachments, skillIds) => send({ content, attachments, skillIds })}
        onStop={stop}
        isStreaming={isStreaming}
      />
    </div>
  );
}
