import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

interface ReferenceFile {
  name: string;
  content: string;
}

interface SkillDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  isSystem: boolean;
  content: string;
  referenceFiles: ReferenceFile[];
  createdAt: string;
}

interface SkillDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  skillId: string | null;
  onEdit: (skill: SkillDetail) => void;
  onDelete: (skillId: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  strategy: "bg-violet-50 text-violet-700 border-violet-200",
  content: "bg-blue-50 text-blue-700 border-blue-200",
  seo: "bg-green-50 text-green-700 border-green-200",
  conversion: "bg-amber-50 text-amber-700 border-amber-200",
  outreach: "bg-pink-50 text-pink-700 border-pink-200",
  research: "bg-teal-50 text-teal-700 border-teal-200",
  growth: "bg-orange-50 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-600 border-gray-200",
};

export function SkillDetailModal({ isOpen, onClose, skillId, onEdit, onDelete }: SkillDetailModalProps) {
  const [skill, setSkill] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !skillId) {
      setSkill(null);
      return;
    }
    setLoading(true);
    api<SkillDetail>(`/api/skills/${skillId}`)
      .then((data) => setSkill(data))
      .catch(() => setSkill(null))
      .finally(() => setLoading(false));
  }, [isOpen, skillId]);

  const handleDelete = async () => {
    if (!skill) return;
    setDeleting(true);
    try {
      await api(`/api/skills/${skill.id}`, { method: "DELETE" });
      onDelete(skill.id);
      onClose();
    } catch {
      // error handled silently
    } finally {
      setDeleting(false);
    }
  };

  const categoryColor = skill ? (CATEGORY_COLORS[skill.category] ?? CATEGORY_COLORS.other) : "";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Skill Details" size="lg">
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : skill ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900">{skill.name}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${categoryColor}`}>
              {skill.category}
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                skill.isSystem
                  ? "bg-gray-100 text-gray-600 border-gray-200"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              {skill.isSystem ? "System" : "Custom"}
            </span>
          </div>

          <p className="text-sm text-gray-600">{skill.description}</p>

          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Content</h3>
            <pre className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-lg p-4 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {skill.content}
            </pre>
          </div>

          {skill.referenceFiles && skill.referenceFiles.length > 0 && (
            <div>
              <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                Reference Files
              </h3>
              <div className="space-y-2">
                {skill.referenceFiles.map((file, idx) => (
                  <details key={idx} className="bg-gray-50 border border-gray-200 rounded-lg">
                    <summary className="px-3 py-2 text-xs font-medium text-gray-700 cursor-pointer">
                      {file.name}
                    </summary>
                    <pre className="px-3 pb-3 text-xs text-gray-600 whitespace-pre-wrap">
                      {file.content}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" onClick={() => { onEdit(skill); onClose(); }}>
              Edit
            </Button>
            {!skill.isSystem && (
              <Button variant="danger" onClick={handleDelete} loading={deleting}>
                Delete
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 py-8 text-center">Skill not found.</p>
      )}
    </Modal>
  );
}
