import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { SectionViewer } from "../components/library/SectionViewer";
import type { OutputSection } from "../types";

interface LibraryItem {
  id: string;
  title?: string | null;
  contentType?: string | null;
  status: string;
  content?: string | null;
  platform?: string | null;
  createdAt: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "default";
}

function contentTypeBadgeVariant(_type: string): "success" | "default" | "danger" {
  return "default";
}

const FEEDBACK_EVENT_OPTIONS = [
  { value: "hook_edit", label: "Hook Edit" },
  { value: "copy_edit", label: "Copy Edit" },
];

// ---- Library Item Detail Modal ----
interface LibraryDetailModalProps {
  item: LibraryItem;
  workspaceId: string;
  onUpdated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function LibraryDetailModal({ item, workspaceId, onUpdated, onClose, onToast }: LibraryDetailModalProps) {
  const [updating, setUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(item.status);
  const [sections, setSections] = useState<OutputSection[]>([]);

  const fetchSections = useCallback(async (outputId: string) => {
    try {
      const secs = await api<OutputSection[]>(`/api/workspaces/${workspaceId}/library/${outputId}/sections`);
      setSections(secs);
    } catch {
      setSections([]);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchSections(item.id);
  }, [fetchSections, item.id]);

  // Feedback form
  const [feedbackEventType, setFeedbackEventType] = useState("hook_edit");
  const [beforeText, setBeforeText] = useState("");
  const [afterText, setAfterText] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleStatusChange = async (newStatus: "approved" | "rejected") => {
    setUpdating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setCurrentStatus(newStatus);
      onToast(`Content ${newStatus}`, "success");
      onUpdated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : `Failed to ${newStatus} content`, "error");
    } finally {
      setUpdating(false);
    }
  };

  const handleFeedback = async () => {
    if (!beforeText.trim() || !afterText.trim()) {
      onToast("Please fill in both before and after text", "error");
      return;
    }
    setSubmittingFeedback(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${item.id}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          eventType: feedbackEventType,
          before: beforeText.trim(),
          after: afterText.trim(),
        }),
      });
      onToast("Feedback submitted", "success");
      setBeforeText("");
      setAfterText("");
      setShowFeedback(false);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to submit feedback", "error");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={item.title ?? "Content Detail"}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          {item.contentType && (
            <Badge variant={contentTypeBadgeVariant(item.contentType)}>
              {item.contentType.replace(/_/g, " ")}
            </Badge>
          )}
          <Badge variant={statusBadgeVariant(currentStatus)}>{currentStatus}</Badge>
          {item.platform && (
            <span className="text-xs text-gray-500 capitalize">{item.platform}</span>
          )}
        </div>

        {item.content && (
          <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-auto">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.content}</p>
          </div>
        )}

        {!item.content && (
          <p className="text-sm text-gray-400 text-center py-4">No content available.</p>
        )}

        {sections.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Content Sections</h3>
            <SectionViewer
              sections={sections}
              workspaceId={workspaceId}
              outputId={item.id}
              onSectionUpdated={() => fetchSections(item.id)}
            />
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleStatusChange("approved")}
            loading={updating}
            disabled={currentStatus === "approved"}
          >
            Approve
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleStatusChange("rejected")}
            loading={updating}
            disabled={currentStatus === "rejected"}
          >
            Reject
          </Button>
          <div className="flex-1" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowFeedback(!showFeedback)}
          >
            {showFeedback ? "Hide Feedback" : "Add Feedback"}
          </Button>
        </div>

        {showFeedback && (
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">Submit Feedback</p>
            <Select
              label="Event Type"
              options={FEEDBACK_EVENT_OPTIONS}
              value={feedbackEventType}
              onChange={(e) => setFeedbackEventType(e.target.value)}
            />
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Before</label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
                rows={2}
                placeholder="Original text..."
                value={beforeText}
                onChange={(e) => setBeforeText(e.target.value)}
              />
            </div>
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">After</label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
                rows={2}
                placeholder="Edited text..."
                value={afterText}
                onChange={(e) => setAfterText(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={handleFeedback} loading={submittingFeedback}>
                Submit Feedback
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function LibraryPage() {
  const { activeWorkspace } = useWorkspace();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadItems = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const data = await api<LibraryItem[]>(`/api/workspaces/${activeWorkspace.id}/library`);
      setItems(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load library", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { loadItems(); }, [loadItems]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to view the content library.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-semibold text-black">Content Library</h1>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">No content in library yet. Generate some content first.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors"
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <p className="text-sm font-semibold text-black truncate flex-1">
                  {item.title ?? "Untitled Content"}
                </p>
                <Badge variant={statusBadgeVariant(item.status)}>{item.status}</Badge>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {item.contentType && (
                  <Badge variant="default">{item.contentType.replace(/_/g, " ")}</Badge>
                )}
                {item.platform && (
                  <span className="text-xs text-gray-500 capitalize">{item.platform}</span>
                )}
              </div>
              {item.content && (
                <p className="text-xs text-gray-400 line-clamp-2">{item.content}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {new Date(item.createdAt).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}

      {selectedItem && (
        <LibraryDetailModal
          item={selectedItem}
          workspaceId={activeWorkspace.id}
          onUpdated={loadItems}
          onClose={() => setSelectedItem(null)}
          onToast={showToast}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
