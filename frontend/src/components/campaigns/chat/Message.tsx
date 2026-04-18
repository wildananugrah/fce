import { User, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { PlanEditBlock } from "./blocks/PlanEditBlock";
import { SummaryEditBlock } from "./blocks/SummaryEditBlock";
import { TextBlock } from "./blocks/TextBlock";
import { TopicsBlock } from "./blocks/TopicsBlock";

export function Message({
  message,
  workspaceId,
  brandId,
}: {
  message: ChatMessage;
  workspaceId: string;
  brandId: string | null;
}) {
  const isAssistant = message.role === "assistant";
  return (
    <div className={`flex gap-2 ${isAssistant ? "" : "flex-row-reverse"}`}>
      <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${isAssistant ? "bg-indigo-100 text-indigo-600" : "bg-gray-200 text-gray-600"}`}>
        {isAssistant ? <Sparkles size={12} /> : <User size={12} />}
      </div>
      <div className={`flex-1 min-w-0 space-y-1.5 ${isAssistant ? "" : "text-right"}`}>
        <div className={`text-left rounded-lg px-3 py-2 overflow-hidden ${isAssistant ? "block bg-white border border-gray-200 w-full max-w-full text-gray-800" : "inline-block max-w-[85%] bg-indigo-600 text-white text-[12.5px] leading-[1.5] break-words"}`}>
          {message.blocks.length === 0 && message.isStreaming && (
            <Loader2 size={12} className="animate-spin inline" />
          )}
          <div className="space-y-2">
            {message.blocks.map((b, i) => {
              if (b.type === "text") return <TextBlock key={i} content={b.content} />;
              if (b.type === "topics")
                return (
                  <TopicsBlock
                    key={i}
                    topicIds={b.topicIds}
                    topics={b.topics}
                    workspaceId={workspaceId}
                    brandId={brandId}
                  />
                );
              if (b.type === "plan_edit")
                return <PlanEditBlock key={i} revisionId={b.revisionId} summary={b.summary} />;
              if (b.type === "summary_edit")
                return <SummaryEditBlock key={i} summary={b.summary} />;
              return null;
            })}
            {message.error && (
              <div className="flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[11.5px] leading-snug text-amber-900">
                <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-600" />
                <span>{message.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
