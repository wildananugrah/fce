import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer } from "../ui/Drawer";
import { ContentPreviewModal } from "../library/ContentPreviewModal";
import { api } from "../../services/api";
import {
  Tag,
  Layers,
  Globe,
  Target,
  Calendar,
  Package,
  FileText,
  Sparkles,
  Trash2,
  Loader2,
  Check,
  Eye,
} from "lucide-react";

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

interface ContentItem {
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

interface TopicDetailDrawerProps {
  isOpen: boolean;
  topic: Topic | null;
  workspaceId: string;
  onClose: () => void;
  onUpdated: (topic: Topic) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  /** Whether this topic already has generated content. */
  hasContent?: boolean;
  /** Called to navigate to the content view for this topic. */
  onViewContent?: () => void;
  /** Override the default Generate Content navigation (e.g. open an in-page panel). */
  onGenerateContent?: () => void;
  /** Called after a successful soft-delete so the parent can drop the topic from its list. */
  onDeleted?: (topicId: string) => void;
}

const PLATFORMS = [
  { value: "", label: "—" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
];

const FORMATS = [
  { value: "", label: "—" },
  { value: "single_image", label: "Single Image" },
  { value: "carousel", label: "Carousel" },
  { value: "reels", label: "Reels" },
  { value: "story_image", label: "Story – Image" },
  { value: "story_video", label: "Story – Video" },
  { value: "tiktok_video", label: "TikTok Video" },
  { value: "tiktok_carousel", label: "TikTok Carousel" },
  { value: "long_video", label: "Long Video" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "single_tweet", label: "Single Tweet" },
  { value: "thread", label: "Thread" },
  { value: "video_tweet", label: "Video Tweet" },
  { value: "single_post", label: "Single Post" },
  { value: "carousel_post", label: "Carousel Post" },
  { value: "linkedin_video", label: "LinkedIn Video" },
  { value: "article", label: "Article" },
  { value: "feed_post", label: "Feed Post" },
  { value: "carousel_ad", label: "Carousel Ad" },
  { value: "reel_short_video", label: "Reel / Short Video" },
  { value: "story", label: "Story" },
];

const OBJECTIVES = [
  { value: "", label: "—" },
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "education", label: "Education" },
  { value: "conversion", label: "Conversion" },
  { value: "retention", label: "Retention" },
];

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function formatFullDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function getPlatformBadgeClass(platform: string): string {
  const map: Record<string, string> = {
    instagram: "bg-purple-100 text-purple-700",
    tiktok: "bg-gray-800 text-white",
    youtube: "bg-red-100 text-red-700",
    twitter: "bg-blue-100 text-blue-700",
    linkedin: "bg-sky-100 text-sky-700",
    facebook: "bg-blue-100 text-blue-700",
  };
  return map[platform] ?? "bg-gray-100 text-gray-700";
}

function getContentStatusColor(status: string): string {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "generated") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function extractTextSections(item: ContentItem) {
  const sorted = [...item.sections].sort((a, b) => a.sectionOrder - b.sectionOrder);
  const getText = (type: string) =>
    sorted
      .filter((s) => s.sectionType === type)
      .map((s) => s.contentText)
      .join(" ");
  return {
    hook:
      getText("hook") ||
      (item.content.hook as string) ||
      (item.content.headline as string) ||
      "",
    caption:
      getText("caption") ||
      (item.content.caption as string) ||
      (item.content.body as string) ||
      "",
    cta: getText("cta") || (item.content.cta as string) || "",
    hashtags:
      getText("hashtags") ||
      (Array.isArray(item.content.hashtags)
        ? (item.content.hashtags as string[]).join(" ")
        : ""),
  };
}

export function TopicDetailDrawer({
  isOpen,
  topic,
  workspaceId,
  onClose,
  onUpdated,
  onToast,
  onGenerateContent,
  onDeleted,
}: TopicDetailDrawerProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pillar, setPillar] = useState("");
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState("");
  const [objective, setObjective] = useState("");
  const [publishDate, setPublishDate] = useState("");
  const [status, setStatus] = useState("draft");

  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const autoSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null);

  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Textarea auto-resize
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  // Reset form when topic changes
  useEffect(() => {
    if (!topic) return;
    setTitle(topic.title ?? "");
    setDescription(topic.description ?? "");
    setPillar(topic.pillar ?? "");
    setPlatform(topic.platform ?? "");
    setFormat(topic.format ?? "");
    setObjective(topic.objective ?? "");
    setPublishDate(topic.publishDate ? topic.publishDate.split("T")[0] : "");
    setStatus(topic.status ?? "draft");
  }, [topic]);

  // Fetch generated content for this topic
  useEffect(() => {
    if (!isOpen || !topic) {
      setContentItems([]);
      return;
    }
    setLoadingContent(true);
    api<ContentItem[]>(`/api/workspaces/${workspaceId}/library`)
      .then((items) => {
        setContentItems(
          items.filter((item) => item.request.contentTopicId === topic.id),
        );
      })
      .catch(() => setContentItems([]))
      .finally(() => setLoadingContent(false));
  }, [isOpen, topic?.id, workspaceId]);

  if (!topic) return null;

  // Core save — accepts field overrides so select/date onChange can pass
  // the new value directly without waiting for state to flush.
  const saveWithValues = async (overrides: Record<string, string | null> = {}) => {
    setAutoSaveState("saving");
    if (autoSavedTimerRef.current) clearTimeout(autoSavedTimerRef.current);
    const payload: Record<string, string | null> = {
      title: title.trim(),
      description: description.trim() || null,
      pillar: pillar.trim() || null,
      platform: platform || null,
      format: format || null,
      objective: objective || null,
      publishDate: publishDate || null,
      status,
      ...overrides,
    };
    try {
      const res = await api<{ data: Topic }>(
        `/api/workspaces/${workspaceId}/topics/${topic.id}`,
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      const updated = (res as any).data ?? res;
      onUpdated({ ...topic, ...updated });
      setAutoSaveState("saved");
      autoSavedTimerRef.current = setTimeout(() => setAutoSaveState("idle"), 2000);
    } catch (e) {
      setAutoSaveState("idle");
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    }
  };

  // Blur handler for text inputs — only saves if value changed from topic
  const isDirty =
    title !== (topic.title ?? "") ||
    description !== (topic.description ?? "") ||
    pillar !== (topic.pillar ?? "") ||
    format !== (topic.format ?? "");

  const handleBlurSave = () => {
    if (isDirty) saveWithValues();
  };

  const handleDelete = async () => {
    if (!confirm(`Move "${topic.title}" to Trash?`)) return;
    setDeleting(true);
    try {
      await api(`/api/workspaces/${workspaceId}/topics/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [topic.id] }),
      });
      onToast("Topic moved to Trash", "success");
      onDeleted?.(topic.id);
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to delete topic", "error");
    } finally {
      setDeleting(false);
    }
  };

  const generateHandler = () => {
    if (onGenerateContent) {
      onGenerateContent(); // parent closes drawer + opens content generator
      return;
    }
    // Navigate away — close drawer first
    onClose();
    const params = new URLSearchParams();
    params.set("topicId", topic.id);
    if (topic.brandId) params.set("brandId", topic.brandId);
    if (platform) params.set("platform", platform);
    if (format) params.set("format", format);
    if (objective) params.set("objective", objective);
    topic.products?.forEach((tp) => params.append("productId", tp.product.id));
    navigate(`/generate?${params.toString()}`);
  };

  const showRightPanel = contentItems.length > 0 || loadingContent;
  const drawerWidth = "w-[50vw]";

  const formPanel = (
    <div
      className={`${showRightPanel ? "w-1/2 border-r border-border" : "w-full"} overflow-y-auto p-6 space-y-6 shrink-0`}
    >
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleBlurSave}
          className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
          Description
        </label>
        <textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleBlurSave}
          placeholder="What is this topic about?"
          className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none overflow-hidden leading-relaxed placeholder:text-muted min-h-[72px]"
        />
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Pillar */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Tag size={12} />
            Pillar
          </label>
          <input
            type="text"
            value={pillar}
            onChange={(e) => setPillar(e.target.value)}
            onBlur={handleBlurSave}
            placeholder="Content pillar"
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-muted"
          />
        </div>

        {/* Format */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Layers size={12} />
            Format
          </label>
          <select
            value={format}
            onChange={(e) => {
              const v = e.target.value;
              setFormat(v);
              saveWithValues({ format: v || null });
            }}
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
            {/* Preserve any legacy free-text value not in the list */}
            {format && !FORMATS.some((f) => f.value === format) && (
              <option value={format}>{format}</option>
            )}
          </select>
        </div>

        {/* Platform */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Globe size={12} />
            Platform
          </label>
          <select
            value={platform}
            onChange={(e) => {
              const v = e.target.value;
              setPlatform(v);
              saveWithValues({ platform: v || null });
            }}
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Objective */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Target size={12} />
            Objective
          </label>
          <select
            value={objective}
            onChange={(e) => {
              const v = e.target.value;
              setObjective(v);
              saveWithValues({ objective: v || null });
            }}
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {OBJECTIVES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Publish Date */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Calendar size={12} />
            Publish Date
          </label>
          <input
            type="date"
            value={publishDate}
            onChange={(e) => {
              const v = e.target.value;
              setPublishDate(v);
              saveWithValues({ publishDate: v || null });
            }}
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Status */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <FileText size={12} />
            Status
          </label>
          <select
            value={status}
            onChange={(e) => {
              const v = e.target.value;
              setStatus(v);
              saveWithValues({ status: v });
            }}
            className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Products */}
      {topic.products && topic.products.length > 0 && (
        <div>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
            <Package size={12} />
            Products
          </label>
          <div className="flex flex-wrap gap-1.5">
            {topic.products.map((tp) => (
              <span
                key={tp.id}
                className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-medium bg-accent/10 text-accent"
              >
                {tp.product.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Metadata footer */}
      <div className="pt-4 border-t border-border text-[11px] text-muted space-y-0.5">
        <p>
          <span className="font-medium">Created:</span>{" "}
          {formatFullDate(topic.createdAt)}
        </p>
        <p>
          <span className="font-medium">Topic ID:</span> {topic.id}
        </p>
      </div>

      {/* Auto-save status */}
      <div className="h-5 flex items-center">
        {autoSaveState === "saving" && (
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <Loader2 size={11} className="animate-spin" />
            Saving…
          </span>
        )}
        {autoSaveState === "saved" && (
          <span className="flex items-center gap-1.5 text-[11px] text-green-600">
            <Check size={11} />
            Saved
          </span>
        )}
      </div>
    </div>
  );

  const contentPanel = (
    <div className="flex-1 min-w-0 overflow-y-auto p-6 bg-surface-secondary">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-foreground">Generated Content</h3>
        {!loadingContent && (
          <span className="text-xs text-muted">({contentItems.length})</span>
        )}
      </div>

      {loadingContent ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={16} className="animate-spin text-muted" />
        </div>
      ) : (
        <div className="space-y-3">
          {contentItems.map((item) => {
            const { hook, caption, cta, hashtags } = extractTextSections(item);
            const platformClass = getPlatformBadgeClass(item.request.platform);
            const statusClass = getContentStatusColor(item.status);

            return (
              <div
                key={item.id}
                onClick={() => setPreviewItem(item)}
                className="bg-white border border-border rounded-lg p-4 space-y-2 cursor-pointer hover:border-accent/40 hover:shadow-sm transition-all"
              >
                {/* Header row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium capitalize ${platformClass}`}
                  >
                    {item.request.platform}
                  </span>
                  <span className="text-[10px] text-muted capitalize">
                    {item.request.contentType.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium capitalize ml-auto ${statusClass}`}
                  >
                    {item.status.replace(/_/g, " ")}
                  </span>
                </div>

                {/* Content title */}
                {item.contentTitle && (
                  <p className="text-xs font-semibold text-foreground leading-snug">
                    {item.contentTitle}
                  </p>
                )}

                {/* Hook */}
                {hook && (
                  <p className="text-xs font-medium text-foreground leading-relaxed line-clamp-2">
                    {hook}
                  </p>
                )}

                {/* Caption */}
                {caption && (
                  <p className="text-xs text-muted leading-relaxed line-clamp-3">
                    {caption}
                  </p>
                )}

                {/* CTA */}
                {cta && (
                  <p className="text-[11px] text-accent font-medium leading-snug line-clamp-1">
                    → {cta}
                  </p>
                )}

                {/* Hashtags */}
                {hashtags && (
                  <p className="text-[10px] text-muted/70 line-clamp-1 font-mono">
                    {hashtags}
                  </p>
                )}

                {/* Card footer */}
                <div className="flex items-center justify-between pt-1.5 border-t border-border">
                  <p className="text-[10px] text-muted/50">
                    {formatFullDate(item.createdAt)}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewItem(item);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-secondary transition-colors"
                  >
                    <Eye size={10} />
                    View
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title="Topic Details"
        width={drawerWidth}
        headerActions={
          <>
            <button
              type="button"
              onClick={generateHandler}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-accent-foreground rounded-full hover:opacity-80 transition-opacity"
            >
              <Sparkles size={13} />
              Generate
            </button>
            {onDeleted && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                title="Move to Trash"
                className="p-1.5 text-danger hover:bg-danger/10 rounded-md transition-colors disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </>
        }
      >
        <div className="flex h-full">
          {formPanel}
          {showRightPanel && contentPanel}
        </div>
      </Drawer>

      {previewItem && (
        <ContentPreviewModal
          item={previewItem as any}
          workspaceId={workspaceId}
          onClose={() => setPreviewItem(null)}
          onStatusChange={(id, newStatus) => {
            setContentItems((prev) =>
              prev.map((i) => (i.id === id ? { ...i, status: newStatus } : i)),
            );
          }}
          onToast={onToast}
        />
      )}
    </>
  );
}
