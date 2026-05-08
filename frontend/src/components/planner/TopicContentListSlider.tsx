import { useEffect } from "react";
import { Eye, X } from "lucide-react";
import { Button } from "../ui/Button";

interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  status: string;
  createdAt: string;
  request: {
    platform: string;
    contentType: string;
  };
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  items: LibraryItem[];
  onPickItem: (itemId: string) => void;
}

function statusStyle(status: string): string {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "draft") return "bg-gray-50 text-gray-600 border-gray-200";
  return "bg-blue-50 text-blue-700 border-blue-200";
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString();
}

/**
 * Slider that lists every generated content for a single topic in a
 * Content-Library-style table. Clicking a row hands the item id back to
 * the host so it can open the per-content preview.
 */
export function TopicContentListSlider({
  isOpen,
  onClose,
  topicTitle,
  items,
  onPickItem,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slider panel */}
      <div
        className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-content-list-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-3">
          <div className="min-w-0">
            <h2
              id="topic-content-list-title"
              className="text-base font-semibold text-gray-900"
            >
              Generated Content
            </h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">{topicTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-sm text-gray-500">
              No content generated for this topic yet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Title</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium">Format</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {item.contentTitle ?? "Untitled Content"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-sm capitalize text-gray-700">
                        {item.request.platform}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.request.contentType.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle(item.status)}`}
                        >
                          {item.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatRelativeDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onPickItem(item.id)}
                        >
                          <Eye size={12} className="mr-1" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
