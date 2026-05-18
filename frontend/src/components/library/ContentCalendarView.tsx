import { useMemo } from "react";
import { Inbox } from "lucide-react";

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
    contentTopicId?: string | null;
    contentTopic?: { pillar?: string | null; publishDate?: string | null } | null;
  };
  sections: {
    id: string;
    sectionType: string;
    sectionOrder: number;
    contentText: string;
  }[];
}

interface ContentCalendarViewProps {
  items: LibraryItem[];
  cursor: Date;
  onItemClick: (item: LibraryItem) => void;
}

// ─── Date helpers ──────────────────────────────────────────────
function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ─── Status helpers ────────────────────────────────────────────
function getStatusDotColor(status: string): string {
  if (status === "approved") return "bg-green-500";
  if (status === "rejected") return "bg-red-500";
  if (status === "in_review") return "bg-amber-500";
  return "bg-gray-400";
}

const PLATFORM_CHIP: Record<string, string> = {
  instagram: "bg-purple-100 text-purple-700",
  tiktok: "bg-gray-200 text-gray-800",
  youtube: "bg-red-100 text-red-700",
  twitter: "bg-blue-100 text-blue-700",
  linkedin: "bg-sky-100 text-sky-700",
  facebook: "bg-blue-100 text-blue-700",
};

// ─── Calendar component ────────────────────────────────────────
export function ContentCalendarView({ items, cursor, onItemClick }: ContentCalendarViewProps) {
  const { scheduled, unscheduled } = useMemo(() => {
    const byDay = new Map<string, LibraryItem[]>();
    const loose: LibraryItem[] = [];
    for (const item of items) {
      const publishDate = item.request.contentTopic?.publishDate;
      if (!publishDate) {
        loose.push(item);
        continue;
      }
      const key = publishDate.slice(0, 10);
      const bucket = byDay.get(key) ?? [];
      bucket.push(item);
      byDay.set(key, bucket);
    }
    return { scheduled: byDay, unscheduled: loose };
  }, [items]);

  const cells = useMemo(() => {
    const firstOfMonth = startOfMonth(cursor);
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor]);

  const todayKey = toDateKey(new Date());
  const currentMonthIndex = cursor.getMonth();
  const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-3">
      {/* Unscheduled strip — items with no topic publish date */}
      <div className="border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50/50">
        <div className="flex items-center gap-2 mb-2">
          <Inbox size={12} className="text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            No Publish Date ({unscheduled.length})
          </span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="text-[10px] text-gray-400 italic">All content has a publish date</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((item) => (
              <ContentChip key={item.id} item={item} onClick={onItemClick} />
            ))}
          </div>
        )}
      </div>

      {/* Table-style calendar */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Weekday header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {weekdayHeaders.map((d, idx) => (
            <div
              key={d}
              className={`px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider ${idx < 6 ? "border-r border-gray-200" : ""}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 grid-rows-6">
          {cells.map((date, i) => {
            const key = toDateKey(date);
            const dayItems = scheduled.get(key) ?? [];
            const isToday = key === todayKey;
            const isOtherMonth = date.getMonth() !== currentMonthIndex;
            const isLastCol = (i + 1) % 7 === 0;
            const isLastRow = i >= cells.length - 7;

            return (
              <div
                key={i}
                className={[
                  "min-h-[104px] p-2 flex flex-col items-start",
                  isLastCol ? "" : "border-r border-gray-200",
                  isLastRow ? "" : "border-b border-gray-200",
                  isOtherMonth ? "bg-gray-50/60" : "bg-white",
                ].filter(Boolean).join(" ")}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={`text-[11px] font-medium leading-none ${
                      isToday
                        ? "bg-gray-900 text-white rounded-full w-5 h-5 flex items-center justify-center"
                        : isOtherMonth
                          ? "text-gray-300"
                          : "text-gray-400"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayItems.length > 0 && (
                    <span className="text-[9px] text-gray-400">{dayItems.length}</span>
                  )}
                </div>
                <div className="space-y-1 w-full">
                  {dayItems.map((item) => (
                    <ContentChip key={item.id} item={item} onClick={onItemClick} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Content chip ──────────────────────────────────────────────
interface ContentChipProps {
  item: LibraryItem;
  onClick: (item: LibraryItem) => void;
  compact?: boolean;
}

function ContentChip({ item, onClick, compact = false }: ContentChipProps) {
  const chipClass = PLATFORM_CHIP[item.request.platform] ?? "bg-gray-100 text-gray-700";
  const title = item.contentTitle ?? "Untitled";
  return (
    <button
      type="button"
      onClick={() => onClick(item)}
      title={title}
      className={`w-full text-left rounded-sm px-1.5 py-0.5 text-[10px] font-medium hover:opacity-75 transition-opacity truncate flex items-center gap-1 ${chipClass}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getStatusDotColor(item.status)}`} />
      {compact ? title.slice(0, 28) : title}
    </button>
  );
}
