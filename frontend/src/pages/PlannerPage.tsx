import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Sparkles, Table as TableIcon } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { TopicCalendarView } from "../components/topics/TopicCalendarView";
import { TopicDetailDrawer } from "../components/topics/TopicDetailDrawer";
import { PlannerListView } from "../components/planner/PlannerListView";
import { PlannerTopicGeneratorPanel } from "../components/planner/PlannerTopicGeneratorPanel";
import { PlannerContentGeneratorPanel } from "../components/planner/PlannerContentGeneratorPanel";
import { PlannerContentPreviewPanel } from "../components/planner/PlannerContentPreviewPanel";
import { getPillarColor } from "../utils/pillar-colors";

type ViewMode = "calendar" | "list";

interface BrainVersion {
  isActive: boolean;
  tone?: string | null;
  personality?: string | null;
  usp?: string | null;
  targetAudience?: string | null;
}

interface Brand {
  id: string;
  name: string;
  language?: string;
  brainVersions?: BrainVersion[];
}

interface Product {
  id: string;
  name: string;
  brandId: string;
  brainVersions?: BrainVersion[];
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

function brandInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function PlannerPage() {
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();

  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [activeBrandId, setActiveBrandId] = useState<string>("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [pendingScheduleDate, setPendingScheduleDate] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [contentByTopicId, setContentByTopicId] = useState<Map<string, LibraryItem>>(new Map());
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

  // Load products for the active project — needed by the in-page Content
  // Generator (slide 7) so the user can pick which products to feature.
  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    const qs = activeProject ? `?projectId=${activeProject.id}` : "";
    api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products${qs}`)
      .then((data) => {
        if (!cancelled) setProducts(data);
      })
      .catch(() => {
        // Non-fatal — generator just won't show products.
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace, activeProject]);

  // Load all library items once so we can flag which topics already have
  // content and short-circuit the View Content flow without an extra fetch.
  // We keep only the latest LibraryItem per contentTopicId.
  const loadContent = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const projectParam = activeProject ? `&projectId=${activeProject.id}` : "";
      const items = await api<LibraryItem[]>(
        `/api/workspaces/${activeWorkspace.id}/library?status=draft,in_review,approved,rejected${projectParam}`,
      );
      // items are ordered by createdAt desc by the backend, so the first item
      // we see for a topic is the most recent.
      const map = new Map<string, LibraryItem>();
      for (const item of items) {
        const tid = item.request.contentTopicId;
        if (tid && !map.has(tid)) map.set(tid, item);
      }
      setContentByTopicId(map);
    } catch (e) {
      // Non-fatal — preview just won't appear. Don't toast: this fires on
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

  const activeBrand = brands.find((b) => b.id === activeBrandId) ?? null;

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
      const item = contentByTopicId.get(topicId);
      if (!item) {
        showToast("No content found for this topic yet", "info");
        return;
      }
      setPreviewItem(item);
    },
    [contentByTopicId, showToast],
  );


  const handleTopicUpdated = useCallback((updated: Topic) => {
    setTopics((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          {activeBrand ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-sm font-semibold text-violet-700">
              {brandInitial(activeBrand.name)}
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
              <CalendarDays size={18} />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            {brands.length > 0 ? (
              <select
                value={activeBrandId}
                onChange={(e) => setActiveBrandId(e.target.value)}
                className="-ml-1 rounded px-1 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm font-semibold text-gray-500">
                {loadingBrands ? "Loading brands…" : "No brands"}
              </span>
            )}
            <span className="text-xs text-gray-500">
              {loadingTopics ? "…" : `${brandTopics.length} topic${brandTopics.length === 1 ? "" : "s"}`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                viewMode === "calendar"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <CalendarDays size={14} />
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
                viewMode === "list"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <TableIcon size={14} />
              List
            </button>
          </div>
          <Button
            disabled={!activeBrandId}
            onClick={() => setGeneratorOpen(true)}
          >
            <Sparkles size={14} className="mr-1.5" />
            Generate
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-gray-50 p-6">
        {!activeWorkspace ? (
          <EmptyState message="Pick a workspace to get started." />
        ) : loadingBrands ? (
          <Centered>
            <Spinner size="lg" />
          </Centered>
        ) : brands.length === 0 ? (
          <EmptyState message="This project has no brands yet. Create one in Brand Brain to start planning." />
        ) : !activeBrandId ? (
          <EmptyState message="Pick a brand from the header to view its topics." />
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
          hasContent={detailTopic ? contentByTopicId.has(detailTopic.id) : false}
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
        />
      )}

      {activeWorkspace && (
        <PlannerContentGeneratorPanel
          isOpen={contentGenTopic !== null}
          onClose={() => setContentGenTopic(null)}
          workspaceId={activeWorkspace.id}
          brands={brands}
          products={products}
          topic={contentGenTopic}
          onSaved={() => {
            // Refresh the topic→content map so the Planner knows this topic
            // now has content and the View Content button lights up.
            void loadContent();
          }}
          onToast={showToast}
        />
      )}

      <PlannerContentPreviewPanel
        isOpen={previewItem !== null}
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onRegenerate={
          previewItem
            ? () => {
                const topicId = [...contentByTopicId.entries()].find(
                  ([, item]) => item.id === previewItem.id,
                )?.[0];
                const topic = topics.find((t) => t.id === topicId) ?? null;
                setPreviewItem(null);
                if (topic) setContentGenTopic(topic);
              }
            : undefined
        }
        onSave={() => setPreviewItem(null)}
        onToast={showToast}
      />


      {activeWorkspace && (
        <PlannerTopicGeneratorPanel
          isOpen={generatorOpen}
          onClose={() => {
            setGeneratorOpen(false);
            setPendingScheduleDate(null);
          }}
          workspaceId={activeWorkspace.id}
          brands={brands}
          initialBrandId={activeBrandId}
          initialDate={pendingScheduleDate}
          onSavedTopics={loadTopics}
          onEditTopic={(topic) => setDetailTopic(topic)}
          onToast={showToast}
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

