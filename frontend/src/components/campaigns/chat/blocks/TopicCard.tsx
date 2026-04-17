import { Zap } from "lucide-react";
import type { TopicSummary } from "../../../../hooks/useChatStream";

interface TopicCardProps {
  topic: TopicSummary;
  workspaceId: string;
  brandId: string | null;
}

export function TopicCard({ topic, brandId }: TopicCardProps) {
  const params = new URLSearchParams();
  if (brandId) params.set("brandId", brandId);
  params.set("topicId", topic.id);
  if (topic.platform) params.set("platform", topic.platform);
  if (topic.format) params.set("format", topic.format);
  if (topic.objective) params.set("objective", topic.objective);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-gray-900">{topic.title}</p>
        {topic.description && (
          <p className="text-xs text-gray-600 leading-relaxed">{topic.description}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {topic.pillar && (
          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
            {topic.pillar}
          </span>
        )}
        {topic.platform && (
          <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 capitalize">
            {topic.platform}
          </span>
        )}
        {topic.format && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
            {topic.format.replace(/_/g, " ")}
          </span>
        )}
      </div>
      <a
        href={`/generate?${params.toString()}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
      >
        <Zap size={12} />
        Generate Content
      </a>
    </div>
  );
}
