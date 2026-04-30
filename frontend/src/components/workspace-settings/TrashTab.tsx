import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { useProject } from "../../hooks/useProject";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

type TrashType = "brand" | "product" | "topic" | "content" | "project";

interface TrashItem {
  id: string;
  type: TrashType;
  name: string;
  archivedAt: string;
  expiresAt: string;
  context?: string;
}

interface TrashTabProps {
  workspaceId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

const TYPE_LABEL: Record<TrashType, string> = {
  brand: "Brand",
  product: "Product",
  topic: "Topic",
  content: "Content",
  project: "Project",
};

const TYPE_VARIANT: Record<TrashType, "info" | "warning" | "default" | "success"> = {
  brand: "info",
  product: "success",
  topic: "warning",
  content: "default",
  project: "info",
};

function formatRelative(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatExpiresIn(date: string): string {
  const ms = new Date(date).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

export function TrashTab({ workspaceId, onToast }: TrashTabProps) {
  const { refresh: refreshSidebar } = useProject();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<TrashType | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<TrashItem[]>(`/api/workspaces/${workspaceId}/trash`);
      setItems(data);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to load trash", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onToast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (item: TrashItem) => {
    setBusy(`restore:${item.id}`);
    try {
      await api(`/api/workspaces/${workspaceId}/trash/${item.type}/${item.id}/restore`, {
        method: "POST",
      });
      onToast(`${TYPE_LABEL[item.type]} restored`, "success");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      // Sidebar reflects projects; only meaningful for project type but
      // calling unconditionally keeps the handler simple.
      await refreshSidebar();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to restore", "error");
    } finally {
      setBusy(null);
    }
  };

  const handlePermanentDelete = async (item: TrashItem) => {
    if (
      !confirm(
        `Delete "${item.name}" forever? This cannot be undone — all related data will be removed.`,
      )
    ) {
      return;
    }
    setBusy(`delete:${item.id}`);
    try {
      await api(`/api/workspaces/${workspaceId}/trash/${item.type}/${item.id}`, {
        method: "DELETE",
      });
      onToast(`${TYPE_LABEL[item.type]} deleted permanently`, "success");
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      await refreshSidebar();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to delete", "error");
    } finally {
      setBusy(null);
    }
  };

  const visible = filter === "all" ? items : items.filter((i) => i.type === filter);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-1">Trash</h2>
        <p className="text-xs text-gray-500">
          Soft-deleted projects, brands, products, topics, and content. Items auto-delete after the expiry
          window (see <code className="font-mono text-[11px]">ARCHIVE_TTL_DAYS</code>). Restoring a
          project or brand also brings back everything under it.
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        {(["all", "project", "brand", "product", "topic", "content"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md border transition-colors ${
              filter === f
                ? "border-indigo-400 bg-indigo-50 text-indigo-700 font-medium"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f === "all" ? "All" : TYPE_LABEL[f]}
            {f !== "all" && (
              <span className="ml-1 text-[10px] text-gray-400">
                ({items.filter((i) => i.type === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="p-10 text-center border border-dashed border-gray-200 rounded-lg">
          <Trash2 size={20} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            {filter === "all" ? "Trash is empty." : `No archived ${TYPE_LABEL[filter].toLowerCase()}s.`}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Type
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Archived
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Expires in
                </th>
                <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-black">
                    <div className="font-medium">{item.name}</div>
                    {item.context && (
                      <div className="text-xs text-gray-400 mt-0.5">{item.context}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={TYPE_VARIANT[item.type]}>{TYPE_LABEL[item.type]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatRelative(item.archivedAt)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatExpiresIn(item.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRestore(item)}
                        loading={busy === `restore:${item.id}`}
                      >
                        <RotateCcw size={14} className="mr-1" /> Restore
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handlePermanentDelete(item)}
                        loading={busy === `delete:${item.id}`}
                      >
                        Delete forever
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
