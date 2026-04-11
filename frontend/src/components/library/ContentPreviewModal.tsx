import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { getPreviewComponent } from "./previews/PreviewRegistry";
import { api } from "../../services/api";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  request: {
    platform: string;
    contentType: string;
    brand?: { id: string; name: string } | null;
    product?: { id: string; name: string } | null;
  };
  sections: Section[];
}

interface ContentPreviewModalProps {
  item: LibraryItem;
  workspaceId: string;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function getStatusStyle(status: string) {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

export function ContentPreviewModal({
  item,
  workspaceId,
  onClose,
  onStatusChange,
  onToast,
}: ContentPreviewModalProps) {
  const [currentStatus, setCurrentStatus] = useState(item.status);
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [savingSections, setSavingSections] = useState(false);

  const isDirty = Object.keys(editedSections).length > 0;

  const getSectionText = (type: string): string => {
    const section = item.sections.find((s) => s.sectionType === type);
    if (!section) return "";
    return editedSections[section.id] ?? section.contentText;
  };

  const handleFieldChange = (type: string, value: string) => {
    const section = item.sections.find((s) => s.sectionType === type);
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

  const handleSaveSections = async () => {
    setSavingSections(true);
    try {
      for (const [id, contentText] of Object.entries(editedSections)) {
        await api(`/api/workspaces/${workspaceId}/library/${item.id}/sections/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ contentText }),
        });
      }
      setEditedSections({});
      onToast("Changes saved", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSavingSections(false);
    }
  };

  const PreviewComponent = getPreviewComponent(item.request.contentType);
  const brandName = item.request.brand?.name ?? "Brand";
  const productName = item.request.product?.name;
  const platformLabel = item.request.platform.charAt(0).toUpperCase() + item.request.platform.slice(1);
  const contentTypeLabel = item.request.contentType.replace(/_/g, " ");
  const contentTypeCapitalized = contentTypeLabel.charAt(0).toUpperCase() + contentTypeLabel.slice(1);

  const handleCopyAll = async () => {
    const parts: string[] = [];

    // Collect from sections
    const sectionOrder = ["hook", "caption", "cta", "hashtag"];
    for (const type of sectionOrder) {
      const texts = item.sections
        .filter((s) => s.sectionType === type)
        .sort((a, b) => a.sectionOrder - b.sectionOrder)
        .map((s) => s.contentText);
      if (texts.length > 0) parts.push(texts.join("\n"));
    }

    // Fallback to content fields
    if (parts.length === 0) {
      const c = item.content;
      if (c.hook) parts.push(String(c.hook));
      if (c.headline) parts.push(String(c.headline));
      if (c.caption) parts.push(String(c.caption));
      if (c.body) parts.push(String(c.body));
      if (c.cta) parts.push(String(c.cta));
      if (Array.isArray(c.hashtags)) parts.push((c.hashtags as string[]).join(" "));
    }

    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast("Failed to copy", "error");
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setUpdating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setCurrentStatus(newStatus);
      onStatusChange(item.id, newStatus);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update status", "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {item.contentTitle ?? "Untitled Content"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {platformLabel} &middot; {contentTypeCapitalized}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy All"}
            </button>
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                editMode
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {editMode ? "Editing" : "Edit"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {editMode ? (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Copy in Visual (Hook)
                </label>
                <input
                  type="text"
                  value={getSectionText("hook")}
                  onChange={(e) => handleFieldChange("hook", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  placeholder="No hook"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Visual Direction
                </label>
                <textarea
                  value={getSectionText("visual_direction")}
                  onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                  placeholder="No visual direction"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Caption
                </label>
                <textarea
                  value={getSectionText("caption")}
                  onChange={(e) => handleFieldChange("caption", e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                  placeholder="No caption"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveSections}
                disabled={!isDirty || savingSections}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isDirty
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {savingSections ? "Saving..." : "Save Changes"}
              </button>
            </div>
          ) : (
            <PreviewComponent
              content={item.content}
              sections={item.sections}
              brandName={brandName}
              productName={productName ?? undefined}
              contentTitle={item.contentTitle ?? undefined}
              contentType={item.request.contentType}
              platform={item.request.platform}
            />
          )}
        </div>

        {/* Footer — Status dropdown */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <span className="text-xs font-medium text-gray-500">Status:</span>
          <div className="relative">
            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
              currentStatus === "approved" ? "bg-green-500" :
              currentStatus === "rejected" ? "bg-red-500" :
              currentStatus === "in_review" ? "bg-amber-500" : "bg-gray-400"
            }`} />
            <select
              value={currentStatus}
              disabled={updating}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`appearance-none pl-6 pr-8 py-1.5 text-xs font-medium border rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 capitalize ${getStatusStyle(currentStatus)}`}
            >
              <option value="approved">Approved</option>
              <option value="in_review">In Review</option>
              <option value="draft">Draft</option>
              <option value="rejected">Rejected</option>
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
