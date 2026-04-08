import { useState, useEffect, useCallback, useRef } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";

interface Topic {
  id: string;
  title: string;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  publishDate?: string | null;
  status: string;
  createdAt: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "published") return "success";
  if (status === "scheduled") return "default";
  if (status === "archived") return "danger";
  return "default";
}

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const STATUS_EDIT_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const PLATFORM_OPTIONS = [
  { value: "", label: "No platform" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
];

// ---- Topic Edit Modal ----
interface TopicEditModalProps {
  topic: Topic;
  workspaceId: string;
  onUpdated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function TopicEditModal({ topic, workspaceId, onUpdated, onClose, onToast }: TopicEditModalProps) {
  const [title, setTitle] = useState(topic.title);
  const [pillar, setPillar] = useState(topic.pillar ?? "");
  const [platform, setPlatform] = useState(topic.platform ?? "");
  const [format, setFormat] = useState(topic.format ?? "");
  const [publishDate, setPublishDate] = useState(
    topic.publishDate ? new Date(topic.publishDate).toISOString().split("T")[0] : ""
  );
  const [status, setStatus] = useState(topic.status);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/topics/${topic.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          pillar: pillar.trim() || null,
          platform: platform || null,
          format: format.trim() || null,
          publishDate: publishDate ? new Date(publishDate).toISOString() : null,
          status,
        }),
      });
      onToast("Topic updated", "success");
      onUpdated();
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update topic", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit Topic">
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input label="Pillar" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Education, Entertainment..." />
        <Select label="Platform" options={PLATFORM_OPTIONS} value={platform} onChange={(e) => setPlatform(e.target.value)} />
        <Input label="Format" value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Carousel, Reel..." />
        <div className="w-full">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Publish Date</label>
          <input
            type="date"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
            value={publishDate}
            onChange={(e) => setPublishDate(e.target.value)}
          />
        </div>
        <Select label="Status" options={STATUS_EDIT_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Save Changes</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function TopicLibraryPage() {
  const { activeWorkspace } = useWorkspace();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadTopics = useCallback(async () => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api<Topic[]>(`/api/workspaces/${activeWorkspace.id}/topics`);
      setTopics(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load topics", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  // Close status dropdown on outside click
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showStatusDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showStatusDropdown]);

  const handleBulkStatusChange = async (status: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk-status`, {
        method: "PATCH",
        body: JSON.stringify({ ids: [...selectedIds], status }),
      });
      showToast(`${selectedIds.size} topic(s) updated to ${status}`, "success");
      setSelectedIds(new Set());
      loadTopics();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update topics", "error");
    }
  };

  const handleBulkDelete = async () => {
    if (!activeWorkspace) return;
    setDeleting(true);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      showToast(`${selectedIds.size} topic(s) deleted`, "success");
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      loadTopics();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete topics", "error");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => { loadTopics(); }, [loadTopics]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to view the topic library.</p>
      </div>
    );
  }

  const filteredTopics = topics.filter((t) => !statusFilter || t.status === statusFilter);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Topic Library</h1>
        <div className="w-48">
          <Select
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSelectedIds(new Set());
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filteredTopics.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">
            {statusFilter ? `No ${statusFilter} topics found.` : "No topics yet."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 accent-indigo-600"
                    checked={filteredTopics.length > 0 && selectedIds.size === filteredTopics.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredTopics.length;
                      }
                    }}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filteredTopics.map((t) => t.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                  />
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Title</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Pillar</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Platform</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Format</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Publish Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTopics.map((topic) => (
                <tr
                  key={topic.id}
                  className="border-b border-gray-50 cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedTopic(topic)}
                >
                  <td className="w-10 px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 accent-indigo-600"
                      checked={selectedIds.has(topic.id)}
                      onChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(topic.id)) {
                            next.delete(topic.id);
                          } else {
                            next.add(topic.id);
                          }
                          return next;
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900 max-w-xs truncate">{topic.title}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{topic.pillar ?? "—"}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600 capitalize">{topic.platform ?? "—"}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">{topic.format ?? "—"}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-600">
                    {topic.publishDate ? new Date(topic.publishDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusBadgeVariant(topic.status)}>{topic.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTopic && (
        <TopicEditModal
          topic={selectedTopic}
          workspaceId={activeWorkspace.id}
          onUpdated={loadTopics}
          onClose={() => setSelectedTopic(null)}
          onToast={showToast}
        />
      )}

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-white border border-gray-200 shadow-lg rounded-xl px-5 py-3">
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} topic(s) selected
          </span>
          <div className="w-px h-6 bg-gray-200" />
          <div className="relative" ref={statusDropdownRef}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            >
              Change Status
              <svg className="w-3.5 h-3.5 ml-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
            {showStatusDropdown && (
              <div className="absolute bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
                {STATUS_EDIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => {
                      setShowStatusDropdown(false);
                      handleBulkStatusChange(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete
          </Button>
        </div>
      )}

      {showDeleteConfirm && (
        <Modal isOpen onClose={() => setShowDeleteConfirm(false)} title="Delete Topics" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Are you sure you want to delete <span className="font-semibold text-gray-900">{selectedIds.size} topic(s)</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </Button>
              <Button variant="danger" size="sm" onClick={handleBulkDelete} loading={deleting}>
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
