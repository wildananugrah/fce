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
  onEmptyCellClick?: (dateKey: string) => void;
  /** When provided the caller owns the cursor; the built-in nav header is hidden. */
  cursor?: Date;
  onCursorChange?: (date: Date) => void;
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

const TODAY_LOCAL_MIDNIGHT = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

function isClickableEmptyCell(cellDate: Date, isOtherMonth: boolean, hasTopics: boolean): boolean {
  if (hasTopics) return false;
  if (isOtherMonth) return false;
  if (cellDate < TODAY_LOCAL_MIDNIGHT) return false;
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
  cursor: externalCursor,
  onCursorChange,
}: TopicCalendarViewProps) {
  const [internalCursor, setInternalCursor] = useState(() => new Date());
  const cursor = externalCursor ?? internalCursor;
  const isControlled = externalCursor !== undefined;

  const setCursor = (next: Date) => {
    setInternalCursor(next);
    onCursorChange?.(next);
  };

  const [draggedTopicId, setDraggedTopicId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const { scheduled, unscheduled } = useMemo(() => {
    const byDay = new Map<string, Topic[]>();
    const loose: Topic[] = [];
    for (const t of topics) {
      if (!t.publishDate) { loose.push(t); continue; }
      const key = t.publishDate.slice(0, 10);
      const bucket = byDay.get(key) ?? [];
      bucket.push(t);
      byDay.set(key, bucket);
    }
    return { scheduled: byDay, unscheduled: loose };
  }, [topics]);

  const cells = useMemo(() => {
    if (mode === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const firstOfMonth = startOfMonth(cursor);
    const gridStart = startOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [cursor, mode]);

  const todayKey = toDateKey(new Date());
  const currentMonthIndex = cursor.getMonth();

  const goPrev = () => setCursor(mode === "month" ? addMonths(cursor, -1) : addDays(cursor, -7));
  const goNext = () => setCursor(mode === "month" ? addMonths(cursor, 1) : addDays(cursor, 7));
  const goToday = () => setCursor(new Date());

  const handleDragStart = (e: React.DragEvent, topicId: string) => {
    setDraggedTopicId(topicId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", topicId);
  };
  const handleDragEnd = () => { setDraggedTopicId(null); setDragOverKey(null); };
  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverKey !== key) setDragOverKey(key);
  };
  const handleDragLeave = () => { setDragOverKey(null); };
  const handleDrop = (e: React.DragEvent, dateKey: string | null) => {
    e.preventDefault();
    const topicId = e.dataTransfer.getData("text/plain") || draggedTopicId;
    setDraggedTopicId(null);
    setDragOverKey(null);
    if (!topicId) return;
    onReschedule(topicId, dateKey);
  };

  const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-3">
      {/* Navigation header — only shown when uncontrolled */}
      {!isControlled && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {mode === "month" ? monthLabel(cursor) : weekRangeLabel(startOfWeek(cursor))}
          </h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={goPrev} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-secondary transition-colors" title="Previous">
              <ChevronLeft size={14} />
            </button>
            <button type="button" onClick={goToday} className="px-2.5 py-1 text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-secondary transition-colors">
              Today
            </button>
            <button type="button" onClick={goNext} className="p-1.5 text-muted hover:text-foreground hover:bg-surface-secondary transition-colors" title="Next">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Unscheduled strip */}
      <div
        onDragOver={(e) => handleDragOver(e, "unscheduled")}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, null)}
        className={`border border-dashed rounded-lg p-3 transition-colors ${
          dragOverKey === "unscheduled"
            ? "border-foreground/30 bg-foreground/5"
            : "border-border bg-surface-secondary/30"
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <Inbox size={12} className="text-muted" />
          <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">
            Unscheduled ({unscheduled.length})
          </span>
        </div>
        {unscheduled.length === 0 ? (
          <p className="text-[10px] text-muted/60 italic">Drop a topic here to clear its publish date</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <TopicChip key={t.id} topic={t} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onClick={onTopicClick} getPillarColor={getPillarColor} />
            ))}
          </div>
        )}
      </div>

      {/* Table-style calendar: header + grid share one bordered container */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Weekday header row — table-th style */}
        <div className="grid grid-cols-7 bg-surface-secondary border-b border-border">
          {weekdayHeaders.map((d, idx) => (
            <div
              key={d}
              className={`px-3 py-2.5 text-[10px] font-semibold text-muted uppercase tracking-wider ${idx < 6 ? "border-r border-border" : ""}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid — no gap, border dividers */}
        <div className={`grid grid-cols-7 ${mode === "week" ? "" : "grid-rows-6"}`}>
          {cells.map((date, i) => {
            const key = toDateKey(date);
            const dayTopics = scheduled.get(key) ?? [];
            const isToday = key === todayKey;
            const isOtherMonth = mode === "month" && date.getMonth() !== currentMonthIndex;
            const isDragOver = dragOverKey === key;
            const clickable =
              onEmptyCellClick !== undefined &&
              isClickableEmptyCell(date, isOtherMonth, dayTopics.length > 0);

            const isLastCol = (i + 1) % 7 === 0;
            const isLastRow = i >= cells.length - 7;

            const cellClassName = [
              mode === "week" ? "min-h-[320px]" : "min-h-[104px]",
              "p-2 flex flex-col items-start !rounded-none transition-colors text-left w-full",
              isLastCol ? "" : "border-r border-border",
              isLastRow ? "" : "border-b border-border",
              isDragOver
                ? "bg-foreground/5"
                : isOtherMonth
                  ? "bg-surface-secondary/40"
                  : "bg-surface",
              clickable ? "hover:bg-surface-secondary cursor-pointer" : "",
            ].filter(Boolean).join(" ");

            const cellInner = (
              <>
                <div className="flex items-center justify-between w-full mb-1">
                  <span
                    className={`text-[11px] font-medium leading-none ${
                      isToday
                        ? "bg-foreground text-background rounded-full w-5 h-5 flex items-center justify-center"
                        : isOtherMonth
                          ? "text-muted/40"
                          : "text-muted"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  {dayTopics.length > 0 && (
                    <span className="text-[9px] text-muted/60">{dayTopics.length}</span>
                  )}
                </div>
                <div className="space-y-1 w-full">
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
                  onClick={() => onEmptyCellClick?.(key)}
                  onDragOver={(e) => handleDragOver(e, key)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, key)}
                  aria-label={`Schedule topic for ${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`}
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

function TopicChip({ topic, onDragStart, onDragEnd, onClick, getPillarColor, compact = false }: TopicChipProps) {
  const pillarClass = topic.pillar ? getPillarColor(topic.pillar) : "bg-surface-secondary text-muted";
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, topic.id)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(topic)}
      className={`${pillarClass} rounded-sm px-1.5 py-0.5 text-[10px] font-medium cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity truncate w-full`}
      title={topic.title}
    >
      {compact ? topic.title.slice(0, 30) : topic.title}
    </div>
  );
}
