import { useState, useEffect, useCallback } from "react";
import { Search, Eye, Trash2, X } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { ContentPreviewModal } from "../components/library/ContentPreviewModal";

interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  createdAt: string;
  request: {
    platform: string;
    contentType: string;
    brand?: { id: string; name: string } | null;
    product?: { id: string; name: string } | null;
  };
  sections: {
    id: string;
    sectionType: string;
    sectionOrder: number;
    contentText: string;
  }[];
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

// ── Helpers ────────────────────────────────────────────────────

function getContentSubtitle(contentType: string, content: Record<string, unknown>): string {
  const slides = Array.isArray(content.slides) ? content.slides.length : 0;
  const scenes = Array.isArray(content.scenes) ? content.scenes.length : 0;
  const frames = Array.isArray(content.frames) ? content.frames.length : 0;

  if (slides > 0) return `${slides} slides`;
  if (scenes > 0) return `${scenes} scenes`;
  if (frames > 0) return `${frames} frames`;

  // Infer from content type
  const ct = contentType.toLowerCase();
  if (ct.includes("carousel") || ct.includes("thread")) return "slides";
  if (ct.includes("reel") || ct.includes("video") || ct.includes("short")) return "video";
  return "post";
}

function getPlatformStyle(platform: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    instagram: { bg: "bg-purple-100", text: "text-purple-700" },
    tiktok: { bg: "bg-gray-900", text: "text-white" },
    youtube: { bg: "bg-red-100", text: "text-red-700" },
    twitter: { bg: "bg-blue-100", text: "text-blue-700" },
    linkedin: { bg: "bg-sky-100", text: "text-sky-700" },
    facebook: { bg: "bg-blue-100", text: "text-blue-700" },
  };
  return map[platform] ?? { bg: "bg-gray-100", text: "text-gray-700" };
}

