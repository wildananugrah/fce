import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useWorkspace } from "../../hooks/useWorkspace";
import { api } from "../../services/api";

interface SkillMapping {
  id: string;
  skillId: string;
  generator: string;
  isActive: boolean;
  skill: { id: string; slug: string; name: string; description: string; category: string };
}

interface ActiveSkillsBadgesProps {
  generator: "topic" | "content" | "campaign";
}

export function ActiveSkillsBadges({ generator }: ActiveSkillsBadgesProps) {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [mappings, setMappings] = useState<SkillMapping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api<SkillMapping[]>(
      `/api/workspaces/${activeWorkspace.id}/skills/generator/${generator}`,
    )
      .then((data) => setMappings(data))
      .catch(() => setMappings([]))
      .finally(() => setLoading(false));
  }, [activeWorkspace, generator]);

  if (loading) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {mappings.length > 0 ? (
        <>
          <span className="text-xs text-gray-400">AI Skills:</span>
          {mappings.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200"
            >
              {m.skill.name}
            </span>
          ))}
        </>
      ) : (
        <span className="text-xs text-gray-400">No AI skills configured</span>
      )}
      <button
        type="button"
        onClick={() => navigate("/skills")}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
      >
        Manage
      </button>
    </div>
  );
}
