import { useState, useEffect, useCallback } from "react";
import { Search, Eye } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
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
      const data = await api<LibraryItem[]>(`/api/workspaces/${activeWorkspace.id}/library`);
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
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, status } : item)));
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
        <p className="text-sm text-gray-500 mt-1">Your database of generated social media content.</p>
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
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
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

                return (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
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
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
