import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useHeaderSlot } from "../contexts/HeaderSlotContext";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { api } from "../services/api";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { TopicCalendarView } from "../components/topics/TopicCalendarView";
import { TopicDetailDrawer } from "../components/topics/TopicDetailDrawer";
import { PlannerListView } from "../components/planner/PlannerListView";
import { TopicGeneratorSlider } from "../components/planner/TopicGeneratorSlider";
import { ContentGeneratorSlider } from "../components/planner/ContentGeneratorSlider";
import { TopicContentListSlider } from "../components/planner/TopicContentListSlider";
import { ContentPreviewModal } from "../components/library/ContentPreviewModal";
import { getPillarColor } from "../utils/pillar-colors";

type ViewMode = "calendar" | "list";

interface Brand {
  id: string;
  name: string;
  language?: string;
}

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
  products?: Array<{ id: string; product: { id: string; name: string } }>;
  brand?: { id: string; name: string } | null;
  createdAt: string;
}

interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  createdAt: string;
  request: {
    platform: string;
    contentType: string;
    contentTopicId?: string | null;
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

type ToastType = "success" | "error" | "info";
type ToastState = { message: string; type: ToastType } | null;

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function PlannerPage() {
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();

  const [searchParams] = useSearchParams();
  const viewMode = (searchParams.get("view") as ViewMode) ?? "calendar";
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string>("");
  const [cursor, setCursor] = useState(() => new Date());
  const setSlot = useHeaderSlot();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [pendingScheduleDate, setPendingScheduleDate] = useState<string | null>(null);
  const [contentByTopicId, setContentByTopicId] = useState<Map<string, LibraryItem[]>>(new Map());
  const [viewListForTopic, setViewListForTopic] = useState<Topic | null>(null);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);
  const [contentGenTopic, setContentGenTopic] = useState<Topic | null>(null);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
  }, []);

  // Load brands for the active project.
  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    setLoadingBrands(true);
    const qs = activeProject ? `?projectId=${activeProject.id}` : "";
    api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`)
      .then((data) => {
        if (cancelled) return;
        setBrands(data);
        // Auto-pick the first brand if none chosen yet.
        setActiveBrandId((prev) => (prev && data.some((b) => b.id === prev) ? prev : data[0]?.id ?? ""));
      })
      .catch((e) => {
        if (cancelled) return;
        showToast(e instanceof Error ? e.message : "Failed to load brands", "error");
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, activeProject, showToast]);

  // Load topics scoped to the active project. Backend has no brand/date filter
  // today (see docs/notes), so we filter client-side.
  const loadTopics = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoadingTopics(true);
    try {
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const data = await api<Topic[]>(`/api/workspaces/${activeWorkspace.id}/topics${qs}`);
      setTopics(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load topics", "error");
    } finally {
      setLoadingTopics(false);
    }
  }, [activeWorkspace, activeProject, showToast]);

  useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  // Load all library items once so we can flag which topics already have
  // content and surface the full per-topic list in the View Content slider
  // without an extra fetch. Items per topic stay in createdAt-desc order
  // because that's how the backend returns them.
  const loadContent = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const projectParam = activeProject ? `&projectId=${activeProject.id}` : "";
      const items = await api<LibraryItem[]>(
        `/api/workspaces/${activeWorkspace.id}/library?status=draft,in_review,approved,rejected${projectParam}`,
      );
      const map = new Map<string, LibraryItem[]>();
      for (const item of items) {
        const tid = item.request.contentTopicId;
        if (!tid) continue;
        const list = map.get(tid);
        if (list) list.push(item);
        else map.set(tid, [item]);
      }
      setContentByTopicId(map);
    } catch (e) {
      // Non-fatal — list just won't appear. Don't toast: this fires on
      // page load and a transient failure shouldn't surface a user-visible error.
      console.error("Failed to load planner content map", e);
    }
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  const brandTopics = useMemo(() => {
    if (!activeBrandId) return [];
    return topics.filter((t) => (t.brand?.id ?? t.brandId) === activeBrandId);
  }, [topics, activeBrandId]);

  // Inject brand selector + month nav into GlobalHeader
  useEffect(() => {
    setSlot(
      <div className="flex flex-1 items-center justify-center gap-4">
        {brands.length > 1 && (
          <select
            value={activeBrandId}
            onChange={(e) => setActiveBrandId(e.target.value)}
            className="text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        {viewMode === "calendar" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCursor((d) => addMonths(d, -1))}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title="Previous month"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-gray-900 min-w-[130px] text-center">
              {monthLabel(cursor)}
            </span>
            <button
              type="button"
              onClick={() => setCursor(new Date())}
              className="px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setCursor((d) => addMonths(d, 1))}
              className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
              title="Next month"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>,
    );
    return () => setSlot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSlot, brands, activeBrandId, viewMode, cursor]);

  const handleTopicClick = useCallback((topic: Topic) => {
    setDetailTopic(topic);
  }, []);

  // Optimistic drag-drop reschedule. `newDate` is YYYY-MM-DD or null
  // (dropped on the Unscheduled rail).
  const handleReschedule = useCallback(
    async (topicId: string, newDate: string | null) => {
      if (!activeWorkspace) return;
      const previous = topics;
      const target = previous.find((t) => t.id === topicId);
      if (!target) return;
      // No-op when the user drops the topic back on its current day.
      if ((target.publishDate?.slice(0, 10) ?? null) === newDate) return;

      // Optimistic update — server response will overwrite when it arrives.
      setTopics((prev) =>
        prev.map((t) =>
          t.id === topicId
            ? { ...t, publishDate: newDate ? `${newDate}T00:00:00.000Z` : null }
            : t,
        ),
      );

      try {
        const fresh = await api<Topic>(
          `/api/workspaces/${activeWorkspace.id}/topics/${topicId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ publishDate: newDate }),
          },
        );
        setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, ...fresh } : t)));
      } catch (e) {
        setTopics(previous); // revert
        showToast(e instanceof Error ? e.message : "Failed to reschedule topic", "error");
      }
    },
    [activeWorkspace, topics, showToast],
  );

  const handleListView = useCallback((topic: Topic) => {
    setDetailTopic(topic);
  }, []);

  const handleListGenerate = useCallback((topic: Topic) => {
    setContentGenTopic(topic);
  }, []);

  const handleViewContentForTopic = useCallback(
    (topicId: string) => {
      const list = contentByTopicId.get(topicId);
      if (!list || list.length === 0) {
        showToast("No content found for this topic yet", "info");
        return;
      }
      const topic = topics.find((t) => t.id === topicId) ?? null;
      if (topic) setViewListForTopic(topic);
    },
    [contentByTopicId, topics, showToast],
  );


  const handleTopicUpdated = useCallback((updated: Topic) => {
    setTopics((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  }, []);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex-1 overflow-auto p-6">
        {!activeWorkspace ? (
          <EmptyState message="Pick a workspace to get started." />
        ) : loadingBrands ? (
          <Centered>
            <Spinner size="lg" />
          </Centered>
        ) : brands.length === 0 ? (
          <EmptyState message="This project has no brands yet. Create one in Brand Brain to start planning." />
        ) : !activeBrandId ? (
          <EmptyState message="No brand found for this project." />
        ) : loadingTopics ? (
          <Centered>
            <Spinner size="lg" />
          </Centered>
        ) : viewMode === "calendar" ? (
          <TopicCalendarView
            topics={brandTopics}
            mode="month"
            onTopicClick={handleTopicClick}
            onReschedule={handleReschedule}
            getPillarColor={getPillarColor}
            cursor={cursor}
            onCursorChange={setCursor}
            onEmptyCellClick={(dateKey) => {
              setPendingScheduleDate(dateKey);
              setGeneratorOpen(true);
            }}
          />
        ) : (
          <PlannerListView
            topics={brandTopics}
            onView={handleListView}
            onGenerate={handleListGenerate}
          />
        )}
      </div>

      {activeWorkspace && (
        <TopicDetailDrawer
          isOpen={detailTopic !== null}
          topic={detailTopic}
          workspaceId={activeWorkspace.id}
          onClose={() => setDetailTopic(null)}
          onUpdated={handleTopicUpdated}
          onToast={showToast}
          hasContent={
            detailTopic
              ? (contentByTopicId.get(detailTopic.id)?.length ?? 0) > 0
              : false
          }
          onViewContent={
            detailTopic
              ? () => {
                  const id = detailTopic.id;
                  setDetailTopic(null);
                  handleViewContentForTopic(id);
                }
              : undefined
          }
          onGenerateContent={
            detailTopic
              ? () => {
                  const t = detailTopic;
                  setDetailTopic(null);
                  setContentGenTopic(t);
                }
              : undefined
          }
          onDeleted={(topicId) => {
            setTopics((prev) => prev.filter((t) => t.id !== topicId));
            setContentByTopicId((prev) => {
              if (!prev.has(topicId)) return prev;
              const next = new Map(prev);
              next.delete(topicId);
              return next;
            });
          }}
        />
      )}

      {activeWorkspace && (
        <ContentGeneratorSlider
          isOpen={contentGenTopic !== null}
          onClose={() => setContentGenTopic(null)}
          initialBrandId={contentGenTopic?.brandId ?? activeBrandId}
          initialTopicId={contentGenTopic?.id}
          initialProductIds={contentGenTopic?.products?.map((tp) => tp.product.id)}
          initialPlatform={contentGenTopic?.platform ?? undefined}
          initialContentType={contentGenTopic?.format ?? undefined}
          initialObjective={contentGenTopic?.objective ?? undefined}
          onSavedContent={() => {
            // Refresh the topic→content map so the Planner knows this topic
            // now has content and the View Content button lights up.
            void loadContent();
          }}
        />
      )}

      <TopicContentListSlider
        isOpen={viewListForTopic !== null}
        onClose={() => setViewListForTopic(null)}
        topicTitle={viewListForTopic?.title ?? ""}
        items={viewListForTopic ? (contentByTopicId.get(viewListForTopic.id) ?? []) : []}
        onPickItem={(itemId) => {
          const list = viewListForTopic
            ? contentByTopicId.get(viewListForTopic.id)
            : undefined;
          const item = list?.find((i) => i.id === itemId) ?? null;
          if (item) setPreviewItem(item);
        }}
      />

      {previewItem && activeWorkspace && (
        <ContentPreviewModal
          item={previewItem}
          workspaceId={activeWorkspace.id}
          presentation="slider"
          onClose={() => setPreviewItem(null)}
          onStatusChange={(id, status) => {
            setPreviewItem((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
            setContentByTopicId((prev) => {
              const next = new Map(prev);
              for (const [tid, list] of next) {
                const updated = list.map((it) => (it.id === id ? { ...it, status } : it));
                next.set(tid, updated);
              }
              return next;
            });
          }}
          onToast={showToast}
        />
      )}


      {activeWorkspace && (
        <TopicGeneratorSlider
          isOpen={generatorOpen}
          onClose={() => {
            setGeneratorOpen(false);
            setPendingScheduleDate(null);
          }}
          initialDate={pendingScheduleDate}
          initialBrandId={activeBrandId}
          onSavedTopics={loadTopics}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center">{children}</div>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <CalendarDays size={48} className="mx-auto mb-3 text-gray-300" />
        <p className="max-w-sm text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}

