import type { TopicSummary } from "../../../../hooks/useChatStream";
import { TopicCard } from "./TopicCard";

interface TopicsBlockProps {
  topicIds: string[];
  topics?: TopicSummary[];
  workspaceId: string;
  brandId: string | null;
}

export function TopicsBlock({ topicIds, topics, workspaceId, brandId }: TopicsBlockProps) {
  if (!topics || topics.length === 0) {
    return (
      <p className="text-xs text-gray-500">Generated {topicIds.length} topics.</p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
        Proposed Topics
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {topics.map((t) => (
          <TopicCard key={t.id} topic={t} workspaceId={workspaceId} brandId={brandId} />
        ))}
      </div>
    </div>
  );
}
