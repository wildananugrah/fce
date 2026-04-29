import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Calendar,
  X,
  Eye,
  Search,
  Table as TableIcon,
  CalendarDays,
  CalendarRange,
  Download,
} from "lucide-react";
// `exceljs` is ~1 MB. Import it lazily inside the export handler so users who
// never click Export don't pay for it on the initial bundle.
import { useProject } from "../hooks/useProject";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { TopicDetailDrawer } from "../components/topics/TopicDetailDrawer";
import { TopicCalendarView } from "../components/topics/TopicCalendarView";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";

type ViewMode = "table" | "month" | "week";

interface Topic {
  id: string;
  title: string;
  description?: string | null;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  objective?: string | null;
  publishDate?: string | null;
  status: string;
  brandId?: string | null;
  products?: Array<{
    id: string;
    product: { id: string; name: string };
  }>;
  brand?: { id: string; name: string } | null;
  createdAt: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

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
  { value: "", label: "All Statuss" },
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const PILLAR_COLORS: Record<string, string> = {};
const PILLAR_COLOR_POOL = [
  "bg-emerald-50 text-emerald-700",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-700",
  "bg-teal-50 text-teal-700",
  "bg-rose-50 text-rose-700",
  "bg-blue-50 text-blue-700",
  "bg-orange-50 text-orange-700",
  "bg-pink-50 text-pink-700",
];
let pillarColorIdx = 0;

function getPillarColor(pillar: string): string {
  if (!PILLAR_COLORS[pillar]) {
    PILLAR_COLORS[pillar] = PILLAR_COLOR_POOL[pillarColorIdx % PILLAR_COLOR_POOL.length];
    pillarColorIdx++;
  }
  return PILLAR_COLORS[pillar];
}

function getFormatStyle(format?: string | null) {
  if (!format) return { className: "bg-gray-100 text-gray-600", icon: "" };
  const f = format.toLowerCase();
  if (f.includes("carousel")) return { className: "bg-blue-50 text-blue-700", icon: "\uD83C\uDFA0" };
  if (f.includes("reel") || f.includes("video") || f.includes("short"))
    return { className: "bg-red-50 text-red-700", icon: "\uD83C\uDFAC" };
  if (f.includes("story")) return { className: "bg-purple-50 text-purple-700", icon: "\uD83D\uDCF1" };
  if (f.includes("single") || f.includes("image"))
    return { className: "bg-indigo-50 text-indigo-700", icon: "\uD83D\uDDBC\uFE0F" };
  if (f.includes("thread")) return { className: "bg-amber-50 text-amber-700", icon: "\uD83D\uDCDD" };
  return { className: "bg-gray-100 text-gray-600", icon: "" };
}

function getStatusColor(status: string) {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "published") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "scheduled") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "archived") return "bg-gray-100 text-gray-500 border-gray-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function formatCreatedAt(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

type TopicSortKey =
  | "title"
  | "pillar"
  | "format"
  | "publishDate"
  | "platform"
  | "products"
  | "status"
  | "createdAt";
type SortDir = "asc" | "desc";

// Editorial flow order for the topic library statuses.
const TOPIC_STATUS_ORDER: Record<string, number> = {
  draft: 0,
  approved: 1,
  scheduled: 2,
  published: 3,
  archived: 4,
};

