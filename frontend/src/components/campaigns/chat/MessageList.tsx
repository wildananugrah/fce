import { useEffect, useRef } from "react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { Message } from "./Message";

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pausedRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - (el.scrollTop + el.clientHeight);
    pausedRef.current = distance > 100;
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          Ask me anything about this campaign.
        </p>
      ) : (
        messages.map((m) => <Message key={m.id} message={m} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
