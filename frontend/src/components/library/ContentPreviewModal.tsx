import { useState, useEffect } from "react";
import { X, Copy, Check } from "lucide-react";
import { getPreviewComponent } from "./previews/PreviewRegistry";
import { api } from "../../services/api";
import { SectionImageCell, PostImageGenerator } from "../generation/SectionImageCell";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface LibraryItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  request: {
    platform: string;
    contentType: string;
    brand?: { id: string; name: string } | null;
    product?: { id: string; name: string } | null;
  };
  sections: Section[];
}

interface ContentPreviewModalProps {
  item: LibraryItem;
  workspaceId: string;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onSectionsUpdated?: (itemId: string, sections: Section[]) => void;
  /** When false, the status dropdown is replaced with a read-only badge. */
  canChangeStatus?: boolean;
  /** When provided, "Save Changes" on a still-`generated` item also promotes
   *  it to `draft` and calls this callback so the parent can remove it from
   *  its list. Used by the Content Generator, not the Library. */
  onSent?: (itemId: string) => void;
  /** Render as a right-side slide-over instead of a centered modal.
   *  Used when this component is opened from inside another slider, so
   *  the preview stacks naturally on top of the host slider. */
  presentation?: "modal" | "slider";
}

function getStatusStyle(status: string) {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

/**
 * Picks a slider width bucket based on the content's natural shape.
 * - Vertical phone formats (reels, stories, IG single image) get a narrow
 *   panel that mimics a handset.
 * - Carousels need a touch more room for slide navigation.
 * - Long-form video sits on a desktop-wide canvas.
 * - Text-heavy formats get a comfortable reading column.
 */
function getSliderWidthClass(contentType: string): string {
  switch (contentType) {
    // Phone-portrait (single column, vertical)
    case "single_image":
    case "story_image":
    case "story_video":
    case "story":
    case "reels":
    case "tiktok_video":
    case "youtube_shorts":
    case "reel_short_video":
      return "max-w-md";
    // Carousels — slightly wider for slide controls
    case "carousel":
    case "tiktok_carousel":
    case "carousel_post":
    case "carousel_ad":
      return "max-w-lg";
    // Long-form text
    case "thread":
    case "article":
      return "max-w-3xl";
    // Wide desktop video
    case "long_video":
      return "max-w-5xl";
    // Default: text-first feed posts
    default:
      return "max-w-2xl";
  }
}

export function ContentPreviewModal({
  item,
  workspaceId,
  onClose,
  onStatusChange,
  onToast,
  onSectionsUpdated,
  canChangeStatus = true,
  onSent,
  presentation = "modal",
}: ContentPreviewModalProps) {
  const [currentStatus, setCurrentStatus] = useState(item.status);
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [savingSections, setSavingSections] = useState(false);
  // Local mirror of item.sections so image generation can update rows in
  // place without a full re-fetch from the parent. Reset only when the
  // underlying item changes (different id) — not on every parent re-render,
  // otherwise toast-triggered re-renders would overwrite freshly generated
  // image URLs with the stale sections we originally received.
  const [localSections, setLocalSections] = useState<Section[]>(item.sections);
  // Pending status change — user has picked a new status but hasn't confirmed
  // yet (so they can type a note, or cancel).
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>("");

  // Status change history, fetched eagerly when the modal opens.
  const [history, setHistory] = useState<
    Array<{
      id: string;
      before: any;
      after: any;
      note: string | null;
      createdAt: string;
      user: { id: string; fullName: string | null; email: string } | null;
    }>
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setLocalSections(item.sections);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    if (!canChangeStatus) return;
    (async () => {
      try {
        const res = await api<{
          data: Array<{
            id: string;
            before: any;
            after: any;
            note: string | null;
            createdAt: string;
            user: { id: string; fullName: string | null; email: string } | null;
          }>;
        }>(`/api/workspaces/${workspaceId}/library/${item.id}/history`);
        setHistory((res as any).data ?? res);
      } catch {
        setHistory([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // Pending edits keyed by sectionType for fields whose section doesn't
  // exist yet (older outputs may only have the data in item.content.*).
  // These get promoted to real sections on save via POST /sections.
  const [pendingNewByType, setPendingNewByType] = useState<Record<string, string>>({});

  const isDirty =
    Object.keys(editedSections).length > 0 || Object.keys(pendingNewByType).length > 0;

  // Fallback from content.* fields used by the preview components, so the
  // edit form mirrors whatever the preview shows.
  const getContentFallback = (type: string): string => {
    const c = item.content;
    if (type === "hook") return (c.hook as string) ?? (c.headline as string) ?? "";
    if (type === "caption") return (c.caption as string) ?? (c.body as string) ?? "";
    if (type === "visual_direction") return (c.visualDirection as string) ?? "";
    if (type === "cta") return (c.cta as string) ?? "";
    return "";
  };

  const getSectionText = (type: string): string => {
    if (pendingNewByType[type] !== undefined) return pendingNewByType[type];
    const section = localSections.find((s) => s.sectionType === type);
    if (!section) return getContentFallback(type);
    return editedSections[section.id] ?? section.contentText;
  };

  const getJsonField = (sectionId: string, contentText: string, field: string): string => {
    try {
      const source = editedSections[sectionId] ?? contentText;
      const data = JSON.parse(source);
      return (data[field] as string) ?? "";
    } catch {
      return "";
    }
  };

  const handleJsonFieldChange = (
    sectionId: string,
    contentText: string,
    field: string,
    value: string,
  ) => {
    try {
      const current = editedSections[sectionId] ?? contentText;
      const data = JSON.parse(current);
      const nextText = JSON.stringify({ ...data, [field]: value });
      if (nextText === contentText) {
        setEditedSections((prev) => {
          const { [sectionId]: _removed, ...rest } = prev;
          return rest;
        });
      } else {
        setEditedSections((prev) => ({ ...prev, [sectionId]: nextText }));
      }
    } catch {
      /* malformed JSON → no-op */
    }
  };

  const applySectionUpdate = (sectionId: string, contentText: string) => {
    setLocalSections((prev) => {
      const next = prev.map((s) => (s.id === sectionId ? { ...s, contentText } : s));
      onSectionsUpdated?.(item.id, next);
      return next;
    });
    // Image regenerations are persisted server-side as part of the generate
    // call, so the text-edit "Save Changes" button stays disabled. Toast so
    // the user knows the image was saved.
    onToast("Image saved", "success");
  };

  const handleFieldChange = (type: string, value: string) => {
    const section = localSections.find((s) => s.sectionType === type);
    if (section) {
      if (value === section.contentText) {
        setEditedSections((prev) => {
          const next = { ...prev };
          delete next[section.id];
          return next;
        });
      } else {
        setEditedSections((prev) => ({ ...prev, [section.id]: value }));
      }
      return;
    }
    // No section exists yet — stash in pendingNewByType so we can create
    // the section on save. Clear if value matches the content.* fallback.
    if (value === getContentFallback(type)) {
      setPendingNewByType((prev) => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    } else {
      setPendingNewByType((prev) => ({ ...prev, [type]: value }));
    }
  };

  // Image-bearing sections, grouped for the edit-mode Images panel.
  const slideSections = localSections
    .filter((s) => s.sectionType === "slide")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);
  const frameSections = localSections
    .filter((s) => s.sectionType === "frame")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);
  const sceneSections = localSections
    .filter((s) => s.sectionType === "scene")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);
  const postImageSection = localSections.find((s) => s.sectionType === "post_image");
  const isSingleImage =
    slideSections.length === 0 &&
    frameSections.length === 0 &&
    sceneSections.length === 0;

  // Shared section-persistence. PATCHes existing edits and POSTs any new
  // sections that were previously only in content.* fallbacks. Reconciles
  // localSections so both the modal and the parent stay in sync. Throws
  // on any API error; callers decide how to surface the failure.
  const persistSectionEdits = async () => {
    // 1) Update existing edited sections.
    for (const [id, contentText] of Object.entries(editedSections)) {
      await api(`/api/workspaces/${workspaceId}/library/${item.id}/sections/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ contentText }),
      });
    }
    // 2) Create any sections that didn't exist before (e.g. caption for
    //    older outputs whose data only lived in content.caption).
    const createdSections: Section[] = [];
    for (const [sectionType, contentText] of Object.entries(pendingNewByType)) {
      const res = await api<{ data: Section }>(
        `/api/workspaces/${workspaceId}/library/${item.id}/sections`,
        {
          method: "POST",
          body: JSON.stringify({ sectionType, contentText }),
        },
      );
      const created = (res as any).data ?? res;
      createdSections.push(created);
    }
    const finalSections =
      createdSections.length > 0 ? [...localSections, ...createdSections] : localSections;
    const withEdits = finalSections.map((s) =>
      editedSections[s.id] !== undefined ? { ...s, contentText: editedSections[s.id] } : s,
    );
    if (createdSections.length > 0) {
      setLocalSections(withEdits);
    } else {
      setLocalSections((prev) =>
        prev.map((s) =>
          editedSections[s.id] !== undefined ? { ...s, contentText: editedSections[s.id] } : s,
        ),
      );
    }
    onSectionsUpdated?.(item.id, withEdits);
    setEditedSections({});
    setPendingNewByType({});
  };

  const handleSaveSections = async () => {
    setSavingSections(true);
    try {
      await persistSectionEdits();
      onToast("Changes saved", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
    } finally {
      setSavingSections(false);
    }
  };

  // "Generator context" = modal was opened from the Content Generator
  // (parent passed onSent) AND the output is still in the pre-library
  // "generated" state. The primary button then becomes Save-and-Send.
  const isGeneratorContext = !!onSent && item.status === "generated";

  const handleSaveAndSend = async () => {
    setSavingSections(true);
    try {
      if (isDirty) {
        await persistSectionEdits();
      }
      await api(`/api/workspaces/${workspaceId}/library/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      });
      onSent?.(item.id);
      onClose();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to send", "error");
    } finally {
      setSavingSections(false);
    }
  };

  const PreviewComponent = getPreviewComponent(item.request.contentType);
  const brandName = item.request.brand?.name ?? "Brand";
  const productName = item.request.product?.name;
  const platformLabel = item.request.platform.charAt(0).toUpperCase() + item.request.platform.slice(1);
  const contentTypeLabel = item.request.contentType.replace(/_/g, " ");
  const contentTypeCapitalized = contentTypeLabel.charAt(0).toUpperCase() + contentTypeLabel.slice(1);

  const handleCopyAll = async () => {
    const parts: string[] = [];

    // Collect from sections
    const sectionOrder = ["hook", "caption", "cta", "hashtag"];
    for (const type of sectionOrder) {
      const texts = item.sections
        .filter((s) => s.sectionType === type)
        .sort((a, b) => a.sectionOrder - b.sectionOrder)
        .map((s) => s.contentText);
      if (texts.length > 0) parts.push(texts.join("\n"));
    }

    // Fallback to content fields
    if (parts.length === 0) {
      const c = item.content;
      if (c.hook) parts.push(String(c.hook));
      if (c.headline) parts.push(String(c.headline));
      if (c.caption) parts.push(String(c.caption));
      if (c.body) parts.push(String(c.body));
      if (c.cta) parts.push(String(c.cta));
      if (Array.isArray(c.hashtags)) parts.push((c.hashtags as string[]).join(" "));
    }

    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast("Failed to copy", "error");
    }
  };

  const handleStatusPick = (newStatus: string) => {
    // User picked a value in the dropdown but hasn't confirmed yet.
    // If they re-pick the currently-saved status, treat that as cancelling
    // any pending change (otherwise pendingStatus would stay stale and the
    // dropdown would appear stuck on the previous pick).
    if (newStatus === currentStatus) {
      setPendingStatus(null);
      setStatusNote("");
      return;
    }
    setPendingStatus(newStatus);
    setStatusNote("");
  };

  const handleCancelStatusChange = () => {
    setPendingStatus(null);
    setStatusNote("");
  };

  const handleConfirmStatusChange = async () => {
    if (!pendingStatus) return;
    if (pendingStatus === "rejected" && !statusNote.trim()) return;
    setUpdating(true);
    try {
      const res = await api<{ data: { status: string } }>(
        `/api/workspaces/${workspaceId}/library/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: pendingStatus,
            note: statusNote.trim() || undefined,
          }),
        },
      );
      const updated = (res as any).data ?? res;
      const newStatus = updated.status as string;
      // Prepend an optimistic history entry so the panel shows it immediately.
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          before: { status: currentStatus },
          after: { status: newStatus },
          note: statusNote.trim() || null,
          createdAt: new Date().toISOString(),
          user: null, // name not known client-side; a refresh can fill it
        },
        ...prev,
      ]);
      setCurrentStatus(newStatus);
      onStatusChange(item.id, newStatus);
      setPendingStatus(null);
      setStatusNote("");
      onToast(`Status changed to ${newStatus.replace(/_/g, " ")}`, "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to change status", "error");
    } finally {
      setUpdating(false);
    }
  };

  const isSlider = presentation === "slider";
  const sliderWidthClass = getSliderWidthClass(item.request.contentType);

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        isSlider ? "justify-end" : "items-center justify-center"
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal / Slider */}
      <div
        className={
          isSlider
            ? `relative flex h-full w-full ${sliderWidthClass} flex-col bg-white shadow-2xl`
            : "relative bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col mx-4"
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900 truncate">
              {item.contentTitle ?? "Untitled Content"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {platformLabel} &middot; {contentTypeCapitalized}
            </p>
          </div>
          <div className="flex items-center gap-2 ml-4 shrink-0">
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy All"}
            </button>
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                editMode
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {editMode ? "Editing" : "Edit"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {editMode ? (
            <div className="space-y-4 py-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Copy in Visual (Hook)
                </label>
                <input
                  type="text"
                  value={getSectionText("hook")}
                  onChange={(e) => handleFieldChange("hook", e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                  placeholder="No hook"
                />
              </div>

              {isSingleImage && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                    Visual Direction
                  </label>
                  <textarea
                    value={getSectionText("visual_direction")}
                    onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                    placeholder="No visual direction"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                  Caption
                </label>
                <textarea
                  value={getSectionText("caption")}
                  onChange={(e) => handleFieldChange("caption", e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                  placeholder="No caption"
                />
              </div>

              {/* ─── Images ─── */}
              <div className="pt-2 border-t border-gray-100">
                <div className="flex items-baseline justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Images
                  </label>
                  <span className="text-[10px] text-gray-400">
                    Image edits are saved automatically
                  </span>
                </div>

                {/* Post image — single_image, single_post, feed_post, story_image */}
                {isSingleImage && (
                  <div className="w-48">
                    {postImageSection ? (
                      <SectionImageCell
                        sectionId={postImageSection.id}
                        imageUrl={getJsonField(
                          postImageSection.id,
                          postImageSection.contentText,
                          "referenceImageUrl",
                        )}
                        label="Post Image"
                        workspaceId={workspaceId}
                        outputId={item.id}
                        onSectionUpdated={applySectionUpdate}
                        onError={(m) => onToast(m, "error")}
                        aspectRatio="1/1"
                      />
                    ) : (
                      <PostImageGenerator
                        workspaceId={workspaceId}
                        outputId={item.id}
                        onSectionCreated={(section) => {
                          setLocalSections((prev) => {
                            const next = [...prev, section];
                            onSectionsUpdated?.(item.id, next);
                            return next;
                          });
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Slides — carousel, carousel_post, carousel_ad, tiktok_carousel, thread */}
                {slideSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Slides ({slideSections.length})
                    </label>
                    {slideSections.map((slide) => {
                      const num = getJsonField(slide.id, slide.contentText, "slideNumber");
                      const url = getJsonField(slide.id, slide.contentText, "referenceImageUrl");
                      return (
                        <div key={slide.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-32 shrink-0">
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase mb-1">
                              Slide {num}
                            </p>
                            <SectionImageCell
                              sectionId={slide.id}
                              imageUrl={url}
                              label={`Slide ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="1/1"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Headline</label>
                              <input
                                type="text"
                                value={getJsonField(slide.id, slide.contentText, "headline")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "headline", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Body</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "body")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "body", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "visualDirection")}
                                onChange={(e) =>
                                  handleJsonFieldChange(slide.id, slide.contentText, "visualDirection", e.target.value)
                                }
                                rows={1}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Frames — story_image, story_video, facebook story */}
                {frameSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Frames ({frameSections.length})
                    </label>
                    {frameSections.map((frame) => {
                      const num = getJsonField(frame.id, frame.contentText, "frameNumber");
                      const url = getJsonField(frame.id, frame.contentText, "referenceImageUrl");
                      return (
                        <div key={frame.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-28 shrink-0">
                            <p className="text-[10px] font-semibold text-purple-500 uppercase mb-1">
                              Frame {num}
                            </p>
                            <SectionImageCell
                              sectionId={frame.id}
                              imageUrl={url}
                              label={`Frame ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="9/16"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual</label>
                              <textarea
                                value={getJsonField(frame.id, frame.contentText, "visual")}
                                onChange={(e) =>
                                  handleJsonFieldChange(frame.id, frame.contentText, "visual", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Text Overlay</label>
                              <input
                                type="text"
                                value={getJsonField(frame.id, frame.contentText, "textOverlay")}
                                onChange={(e) =>
                                  handleJsonFieldChange(frame.id, frame.contentText, "textOverlay", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Scenes — all video content types */}
                {sceneSections.length > 0 && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Scenes ({sceneSections.length})
                    </label>
                    {sceneSections.map((scene) => {
                      const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
                      const url = getJsonField(scene.id, scene.contentText, "referenceImageUrl");
                      return (
                        <div key={scene.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="w-40 shrink-0">
                            <p className="text-[10px] font-semibold text-red-500 uppercase mb-1">
                              Scene {num}
                            </p>
                            <SectionImageCell
                              sectionId={scene.id}
                              imageUrl={url}
                              label={`Scene ${num}`}
                              workspaceId={workspaceId}
                              outputId={item.id}
                              onSectionUpdated={applySectionUpdate}
                              onError={(m) => onToast(m, "error")}
                              aspectRatio="16/9"
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Time Range</label>
                              <input
                                type="text"
                                value={getJsonField(scene.id, scene.contentText, "timeRange")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "timeRange", e.target.value)
                                }
                                placeholder="00:00 – 00:03"
                                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "visualDirection")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "visualDirection", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Voiceover</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "voiceover")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "voiceover", e.target.value)
                                }
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">On-Screen Text</label>
                              <input
                                type="text"
                                value={getJsonField(scene.id, scene.contentText, "onScreenText")}
                                onChange={(e) =>
                                  handleJsonFieldChange(scene.id, scene.contentText, "onScreenText", e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={isGeneratorContext ? handleSaveAndSend : handleSaveSections}
                disabled={savingSections || (!isGeneratorContext && !isDirty)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isGeneratorContext
                    ? "bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                    : isDirty
                      ? "bg-indigo-600 text-white hover:bg-indigo-700"
                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {savingSections
                  ? isGeneratorContext
                    ? "Sending..."
                    : "Saving..."
                  : isGeneratorContext
                    ? isDirty
                      ? "Save & Send to Library"
                      : "Send to Library"
                    : "Save Changes"}
              </button>
            </div>
          ) : (
            <PreviewComponent
              content={item.content}
              sections={localSections}
              brandName={brandName}
              productName={productName ?? undefined}
              contentTitle={item.contentTitle ?? undefined}
              contentType={item.request.contentType}
              platform={item.request.platform}
            />
          )}
        </div>

        {!isGeneratorContext && (
          <>
            {/* Footer — Status (editable only for approvers) */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-3 px-5 py-4 border-t border-gray-100 shrink-0">
              <span className="text-xs font-medium text-gray-500">Status:</span>
              {canChangeStatus ? (
                <div className="relative">
                  <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                    (pendingStatus ?? currentStatus) === "approved" ? "bg-green-500" :
                    (pendingStatus ?? currentStatus) === "rejected" ? "bg-red-500" :
                    (pendingStatus ?? currentStatus) === "in_review" ? "bg-amber-500" : "bg-gray-400"
                  }`} />
                  <select
                    value={pendingStatus ?? currentStatus}
                    disabled={updating}
                    onChange={(e) => handleStatusPick(e.target.value)}
                    className={`appearance-none pl-6 pr-8 py-1.5 text-xs font-medium border rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 capitalize ${getStatusStyle(pendingStatus ?? currentStatus)}`}
                  >
                    <option value="approved">Approved</option>
                    <option value="in_review">In Review</option>
                    <option value="draft">Draft</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              ) : (
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border capitalize ${getStatusStyle(currentStatus)}`}
                  title="Only approvers can change status"
                >
                  {currentStatus.replace(/_/g, " ")}
                </span>
              )}
              {pendingStatus && (
                <div className="flex w-full flex-wrap items-stretch gap-2">
                  <textarea
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                    placeholder={
                      pendingStatus === "rejected"
                        ? "Note (required) — why are you rejecting?"
                        : "Note (optional)"
                    }
                    className="min-w-0 flex-1 basis-full px-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none sm:basis-auto"
                  />
                  <button
                    type="button"
                    onClick={handleCancelStatusChange}
                    disabled={updating}
                    className="px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmStatusChange}
                    disabled={
                      updating ||
                      (pendingStatus === "rejected" && !statusNote.trim())
                    }
                    className="px-2.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    {updating ? "Saving..." : "Confirm"}
                  </button>
                </div>
              )}
            </div>
            {canChangeStatus && history.length > 0 && (
              <div className="border-t border-gray-100 px-5 py-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900"
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${historyOpen ? "rotate-90" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  History ({history.length})
                </button>
                {historyOpen && (
                  <ol className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {history.map((h) => {
                      const oldS = (h.before as any)?.status ?? "—";
                      const newS = (h.after as any)?.status ?? "—";
                      const who = h.user?.fullName || h.user?.email || "Someone";
                      return (
                        <li key={h.id} className="text-xs">
                          <div className="text-gray-700">
                            <span className="font-medium">{who}</span>
                            <span className="text-gray-400"> · </span>
                            <span className="capitalize">{oldS.replace(/_/g, " ")}</span>
                            <span className="text-gray-400"> → </span>
                            <span className="capitalize">{newS.replace(/_/g, " ")}</span>
                            <span className="text-gray-400"> · </span>
                            <span className="text-gray-500">
                              {new Date(h.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {h.note ? (
                            <p className="mt-0.5 pl-2 border-l-2 border-gray-200 text-gray-600">
                              "{h.note}"
                            </p>
                          ) : (
                            <p className="mt-0.5 pl-2 text-gray-400 italic">(no note)</p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
