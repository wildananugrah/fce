import { useState } from "react";
import { Calendar, Eye, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { getPillarColor } from "../../utils/pillar-colors";
import { getFormatStyle, getStatusColor } from "../../utils/topic-styles";

interface Topic {
  id: string;
  title: string;
  description?: string | null;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  publishDate?: string | null;
  status: string;
  products?: Array<{ id: string; product: { id: string; name: string } }>;
  createdAt: string;
}

interface PlannerListViewProps {
  topics: Topic[];
  onView: (topic: Topic) => void;
  onGenerate: (topic: Topic) => void;
}

const PAGE_SIZE = 10;

function formatDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const TH = "px-3 py-2.5 font-medium text-center text-[11px] uppercase tracking-wide text-gray-500";
const TD = "px-3 py-2.5 text-[11px] text-gray-700 align-middle";

export function PlannerListView({ topics, onView, onGenerate }: PlannerListViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center text-[11px] text-gray-500">
        No topics yet for this brand. Click <span className="font-medium text-gray-700">Generate</span> to create some.
      </div>
    );
  }

  const totalPages = Math.ceil(topics.length / PAGE_SIZE);
  const pageTopics = topics.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allPageSelected = pageTopics.length > 0 && pageTopics.every((t) => selectedIds.has(t.id));
  const somePageSelected = pageTopics.some((t) => selectedIds.has(t.id)) && !allPageSelected;

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const t of pageTopics) next.delete(t.id);
      } else {
        for (const t of pageTopics) next.add(t.id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToPage(p: number) {
    setPage(Math.max(1, Math.min(totalPages, p)));
  }

  // Build page number list: always show first, last, current ±1, with ellipsis
  function pageNumbers(): (number | "…")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const near = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
    const sorted = Array.from(near).sort((a, b) => a - b);
    const result: (number | "…")[] = [];
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
      result.push(sorted[i]);
    }
    return result;
  }

  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, topics.length);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-2.5 text-center">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = somePageSelected;
                    }}
                    onChange={toggleAll}
                  />
                </th>
                <th className={`${TH} min-w-[220px]`}>Title</th>
                <th className={TH}>Pillar</th>
                <th className={TH}>Format</th>
                <th className={`${TH} whitespace-nowrap min-w-[110px]`}>Publish Date</th>
                <th className={TH}>Platform</th>
                <th className={TH}>Products</th>
                <th className={TH}>Status</th>
                <th className={TH}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageTopics.map((t) => {
                const fmt = getFormatStyle(t.format);
                const isSelected = selectedIds.has(t.id);
                const tooltip = [t.title, t.description].filter(Boolean).join("\n\n");
                return (
                  <tr key={t.id} className={isSelected ? "bg-violet-50/40" : "hover:bg-gray-50"}>
                    {/* Checkbox */}
                    <td className="px-3 py-2.5 text-center align-middle">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                        checked={isSelected}
                        onChange={() => toggleOne(t.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>

                    {/* Title */}
                    <td className="max-w-[280px] px-3 py-2.5 align-middle cursor-default" title={tooltip}>
                      <p className="truncate text-[11px] font-medium text-gray-900">{t.title}</p>
                      {t.description && (
                        <p className="truncate text-[11px] text-gray-400 mt-0.5">{t.description}</p>
                      )}
                    </td>

                    {/* Pillar */}
                    <td className={`${TD} text-center`}>
                      {t.pillar ? (
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${getPillarColor(t.pillar)}`}>
                          {t.pillar}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Format */}
                    <td className={`${TD} text-center`}>
                      {t.format ? (
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${fmt.className}`}>
                          {fmt.icon && <span>{fmt.icon}</span>}
                          {t.format}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Publish Date */}
                    <td className="px-3 py-2.5 text-[11px] text-gray-700 align-middle whitespace-nowrap">
                      {t.publishDate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                          <Calendar size={11} className="text-gray-400 shrink-0" />
                          {formatDate(t.publishDate)}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Platform */}
                    <td className={`${TD} text-center capitalize`}>
                      {t.platform ?? <span className="text-gray-300">—</span>}
                    </td>

                    {/* Products */}
                    <td className={`${TD} text-center`}>
                      {t.products && t.products.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1">
                          {t.products.map((tp) => (
                            <span key={tp.id} className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                              {tp.product.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className={`${TD} text-center`}>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getStatusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2.5 align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onView(t)}
                          className="inline-flex items-center gap-1 rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                          <Eye size={11} />
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => onGenerate(t)}
                          className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                        >
                          <Sparkles size={11} />
                          Generate
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-gray-400">
            Showing {start}–{end} of {topics.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="inline-flex items-center justify-center w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={12} />
            </button>

            {pageNumbers().map((n, i) =>
              n === "…" ? (
                <span key={`ellipsis-${i}`} className="text-[11px] text-gray-400 px-1">…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  onClick={() => goToPage(n)}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded border text-[11px] font-medium transition-colors ${
                    page === n
                      ? "border-violet-400 bg-violet-50 text-violet-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {n}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="inline-flex items-center justify-center w-6 h-6 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
