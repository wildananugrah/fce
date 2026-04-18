import { useCallback, useState } from "react";
import { getAccessToken } from "../services/api";
import { parseSSEStream } from "../utils/sse-parser";

export type ChatBlock =
  | { type: "text"; content: string }
  | { type: "plan_edit"; revisionId: string; summary: string }
  | { type: "topics"; topicIds: string[]; topics?: TopicSummary[] }
  | { type: "summary_edit"; summary: string };

export interface TopicSummary {
  id: string;
  title: string;
  description: string | null;
  pillar: string | null;
  platform: string | null;
  format: string | null;
  objective: string | null;
  publishDate: string | null;
}

export interface ChatAttachment {
  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  extractedText?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  blocks: ChatBlock[];
  attachments?: ChatAttachment[];
  createdAt: string;
  error?: string;
  isStreaming?: boolean;
}

export interface UseChatStreamOptions {
  workspaceId: string;
  campaignId: string;
  onPlanEdit?: (revisionId: string) => void;
  onTopicsChanged?: () => void;
  onSummaryChanged?: () => void;
}

interface SendArgs {
  content: string;
  attachments?: ChatAttachment[];
}

export function useChatStream(opts: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const send = useCallback(async ({ content, attachments }: SendArgs) => {
    if (isStreaming) return;

    // Optimistic user message.
    const userMsg: ChatMessage = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      blocks: [{ type: "text", content }],
      attachments,
      createdAt: new Date().toISOString(),
    };
    // Placeholder assistant message for streaming.
    const assistantMsg: ChatMessage = {
      id: `pending-assistant-${Date.now()}`,
      role: "assistant",
      blocks: [],
      createdAt: new Date().toISOString(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const token = getAccessToken();
    const resp = await fetch(
      `${import.meta.env.VITE_API_URL || ""}/api/workspaces/${opts.workspaceId}/campaigns/${opts.campaignId}/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content, attachments }),
      },
    );

    if (!resp.ok || !resp.body) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, error: `HTTP ${resp.status}` }
            : m,
        ),
      );
      setIsStreaming(false);
      return;
    }

    try {
      for await (const evt of parseSSEStream(resp.body)) {
        const data = JSON.parse(evt.data);
        if (evt.event === "token") {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsg.id ? appendToken(m, data.delta) : m)),
          );
        } else if (evt.event === "plan_edit") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? appendBlock(m, { type: "plan_edit", revisionId: data.revisionId, summary: data.block?.summary ?? "" })
                : m,
            ),
          );
          opts.onPlanEdit?.(data.revisionId);
        } else if (evt.event === "topics") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? appendBlock(m, { type: "topics", topicIds: data.block?.topicIds ?? data.topicIds ?? [], topics: data.topics })
                : m,
            ),
          );
          opts.onTopicsChanged?.();
        } else if (evt.event === "summary_edit") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? appendBlock(m, { type: "summary_edit", summary: data.block?.summary ?? data.summary ?? "" })
                : m,
            ),
          );
          opts.onSummaryChanged?.();
        } else if (evt.event === "error") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, error: data.message } : m,
            ),
          );
        } else if (evt.event === "done") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, id: data.messageId, isStreaming: false }
                : m,
            ),
          );
        }
      }
    } catch (e) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, error: e instanceof Error ? e.message : "Stream failed" }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, opts]);

  const replaceAll = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return { messages, isStreaming, send, replaceAll };
}

function appendToken(msg: ChatMessage, delta: string): ChatMessage {
  const last = msg.blocks[msg.blocks.length - 1];
  if (last && last.type === "text") {
    return {
      ...msg,
      blocks: [
        ...msg.blocks.slice(0, -1),
        { type: "text", content: last.content + delta },
      ],
    };
  }
  return {
    ...msg,
    blocks: [...msg.blocks, { type: "text", content: delta }],
  };
}

function appendBlock(msg: ChatMessage, block: ChatBlock): ChatMessage {
  return { ...msg, blocks: [...msg.blocks, block] };
}
