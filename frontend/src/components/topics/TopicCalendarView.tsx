import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";

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

interface TopicCalendarViewProps {
  topics: Topic[];
  mode: "month" | "week";
  onTopicClick: (topic: Topic) => void;
  onReschedule: (topicId: string, newDate: string | null) => void;
  getPillarColor: (pillar: string) => string;
  /**
   * Optional. When set, eligible empty cells (current-month + future-or-today,
   * no topics) render as clickable buttons that fire this callback with the
   * cell's date in YYYY-MM-DD format. Pages that don't pass this prop keep
   * the current passive-grid behavior.
   */
  onEmptyCellClick?: (dateKey: string) => void;
}

// ─── Date helpers (all UTC-agnostic local date logic) ─────────
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
  // Monday-start week. Sunday (0) → treat as day 7 for subtraction
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

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekRangeLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${end.getFullYear()}`;
}

// Today, normalised to local midnight, for "future or today" cell eligibility checks.
function todayLocalMidnight(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

function isClickableEmptyCell(
  cellDate: Date,
  isOtherMonth: boolean,
  hasTopics: boolean,
): boolean {
  if (hasTopics) return false;
  if (isOtherMonth) return false;
  if (cellDate < todayLocalMidnight()) return false;
  return true;
}

// ─── Main component ────────────────────────────────────────────
export function TopicCalendarView({
  topics,
  mode,
  onTopicClick,
  onReschedule,
  getPillarColor,
  onEmptyCellClick,
}: TopicCalendarViewProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Partition topics by date
  const { scheduled, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Topic[]>();
    const loose: Topic[] = [];
    for (const t of topics) {
      if (!t.publishDate) {
        loose.push(t);
        continue;
      }
      const key = t.publishDate.slice(0, 10); // YYYY-MM-DD
      const bucket = byDay.get(key) ?? [];
      bucket.push(t);
      byDay.set(key, bucket);
    }
    return { scheduled: byDay, unscheduled: loose };
  }, [topics]);

  // Compute the date cells for the current view
  const cells = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    // Month view: 6 rows × 7 cols, starting from Monday of the week containing the 1st
    const firstOfMonth = startOfMonth(cursor);
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor, mode]);

  const todayKey = toDateKey(new Date());
  const currentMonthIndex = cursor.getMonth();

  // ─── Navigation ──────────────────────────────────────────────
  const goPrev = () => {
    setCursor(mode === "month" ? addMonths(cursor, -1) : addDays(cursor, -7));
  };
  const goNext = () => {
    setCursor(mode === "month" ? addMonths(cursor, 1) : addDays(cursor, 7));
  };
  const goToday = () => setCursor(new Date());

  // ─── DnD handlers ─────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, topicId: string) => {
    setDraggedTopicId(topicId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", topicId);
  };

  const handleDragEnd = () => {
    setDraggedTopicId(null);
    setDragOverKey(null);
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) setDragOverKey(key);
  };

  const handleDragLeave = () => {
    setDragOverKey(null);
  };

  const handleDrop = (e: React.DragEvent, dateKey: string | null) => {
    e.preventDefault();
    const topicId = e.dataTransfer.getData("text/plain") || draggedTopicId;
    setDraggedTopicId(null);
    setDragOverKey(null);
    if (!topicId) return;
    onReschedule(topicId, dateKey);
  };

  // ─── Render ──────────────────────────────────────────────────
  const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-3">
      {/* Header: navigation */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">
          {mode === "month" ? monthLabel(cursor) : weekRangeLabel(startOfWeek(cursor))}
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goPrev}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            title="Previous"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            title="Next"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Unscheduled strip — drop target for removing the publish date */}
      <div
        onDragOver={(e) => handleDragOver(e, "unscheduled")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
        className={`border border-dashed rounded-lg p-3 transition-colors ${
          dragOverKey === "unscheduled"
            ? "border-indigo-400 bg-indigo-50"
            : "border-gray-200 bg-gray-50/30"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Inbox size={12} className="text-gray-400" />
          <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
            Unscheduled ({unscheduled.length})
          </span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="text-[10px] text-gray-400 italic">
            Drop a topic here to clear its publish date
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <TopicChip
                key={t.id}
                topic={t}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={onTopicClick}
                getPillarColor={getPillarColor}
              />
            ))}
          </div>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1">
        {weekdayHeaders.map((d) => (
          <div
            key={d}
            className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-2 py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div
        className={`grid grid-cols-7 gap-1 ${mode === "week" ? "" : "grid-rows-6"}`}
      >
        {cells.map((date, i) => {
          const key = toDateKey(date);
          const dayTopics = scheduled.get(key) ?? [];
          const isToday = key === todayKey;
          const isOtherMonth = mode === "month" && date.getMonth() !== currentMonthIndex;
          const isDragOver = dragOverKey === key;
          const clickable =
            onEmptyCellClick !== undefined &&
            isClickableEmptyCell(date, isOtherMonth, dayTopics.length > 0);

          const cellClassName = `${mode === "week" ? "min-h-[320px]" : "min-h-[104px]"} p-1.5 rounded-md border transition-colors text-left w-full ${
            isDragOver
              ? "border-indigo-400 bg-indigo-50"
              : isOtherMonth
                ? "border-gray-100 bg-gray-50/30"
                : "border-gray-200 bg-white"
          } ${clickable ? "hover:bg-gray-50 cursor-pointer" : ""}`;

          const cellInner = (
            <>
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-medium ${
                    isToday
                      ? "bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center"
                      : isOtherMonth
                        ? "text-gray-300"
                        : "text-gray-600"
                  }`}
                >
                  {date.getDate()}
                </span>
                {dayTopics.length > 0 && (
                  <span className="text-[9px] text-gray-400">{dayTopics.length}</span>
                )}
              </div>
              <div className="space-y-1">
                {dayTopics.map((t) => (
                  <TopicChip
                    key={t.id}
                    topic={t}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onClick={onTopicClick}
                    getPillarColor={getPillarColor}
                    compact={mode === "month"}
                  />
                ))}
              </div>
            </>
          );

          if (clickable) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onEmptyCellClick!(key)}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, key)}
                aria-label={`Schedule topic for ${date.toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}`}
                className={cellClassName}
              >
                {cellInner}
              </button>
            );
          }

          return (
            <div
              key={i}
              onDragOver={(e) => handleDragOver(e, key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, key)}
              className={cellClassName}
            >
              {cellInner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Topic chip ────────────────────────────────────────────────
interface TopicChipProps {
  topic: Topic;
  onDragStart: (e: React.DragEvent, topicId: string) => void;
  onDragEnd: () => void;
  onClick: (topic: Topic) => void;
  getPillarColor: (pillar: string) => string;
  compact?: boolean;
}

function TopicChip({
  topic,
  onDragStart,
  onDragEnd,
  onClick,
  getPillarColor,
  compact = false,
}: TopicChipProps) {
  const pillarClass = topic.pillar ? getPillarColor(topic.pillar) : "bg-gray-100 text-gray-600";
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, topic.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(topic)}
      className={`${pillarClass} rounded px-1.5 py-0.5 text-[10px] font-medium cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity truncate`}
      title={topic.title}
    >
      {compact ? topic.title.slice(0, 30) : topic.title}
    </div>
  );
}
