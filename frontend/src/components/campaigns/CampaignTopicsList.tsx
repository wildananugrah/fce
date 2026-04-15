import { useNavigate } from "react-router-dom";
import { Layers, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";

interface Topic {
  id: string;
  title: string;
  description: string | null;
  pillar: string | null;
  platform: string | null;
  format: string | null;
  objective: string | null;
  brandId: string | null;
  products?: Array<{ product: { id: string } }>;
}

interface CampaignTopicsListProps {
  topics: Topic[];
}

export function CampaignTopicsList({ topics }: CampaignTopicsListProps) {
  const navigate = useNavigate();

  const handleGenerate = (topic: Topic) => {
    const params = new URLSearchParams();
    params.set("topicId", topic.id);
    if (topic.brandId) params.set("brandId", topic.brandId);
    if (topic.platform) params.set("platform", topic.platform);
    if (topic.format) params.set("format", topic.format);
    if (topic.objective) params.set("objective", topic.objective);
    topic.products?.forEach((tp) => params.append("productId", tp.product.id));
    navigate(`/generate?${params.toString()}`);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">
          Generated Topics ({topics.length})
        </h2>
      </div>
      {topics.length === 0 ? (
        <p className="text-sm text-gray-400">No topics generated.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {topics.map((topic) => (
            <li key={topic.id} className="py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{topic.title}</p>
                {topic.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{topic.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {topic.pillar && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      {topic.pillar}
                    </span>
                  )}
                  {topic.platform && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {topic.platform}
                    </span>
                  )}
                  {topic.format && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                      {topic.format}
                    </span>
                  )}
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => handleGenerate(topic)}>
                <Sparkles size={12} className="mr-1" />
                Generate
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