function getStatusStyle(status: string): string {
  if (status === "approved") return "bg-green-50 text-green-700";
  if (status === "rejected") return "bg-red-50 text-red-700";
  return "bg-gray-100 text-gray-600";
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

const PLATFORM_FILTER_OPTIONS = [
  { value: "", label: "All Platforms" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
];

const STATUS_FILTER_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const BULK_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

// ── Main Page ──────────────────────────────────────────────────

export function LibraryPage() {
  const { activeWorkspace } = useWorkspace();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadItems = useCallback(async () => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api<LibraryItem[]>(`/api/workspaces/${activeWorkspace.id}/library?status=in_review,approved`);
      setItems(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load library", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleStatusChange = (id: string, status: string) => {
    if (status === "approved" || status === "in_review") {
      // Stay in library — update in place
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
    } else {
      // Draft or rejected — remove from library, goes back to Content Generator
      setItems((prev) => prev.filter((item) => item.id !== id));
      showToast(
        status === "draft"
          ? "Content moved back to drafts on Content Generator"
          : "Content rejected and moved back to Content Generator",
        "info",
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    if (!activeWorkspace || selectedIds.size === 0) return;
    setBulkActionRunning(true);
    try {
      const ids = Array.from(selectedIds);
      await api(`/api/workspaces/${activeWorkspace.id}/library/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      showToast(`Deleted ${ids.length} item${ids.length > 1 ? "s" : ""}`, "success");
      clearSelection();
      setShowBulkDeleteConfirm(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete items", "error");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!activeWorkspace || selectedIds.size === 0) return;
    setBulkActionRunning(true);
    try {
      const ids = Array.from(selectedIds);
      await api(`/api/workspaces/${activeWorkspace.id}/library/bulk-status`, {
        method: "PATCH",
        body: JSON.stringify({ ids, status }),
      });
      setItems((prev) => prev.map((i) => (selectedIds.has(i.id) ? { ...i, status } : i)));
      showToast(`Updated ${ids.length} item${ids.length > 1 ? "s" : ""} to ${status}`, "success");
      clearSelection();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update items", "error");
    } finally {
      setBulkActionRunning(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to view the content library.</p>
      </div>
    );
  }

  // Filter
  const filtered = items.filter((item) => {
    if (platformFilter && item.request.platform !== platformFilter) return false;
    if (statusFilter && item.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const title = (item.contentTitle ?? "").toLowerCase();
      const brand = (item.request.brand?.name ?? "").toLowerCase();
      const product = (item.request.product?.name ?? "").toLowerCase();
      if (!title.includes(q) && !brand.includes(q) && !product.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-black">Content Library</h1>
        <p className="text-sm text-gray-500 mt-1">Approved content ready for publishing. Manage and preview your finalized posts.</p>
      </div>

      {/* Search + Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search content, hooks, brands..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder-gray-400"
          />
        </div>

        {/* Platform filter */}
        <select
          className="px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
        >
          {PLATFORM_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {/* Count */}
        <span className="text-sm text-gray-500 whitespace-nowrap">{filtered.length} items</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            {search || platformFilter || statusFilter
              ? "No content matches the current filters."
              : "No content in library yet. Generate some content first."}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    checked={filtered.length > 0 && filtered.every((i) => selectedIds.has(i.id))}
                    ref={(el) => {
                      if (!el) return;
                      const selectedOnPage = filtered.filter((i) => selectedIds.has(i.id)).length;
                      el.indeterminate = selectedOnPage > 0 && selectedOnPage < filtered.length;
                    }}
                    onChange={(e) =>
                      toggleSelectAll(
                        filtered.map((i) => i.id),
                        e.target.checked,
                      )
                    }
                  />
                </th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Content Title
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Brand
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Platform
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Generated
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const platformStyle = getPlatformStyle(item.request.platform);
                const subtitle = getContentSubtitle(item.request.contentType, item.content);
                const isSelected = selectedIds.has(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-50 ${isSelected ? "bg-indigo-50/50" : "hover:bg-gray-50"}`}
                  >
                    {/* Select */}
                    <td className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        checked={isSelected}
                        onChange={() => toggleSelect(item.id)}
                      />
                    </td>
                    {/* Title */}
                    <td className="px-5 py-3 max-w-[320px]">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.contentTitle ?? "Untitled Content"}
                      </p>
                      <p className="text-xs text-gray-400">{subtitle}</p>
                    </td>

                    {/* Brand */}
                    <td className="px-4 py-3">
                      <p className="text-sm text-gray-800">
                        {item.request.brand?.name ?? "—"}
                      </p>
                      {item.request.product?.name && (
                        <p className="text-xs text-gray-400">{item.request.product.name}</p>
                      )}
                    </td>

                    {/* Platform */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium capitalize ${platformStyle.bg} ${platformStyle.text}`}>
                        {item.request.platform}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${getStatusStyle(item.status)}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          item.status === "approved" ? "bg-green-500" :
                          item.status === "rejected" ? "bg-red-500" : "bg-gray-400"
                        }`} />
                        {item.status}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatRelativeDate(item.createdAt)}
                    </td>

                    {/* View */}
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview Modal */}
      {selectedItem && (
        <ContentPreviewModal
          item={selectedItem}
          workspaceId={activeWorkspace.id}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
          onToast={showToast}
          onSectionsUpdated={(id, sections) => {
            setItems((prev) =>
              prev.map((it) => (it.id === id ? { ...it, sections } : it)),
            );
            setSelectedItem((prev) => (prev && prev.id === id ? { ...prev, sections } : prev));
          }}
        />
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-800 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.size} item{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-5 bg-gray-700" />
          <select
            className="bg-gray-800 border border-gray-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            value=""
            disabled={bulkActionRunning}
            onChange={(e) => {
              if (e.target.value) handleBulkStatus(e.target.value);
              e.target.value = "";
            }}
          >
            <option value="" disabled>
              Change status…
            </option>
            {BULK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowBulkDeleteConfirm(true)}
            disabled={bulkActionRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkActionRunning}
            className="p-1.5 text-gray-400 hover:text-white rounded disabled:opacity-50 transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Bulk Delete Confirm Modal */}
      {showBulkDeleteConfirm && (
        <Modal
          isOpen
          onClose={() => setShowBulkDeleteConfirm(false)}
          title="Delete Content"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Delete {selectedIds.size} selected content item
              {selectedIds.size > 1 ? "s" : ""}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleBulkDelete}
                loading={bulkActionRunning}
              >
                Delete {selectedIds.size}
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
