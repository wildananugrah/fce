import { User, Sparkles, AlertTriangle } from "lucide-react";
import type { ChatMessage } from "../../../hooks/useChatStream";
import { MentionedText } from "./blocks/MentionedText";
import { PlanEditBlock } from "./blocks/PlanEditBlock";
import { SummaryEditBlock } from "./blocks/SummaryEditBlock";
import { TextBlock } from "./blocks/TextBlock";
import { TopicsBlock } from "./blocks/TopicsBlock";
import { TypingIndicator } from "./TypingIndicator";

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
            <TypingIndicator label="Thinking" />
          )}
          <div className="space-y-2">
            {message.blocks.map((b, i) => {
              if (b.type === "text") {
                // Render user-authored text with mention pills; assistant text
                // goes through the markdown renderer.
                if (!isAssistant) {
                  return <MentionedText key={i} content={b.content} skillIds={message.skillIds} />;
                }
                return <TextBlock key={i} content={b.content} />;
              }
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
            {isAssistant && message.isStreaming && message.blocks.length > 0 && (
              <TypingIndicator label="Typing" />
            )}
            {message.interrupted && (
              <p className="text-[11px] italic text-gray-500">Interrupted by you.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
