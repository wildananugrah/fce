import { User, Sparkles, Loader2 } from "lucide-react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { TextBlock } from "./blocks/TextBlock";

export function Message({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex gap-3 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${isAssistant ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-600"}`}>
        {isAssistant ? <Sparkles size={14} /> : <User size={14} />}
      </div>
      <div className={`flex-1 space-y-2 ${isAssistant ? "" : "text-right"}`}>
        <div className={`inline-block text-left rounded-lg px-3 py-2 max-w-[90%] ${isAssistant ? "bg-white border border-gray-200" : "bg-indigo-600 text-white"}`}>
          {message.blocks.length === 0 && message.isStreaming && (
            <Loader2 size={14} className="animate-spin inline" />
          )}
          {message.blocks.map((b, i) => {
            if (b.type === "text") return <TextBlock key={i} content={b.content} />;
            // PlanEditBlock / TopicsBlock added in Phase 6/7.
            return null;
          })}
          {message.error && (
            <p className="text-xs text-red-600 mt-1">Error: {message.error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
