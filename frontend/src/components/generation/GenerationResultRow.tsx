import { useState } from "react";
import { ChevronRight, ChevronDown, Eye, Check, X, Save, Loader2 } from "lucide-react";
import { api } from "../../services/api";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface Generation {
  id: string;
  status: string;
  platform: string;
  contentType: string;
  createdAt: string;
  brand?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
}

interface GenerationResultRowProps {
  generation: Generation;
  workspaceId: string;
  onApproved: (id: string) => void;
  onViewFull: (generation: Generation) => void;
  getPlatformStyle: (platform: string) => { bg: string; text: string };
  getStatusStyle: (status: string) => string;
  getStatusDot: (status: string) => string;
  formatRelativeDate: (date: string) => string;
}

export function GenerationResultRow({
  generation,
  workspaceId,
  onApproved,
  onViewFull,
  getPlatformStyle,
  getStatusStyle,
  getStatusDot,
  formatRelativeDate,
}: GenerationResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [outputId, setOutputId] = useState<string | null>(null);

  const isDirty = Object.keys(editedSections).length > 0;

  const fetchSections = async () => {
    if (sections !== null) return;
    setLoading(true);
    try {
      const res = await api<{
        data: {
          outputs: Array<{
            id: string;
            sections: Section[];
          }>;
        };
      }>(`/api/workspaces/${workspaceId}/generations/${generation.id}`);
      const data = (res as any).data ?? res;
      const output = data.outputs?.[0];
      if (output) {
        setOutputId(output.id);
        setSections(output.sections ?? []);
      } else {
        setSections([]);
      }
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      fetchSections();
    }
    setExpanded(!expanded);
  };

  const getSectionText = (type: string): string => {
    if (!sections) return "";
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return "";
    return editedSections[section.id] ?? section.contentText;
  };

  const handleFieldChange = (type: string, value: string) => {
    if (!sections) return;
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return;
    if (value === section.contentText) {
      setEditedSections((prev) => {
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
    } else {
      setEditedSections((prev) => ({ ...prev, [section.id]: value }));
    }
  };

  const handleSave = async () => {
    if (!outputId || !isDirty) return;
    setSaving(true);
    try {
      const updates = Object.entries(editedSections).map(([id, contentText]) => ({
        id,
        contentText,
      }));
      await api(`/api/workspaces/${workspaceId}/library/${outputId}/sections/bulk`, {
        method: "PATCH",
        body: JSON.stringify({ sections: updates }),
      });
      setSections((prev) =>
        prev
          ? prev.map((s) =>
              editedSections[s.id] !== undefined
                ? { ...s, contentText: editedSections[s.id] }
                : s
            )
          : prev
      );
      setEditedSections({});
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!outputId) return;
    setStatusUpdating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (newStatus === "approved") {
        onApproved(generation.id);
      }
    } catch {
      // silently fail
    } finally {
      setStatusUpdating(false);
    }
  };

  const ps = getPlatformStyle(generation.platform);

  return (
    <>
      {/* Main row */}
      <tr
        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
        onClick={handleToggle}
      >
        <td className="px-4 py-2.5 w-8">
          {expanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
        </td>
        <td className="px-4 py-2.5">
          <p className="text-sm text-gray-800">{generation.brand?.name ?? "—"}</p>
          {generation.product?.name && (
            <p className="text-xs text-gray-400">{generation.product.name}</p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${ps.bg} ${ps.text}`}
          >
            {generation.platform}
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700 capitalize">
          {generation.contentType?.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusStyle(generation.status)}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(generation.status)}`} />
            {generation.status}
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatRelativeDate(generation.createdAt)}
          </p>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {generation.status === "completed" && (
              <>
                <button
                  type="button"
                  onClick={() => onViewFull(generation)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-md hover:bg-indigo-50"
                  title="View full preview"
                >
                  <Eye size={14} />
                </button>
                {outputId && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("approved")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-md hover:bg-green-50"
                      title="Approve — move to library"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("rejected")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
                      title="Reject"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded content */}
      {expanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-gray-50/50">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : sections && sections.length > 0 ? (
              <div className="space-y-3 max-w-2xl">
                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Copy in Visual (Hook)
                  </label>
                  <input
                    type="text"
                    value={getSectionText("hook")}
                    onChange={(e) => handleFieldChange("hook", e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                    placeholder="No hook generated"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Visual Direction
                  </label>
                  <textarea
                    value={getSectionText("visual_direction")}
                    onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No visual direction generated"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                    Caption
                  </label>
                  <textarea
                    value={getSectionText("caption")}
                    onChange={(e) => handleFieldChange("caption", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No caption generated"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isDirty
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {saving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                  {isDirty && (
                    <span className="text-[10px] text-amber-500">Unsaved changes</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No content sections available. Content may still be processing.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