function compareTopics(a: Topic, b: Topic, key: TopicSortKey): number {
  const nullable = (s: string | null | undefined) => (s ?? "").toLowerCase();
  switch (key) {
    case "title":
      return nullable(a.title).localeCompare(nullable(b.title));
    case "pillar":
      return nullable(a.pillar).localeCompare(nullable(b.pillar));
    case "format":
      return nullable(a.format).localeCompare(nullable(b.format));
    case "platform":
      return nullable(a.platform).localeCompare(nullable(b.platform));
    case "products": {
      const an = a.products?.[0]?.product.name ?? "";
      const bn = b.products?.[0]?.product.name ?? "";
      return an.toLowerCase().localeCompare(bn.toLowerCase());
    }
    case "status":
      return (TOPIC_STATUS_ORDER[a.status] ?? 99) - (TOPIC_STATUS_ORDER[b.status] ?? 99);
    case "publishDate": {
      const at = a.publishDate ? new Date(a.publishDate).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.publishDate ? new Date(b.publishDate).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    }
    case "createdAt":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
}

interface TopicSortableHeaderProps {
  label: string;
  sortKeyValue: TopicSortKey;
  active: TopicSortKey;
  dir: SortDir;
  onClick: (key: TopicSortKey) => void;
  className?: string;
}

function TopicSortableHeader({
  label,
  sortKeyValue,
  active,
  dir,
  onClick,
  className,
}: TopicSortableHeaderProps) {
  const isActive = active === sortKeyValue;
  return (
    <th
      scope="col"
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
      className={`text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide select-none ${className ?? ""}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKeyValue)}
        className="inline-flex items-center gap-1 hover:text-gray-800 transition-colors"
      >
        <span>{label}</span>
        {isActive ? (
          dir === "asc" ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )
        ) : (
          <ChevronUp size={12} className="opacity-25" />
        )}
      </button>
    </th>
  );
}

const BRAND_COLORS = [
  "bg-indigo-100 text-indigo-600",
  "bg-emerald-100 text-emerald-600",
  "bg-amber-100 text-amber-600",
  "bg-rose-100 text-rose-600",
  "bg-teal-100 text-teal-600",
  "bg-violet-100 text-violet-600",
];

// ---- Inline Status Dropdown ----
function StatusDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border capitalize ${getStatusColor(value)}`}
      >
        {value}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-20">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 capitalize"
              onClick={(e) => {
                e.stopPropagation();
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Brand Group ----
interface BrandGroup {
  brandId: string;
  brandName: string;
  topics: Topic[];
  approvedCount: number;
}

// ---- Main Page ----
export function TopicLibraryPage() {
  const { activeWorkspace } = useWorkspace();
  const { activeProject, isApprover } = useProject();
  const navigate = useNavigate();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkActionRunning, setBulkActionRunning] = useState(false);
  const [viewingTopic, setViewingTopic] = useState<Topic | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortKey, setSortKey] = useState<TopicSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: TopicSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Dates default to newest-first; everything else defaults to A→Z.
      setSortDir(key === "createdAt" || key === "publishDate" ? "desc" : "asc");
    }
  }

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
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const data = await api<Topic[]>(`/api/workspaces/${activeWorkspace.id}/topics${qs}`);
      setTopics(data);
      // Auto-expand all brands on first load
      const brandIds = new Set(data.map((t) => t.brand?.id ?? t.brandId ?? "unknown"));
      setExpandedBrands(brandIds);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load topics", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const handleStatusChange = async (topicId: string, status: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/topics/${topicId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, status } : t)));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update status", "error");
    }
  };

  const handleReschedule = async (topicId: string, newDate: string | null) => {
    if (!activeWorkspace) return;
    const previous = topics;
    const isoDate = newDate ? `${newDate}T00:00:00.000Z` : null;
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, publishDate: isoDate } : t)),
    );
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/topics/${topicId}`, {
        method: "PATCH",
        body: JSON.stringify({ publishDate: newDate }),
      });
      showToast(newDate ? "Topic rescheduled" : "Publish date cleared", "success");
    } catch (e) {
      setTopics(previous);
      showToast(e instanceof Error ? e.message : "Failed to reschedule", "error");
    }
  };

  const handleDelete = async (topicId: string) => {
    if (!activeWorkspace) return;
    setDeleting(true);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [topicId] }),
      });
      setTopics((prev) => prev.filter((t) => t.id !== topicId));
      showToast("Topic moved to Trash", "success");
      setShowDeleteConfirm(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete topic", "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (topicId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(topicId)) next.delete(topicId);
      else next.add(topicId);
      return next;
    });
  };

  const toggleSelectGroup = (topicIds: string[], select: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of topicIds) {
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
      await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      });
      setTopics((prev) => prev.filter((t) => !selectedIds.has(t.id)));
      showToast(
        `Moved ${ids.length} topic${ids.length > 1 ? "s" : ""} to Trash`,
        "success",
      );
      clearSelection();
      setShowBulkDeleteConfirm(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete topics", "error");
    } finally {
      setBulkActionRunning(false);
    }
  };

  const handleBulkStatus = async (status: string) => {
    if (!activeWorkspace || selectedIds.size === 0) return;
    setBulkActionRunning(true);
    try {
      const ids = Array.from(selectedIds);
      await api(`/api/workspaces/${activeWorkspace.id}/topics/bulk-status`, {
        method: "PATCH",
        body: JSON.stringify({ ids, status }),
      });
      setTopics((prev) => prev.map((t) => (selectedIds.has(t.id) ? { ...t, status } : t)));
      showToast(`Updated ${ids.length} topic${ids.length > 1 ? "s" : ""} to ${status}`, "success");
      clearSelection();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update topics", "error");
    } finally {
      setBulkActionRunning(false);
    }
  };

  // Builds a real .xlsx from whatever the user currently has on screen (after
  // the brand / platform / status filters). Doing it client-side keeps the
  // export fast and avoids a server round-trip; we already have the full
  // Topic[] in memory.
  const handleExportToExcel = async (rows: Topic[]) => {
    if (rows.length === 0) {
      showToast("Nothing to export — current filters return no topics.", "info");
      return;
    }

    // Lazy-load so exceljs stays out of the initial bundle — adds a tiny
    // one-time delay the first time the user clicks Export.
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "FCE Dashboard";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Topics", {
      views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
      { header: "Publish Date", key: "publishDate", width: 14 },
      { header: "Platform", key: "platform", width: 14 },
      { header: "Format", key: "format", width: 14 },
      { header: "Title", key: "title", width: 48 },
      { header: "Product", key: "product", width: 28 },
      { header: "Brand", key: "brand", width: 22 },
      { header: "Pillar", key: "pillar", width: 28 },
    ];

    for (const t of rows) {
      sheet.addRow({
        // Native Date gets serialized as an Excel date cell; blank strings
        // stay blank so empty-date topics don't show a bogus timestamp.
        publishDate: t.publishDate ? new Date(t.publishDate) : "",
        platform: t.platform ?? "",
        format: t.format ?? "",
        title: t.title,
        product: (t.products ?? []).map((p) => p.product.name).join(", "),
        brand: t.brand?.name ?? "",
        pillar: t.pillar ?? "",
      });
    }

    sheet.getRow(1).font = { bold: true };
    sheet.getColumn("publishDate").numFmt = "yyyy-mm-dd";

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const stamp = new Date().toISOString().slice(0, 10);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topics-${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${rows.length} topic${rows.length > 1 ? "s" : ""} to Excel.`, "success");
  };

  const toggleBrand = (brandId: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to view the topic library.</p>
      </div>
    );
  }

  // Build brand options from the topics currently loaded, so the dropdown
  // only lists brands the user actually has topics for.
  const brandOptions = (() => {
    const seen = new Map<string, string>();
    for (const t of topics) {
      const id = t.brand?.id ?? t.brandId ?? "unknown";
      const name = t.brand?.name ?? "Unknown Brand";
      if (!seen.has(id)) seen.set(id, name);
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  })();

  // Filter
  const searchQuery = search.trim().toLowerCase();
  const filteredTopics = topics.filter((t) => {
    if (platformFilter && t.platform !== platformFilter) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    if (brandFilter) {
      const brandId = t.brand?.id ?? t.brandId ?? "unknown";
      if (brandId !== brandFilter) return false;
    }
    if (searchQuery) {
      const title = t.title?.toLowerCase() ?? "";
      const description = t.description?.toLowerCase() ?? "";
      if (!title.includes(searchQuery) && !description.includes(searchQuery)) return false;
    }
    return true;
  });

  // Group by brand
  const brandGroups: BrandGroup[] = [];
  const brandMap = new Map<string, BrandGroup>();

  for (const topic of filteredTopics) {
    const brandId = topic.brand?.id ?? topic.brandId ?? "unknown";
    const brandName = topic.brand?.name ?? "Unknown Brand";
    if (!brandMap.has(brandId)) {
      const group: BrandGroup = { brandId, brandName, topics: [], approvedCount: 0 };
      brandMap.set(brandId, group);
      brandGroups.push(group);
    }
    const group = brandMap.get(brandId)!;
    group.topics.push(topic);
    if (topic.status === "approved") group.approvedCount++;
  }

  // Sort each group's topics by the active sort key/direction.
  const sign = sortDir === "asc" ? 1 : -1;
  for (const group of brandGroups) {
    group.topics.sort((a, b) => compareTopics(a, b, sortKey) * sign);
  }

  // Stats
  const totalTopics = filteredTopics.length;
  const approvedCount = filteredTopics.filter((t) => t.status === "approved").length;
  const generatedCount = filteredTopics.filter((t) => t.status === "draft").length;
  const brandCount = brandGroups.length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Topic Library</h1>
          <p className="text-sm text-gray-500 mt-1">All saved content topics, grouped by brand.</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton pageKey="topic-library" />
          <Button
            onClick={() => handleExportToExcel(filteredTopics)}
            className="!bg-white !text-gray-700 !border !border-gray-300 hover:!bg-gray-50 !rounded-lg disabled:!text-gray-400 disabled:!border-gray-200 disabled:cursor-not-allowed"
            disabled={filteredTopics.length === 0}
            title={
              filteredTopics.length === 0
                ? "Nothing to export"
                : `Export ${filteredTopics.length} topic${filteredTopics.length > 1 ? "s" : ""} to Excel`
            }
          >
            <Download size={14} className="mr-2" />
            Export
          </Button>
          <Button
            onClick={() => navigate("/topics")}
            className="!bg-white !text-gray-700 !border !border-gray-300 hover:!bg-gray-50 !rounded-lg"
          >
            <Sparkles size={14} className="mr-2" />
            New Topics
          </Button>
          <button
            type="button"
            onClick={loadTopics}
            className="p-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <CoachMark
        pageKey="topic-library"
        title="Topic Library"
        body="Browse every saved topic across your brands — filter by brand, platform, or status, switch to calendar view to plan a schedule, or approve topics here before they become posts."
      />

      {/* Stats Cards */}
      <div className="flex gap-4">
        {[
          { label: "Total Topics", value: totalTopics, color: "text-indigo-600" },
          { label: "Approved", value: approvedCount, color: "text-green-600" },
          { label: "Generated", value: generatedCount, color: "text-amber-600" },
          { label: "Brands", value: brandCount, color: "text-gray-700" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white border border-gray-200 rounded-xl px-5 py-4 min-w-[120px]"
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + View Toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 gap-3 min-w-0">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search title or description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-black focus:ring-1 focus:ring-black placeholder-gray-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <select
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
          >
            <option value="">All Brands</option>
            {brandOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
          >
            {PLATFORM_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="inline-flex bg-white border border-gray-300 rounded-lg p-0.5">
          {[
            { mode: "table" as const, icon: TableIcon, label: "Table" },
            { mode: "month" as const, icon: CalendarDays, label: "Month" },
            { mode: "week" as const, icon: CalendarRange, label: "Week" },
          ].map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === mode
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : filteredTopics.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
          <p className="text-sm text-gray-400">
            {search || platformFilter || statusFilter || brandFilter ? "No topics match the current filters." : "No topics yet. Generate some from the Topic Generator."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {brandGroups.map((group, groupIdx) => {
            const isExpanded = expandedBrands.has(group.brandId);
            const colorClass = BRAND_COLORS[groupIdx % BRAND_COLORS.length];

            return (
              <div key={group.brandId} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                {/* Brand Header */}
                <button
                  type="button"
                  onClick={() => toggleBrand(group.brandId)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold ${colorClass}`}
                    >
                      {group.brandName.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-black">{group.brandName}</p>
                      <p className="text-xs text-gray-500">
                        {group.topics.length} topics{" "}
                        {group.approvedCount > 0 && (
                          <span className="text-green-600">&middot; {group.approvedCount} approved</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={`text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Calendar view */}
                {isExpanded && viewMode !== "table" && (
                  <div className="border-t border-gray-100 p-5">
                    <TopicCalendarView
                      topics={group.topics}
                      mode={viewMode}
                      onTopicClick={(t) => setViewingTopic(t)}
                      onReschedule={handleReschedule}
                      getPillarColor={getPillarColor}
                    />
                  </div>
                )}

                {/* Topic Table */}
                {isExpanded && viewMode === "table" && (
                  <div className="border-t border-gray-100 overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="w-10 px-4 py-2.5">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              checked={
                                group.topics.length > 0 &&
                                group.topics.every((t) => selectedIds.has(t.id))
                              }
                              ref={(el) => {
                                if (!el) return;
                                const selectedInGroup = group.topics.filter((t) =>
                                  selectedIds.has(t.id),
                                ).length;
                                el.indeterminate =
                                  selectedInGroup > 0 && selectedInGroup < group.topics.length;
                              }}
                              onChange={(e) =>
                                toggleSelectGroup(
                                  group.topics.map((t) => t.id),
                                  e.target.checked,
                                )
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </th>
                          <TopicSortableHeader
                            label="Title"
                            sortKeyValue="title"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                            className="px-5"
                          />
                          <TopicSortableHeader
                            label="Pillar"
                            sortKeyValue="pillar"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Format"
                            sortKeyValue="format"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Publish Date"
                            sortKeyValue="publishDate"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Platform"
                            sortKeyValue="platform"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Products"
                            sortKeyValue="products"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Status"
                            sortKeyValue="status"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <TopicSortableHeader
                            label="Created At"
                            sortKeyValue="createdAt"
                            active={sortKey}
                            dir={sortDir}
                            onClick={toggleSort}
                          />
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {group.topics.map((topic) => {
                          const fmtStyle = getFormatStyle(topic.format);
                          const isSelected = selectedIds.has(topic.id);
                          return (
                            <tr
                              key={topic.id}
                              className={`border-b border-gray-50 ${isSelected ? "bg-indigo-50/50" : "hover:bg-gray-50"}`}
                            >
                              {/* Select */}
                              <td className="w-10 px-4 py-3">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  checked={isSelected}
                                  onChange={() => toggleSelect(topic.id)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                              </td>
                              {/* Title */}
                              <td className="px-5 py-3 max-w-[280px]">
                                <p className="text-sm font-medium text-gray-900 truncate">{topic.title}</p>
                                {topic.description && (
                                  <p className="text-xs text-gray-400 truncate">{topic.description}</p>
                                )}
                              </td>

                              {/* Pillar */}
                              <td className="px-4 py-3">
                                {topic.pillar ? (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${getPillarColor(topic.pillar)}`}
                                  >
                                    {topic.pillar}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">&mdash;</span>
                                )}
                              </td>

                              {/* Format */}
                              <td className="px-4 py-3">
                                {topic.format ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${fmtStyle.className}`}
                                  >
                                    {fmtStyle.icon && <span>{fmtStyle.icon}</span>}
                                    {topic.format}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">&mdash;</span>
                                )}
                              </td>

                              {/* Publish Date */}
                              <td className="px-4 py-3">
                                {topic.publishDate ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                                    <Calendar size={12} className="text-gray-400" />
                                    {formatDate(topic.publishDate)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-300">&mdash;</span>
                                )}
                              </td>

                              {/* Platform */}
                              <td className="px-4 py-3">
                                <span className="text-sm text-gray-700 capitalize">
                                  {topic.platform ?? <span className="text-gray-300">&mdash;</span>}
                                </span>
                              </td>

                              {/* Products */}
                              <td className="px-4 py-3">
                                {topic.products && topic.products.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {topic.products.map((tp) => (
                                      <span
                                        key={tp.id}
                                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600"
                                      >
                                        {tp.product.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300">&mdash;</span>
                                )}
                              </td>

                              {/* Status */}
                              <td className="px-4 py-3">
                                {isApprover ? (
                                  <StatusDropdown
                                    value={topic.status}
                                    onChange={(status) => handleStatusChange(topic.id, status)}
                                  />
                                ) : (
                                  <span
                                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${getStatusColor(
                                      topic.status,
                                    )}`}
                                    title="Only approvers can change status"
                                  >
                                    {topic.status.replace(/_/g, " ")}
                                  </span>
                                )}
                              </td>

                              {/* Created At */}
                              <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                <div className="flex flex-col leading-tight">
                                  <span>{formatCreatedAt(topic.createdAt).date}</span>
                                  <span className="text-xs text-gray-400">
                                    {formatCreatedAt(topic.createdAt).time}
                                  </span>
                                </div>
                              </td>

                              {/* Actions */}
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setViewingTopic(topic);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
                                  >
                                    <Eye size={12} />
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const productIds = topic.products?.map((tp) => tp.product.id) ?? [];
                                      const params = new URLSearchParams({
                                        brandId: topic.brandId ?? "",
                                        platform: topic.platform ?? "",
                                        objective: topic.objective ?? "",
                                        topicId: topic.id,
                                        ...(topic.format ? { format: topic.format } : {}),
                                      });
                                      productIds.forEach((pid) => params.append("productId", pid));
                                      navigate(`/generate?${params.toString()}`);
                                    }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                                  >
                                    Generate
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowDeleteConfirm(topic.id);
                                    }}
                                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-800 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.size} topic{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          {isApprover && (
            <>
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
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </>
          )}
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
          title="Delete Topics"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Move {selectedIds.size} selected topic{selectedIds.size > 1 ? "s" : ""} to Trash?
              You can restore them from Workspace Settings → Trash within 30 days.
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

      {/* Delete Confirm Modal */}
      {showDeleteConfirm && (
        <Modal isOpen onClose={() => setShowDeleteConfirm(null)} title="Delete Topic" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Move this topic to Trash? You can restore it from Workspace Settings → Trash within
              30 days.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDelete(showDeleteConfirm)}
                loading={deleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {activeWorkspace && (
        <TopicDetailDrawer
          isOpen={!!viewingTopic}
          topic={viewingTopic}
          workspaceId={activeWorkspace.id}
          onClose={() => setViewingTopic(null)}
          onUpdated={(updated) => {
            setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
          }}
          onToast={showToast}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
