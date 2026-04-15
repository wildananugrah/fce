import { useState, useEffect } from "react";
import { Target, Save, Loader2 } from "lucide-react";
import { api } from "../../services/api";

interface CampaignPlanCardProps {
  workspaceId: string;
  campaignId: string;
  initial: {
    objective: string;
    audienceSegment: string;
    keyMessage: string;
    bigIdea: string;
    messagingPillars: Array<{ name: string; description: string }>;
  };
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function CampaignPlanCard({
  workspaceId,
  campaignId,
  initial,
  onToast,
}: CampaignPlanCardProps) {
  const [objective, setObjective] = useState(initial.objective);
  const [audience, setAudience] = useState(initial.audienceSegment);
  const [keyMessage, setKeyMessage] = useState(initial.keyMessage);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setObjective(initial.objective);
    setAudience(initial.audienceSegment);
    setKeyMessage(initial.keyMessage);
  }, [initial.objective, initial.audienceSegment, initial.keyMessage]);

  const dirty =
    objective !== initial.objective ||
    audience !== initial.audienceSegment ||
    keyMessage !== initial.keyMessage;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({
          objective: objective.trim() || null,
          audienceSegment: audience.trim() || null,
          keyMessage: keyMessage.trim() || null,
        }),
      });
      onToast("Plan updated", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Campaign Plan</h2>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:underline"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save changes
          </button>
        )}
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
          Big Idea
        </label>
        <p className="text-sm text-gray-800">{initial.bigIdea || "—"}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Objective
          </label>
          <input
            type="text"
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
            Audience Segment
          </label>
          <input
            type="text"
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
          Key Message
        </label>
        <textarea
          value={keyMessage}
          onChange={(e) => setKeyMessage(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 resize-y"
        />
      </div>

      <div>
        <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
          Messaging Pillars
        </label>
        {initial.messagingPillars.length === 0 ? (
          <p className="text-xs text-gray-400">No pillars generated.</p>
        ) : (
          <ul className="space-y-1.5">
            {initial.messagingPillars.map((p, i) => (
              <li key={i} className="text-sm text-gray-700">
                <span className="font-medium">{p.name}:</span> {p.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
