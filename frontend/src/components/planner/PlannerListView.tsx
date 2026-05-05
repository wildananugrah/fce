import { Calendar, Eye, Sparkles } from "lucide-react";
import { Button } from "../ui/Button";
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

function formatDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function PlannerListView({ topics, onView, onGenerate }: PlannerListViewProps) {
  if (topics.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        No topics yet for this brand. Click <span className="font-medium text-gray-700">Generate</span> to create some.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3" />
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Pillar</th>
              <th className="px-4 py-3 font-medium">Format</th>
              <th className="px-4 py-3 font-medium">Publish Date</th>
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Products</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {topics.map((t) => {
              const fmt = getFormatStyle(t.format);
              return (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      onClick={(e) => e.stopPropagation()}
                      readOnly
                    />
                  </td>
                  <td className="max-w-[280px] px-4 py-3">
                    <p className="truncate text-sm font-medium text-gray-900">{t.title}</p>
                    {t.description && (
                      <p className="truncate text-xs text-gray-400">{t.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.pillar ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${getPillarColor(t.pillar)}`}
                      >
                        {t.pillar}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.format ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${fmt.className}`}
                      >
                        {fmt.icon && <span>{fmt.icon}</span>}
                        {t.format}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {t.publishDate ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                        <Calendar size={12} className="text-gray-400" />
                        {formatDate(t.publishDate)}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm capitalize text-gray-700">
                    {t.platform ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {t.products && t.products.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {t.products.map((tp) => (
                          <span
                            key={tp.id}
                            className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600"
                          >
                            {tp.product.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getStatusColor(t.status)}`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => onView(t)}>
                        <Eye size={12} className="mr-1" />
                        View
                      </Button>
                      <Button size="sm" onClick={() => onGenerate(t)}>
                        <Sparkles size={12} className="mr-1" />
                        Generate
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
