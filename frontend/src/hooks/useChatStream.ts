import { useCallback, useRef, useState } from "react";
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
  skillIds?: string[];
  createdAt: string;
  error?: string;
  isStreaming?: boolean;
  interrupted?: boolean;
}

export type ChatSection = "plan" | "summary" | "topics";

export interface UseChatStreamOptions {
  workspaceId: string;
  campaignId: string;
  onPlanEdit?: (revisionId: string) => void;
  onTopicsChanged?: () => void;
  onSummaryChanged?: () => void;
  onSectionUpdate?: (section: ChatSection, status: "start" | "end") => void;
}

interface SendArgs {
  content: string;
  attachments?: ChatAttachment[];
  skillIds?: string[];
}

export function useChatStream(opts: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const interruptedRef = useRef(false);

  const stop = useCallback(() => {
    if (!abortRef.current) return;
    interruptedRef.current = true;
    abortRef.current.abort();
  }, []);

  const send = useCallback(async ({ content, attachments, skillIds }: SendArgs) => {
    if (isStreaming) return;

    // Sections that received "start" but not yet "end". If the stream is
    // aborted or fails mid-tool, we'll emit synthetic "end" events for these
    // so the UI doesn't get stuck in a "regenerating" state.
    const pendingSections = new Set<ChatSection>();

    // Optimistic user message.
    const userMsg: ChatMessage = {
      id: `pending-user-${Date.now()}`,
      role: "user",
      blocks: [{ type: "text", content }],
      attachments,
      skillIds,
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

    const controller = new AbortController();
    abortRef.current = controller;
    interruptedRef.current = false;

    const token = getAccessToken();
    let resp: Response;
    try {
      resp = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/workspaces/${opts.workspaceId}/campaigns/${opts.campaignId}/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ content, attachments, skillIds }),
          signal: controller.signal,
        },
      );
    } catch (e) {
      const aborted = interruptedRef.current || (e instanceof DOMException && e.name === "AbortError");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                isStreaming: false,
                interrupted: aborted || undefined,
                error: aborted ? undefined : e instanceof Error ? e.message : "Request failed",
              }
            : m,
        ),
      );
      abortRef.current = null;
      setIsStreaming(false);
      return;
    }

    if (!resp.ok || !resp.body) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, isStreaming: false, error: `HTTP ${resp.status}` }
            : m,
        ),
      );
      abortRef.current = null;
      setIsStreaming(false);
      return;
    }

    try {
      for await (const evt of parseSSEStream(resp.body)) {
        if (interruptedRef.current) break;
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
        } else if (evt.event === "section_update") {
          const section = data.section as ChatSection | undefined;
          const status = data.status as "start" | "end" | undefined;
          if (section && status) {
            if (status === "start") pendingSections.add(section);
            else pendingSections.delete(section);
            opts.onSectionUpdate?.(section, status);
          }
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
      // If we exited because the user pressed Stop, mark the message interrupted.
      if (interruptedRef.current) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, isStreaming: false, interrupted: true }
              : m,
          ),
        );
      }
    } catch (e) {
      const aborted = interruptedRef.current || (e instanceof DOMException && e.name === "AbortError");
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                isStreaming: false,
                interrupted: aborted || undefined,
                error: aborted ? undefined : e instanceof Error ? e.message : "Stream failed",
              }
            : m,
        ),
      );
    } finally {
      // Close out any section_update that never got an "end" (e.g. stream was
      // aborted mid-tool) so the UI doesn't get stuck on "regenerating".
      for (const section of pendingSections) {
        opts.onSectionUpdate?.(section, "end");
      }
      pendingSections.clear();
      abortRef.current = null;
      setIsStreaming(false);
    }
  }, [isStreaming, opts]);

  const replaceAll = useCallback((msgs: ChatMessage[]) => {
    setMessages(msgs);
  }, []);

  return { messages, isStreaming, send, stop, replaceAll };
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
