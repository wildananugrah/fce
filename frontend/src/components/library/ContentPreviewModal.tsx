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
}

function getStatusStyle(status: string) {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

export function ContentPreviewModal({
  item,
  workspaceId,
  onClose,
  onStatusChange,
  onToast,
  onSectionsUpdated,
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

  useEffect(() => {
    setLocalSections(item.sections);
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

  const getJsonField = (_sectionId: string, contentText: string, field: string): string => {
    try {
      const data = JSON.parse(contentText);
      return (data[field] as string) ?? "";
    } catch {
      return "";
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

  const handleSaveSections = async () => {
    setSavingSections(true);
    try {
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
      onToast("Changes saved", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save", "error");
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

  const handleStatusChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setUpdating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/library/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setCurrentStatus(newStatus);
      onStatusChange(item.id, newStatus);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update status", "error");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
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
                  <div className="grid grid-cols-3 gap-3">
                    {slideSections.map((slide) => {
                      const num = getJsonField(slide.id, slide.contentText, "slideNumber");
                      const url = getJsonField(slide.id, slide.contentText, "referenceImageUrl");
                      return (
                        <div key={slide.id}>
                          <p className="text-[10px] font-medium text-indigo-500 uppercase mb-1">
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
                      );
                    })}
                  </div>
                )}

                {/* Frames — story_image, story_video, facebook story */}
                {frameSections.length > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    {frameSections.map((frame) => {
                      const num = getJsonField(frame.id, frame.contentText, "frameNumber");
                      const url = getJsonField(frame.id, frame.contentText, "referenceImageUrl");
                      return (
                        <div key={frame.id}>
                          <p className="text-[10px] font-medium text-purple-500 uppercase mb-1">
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
                      );
                    })}
                  </div>
                )}

                {/* Scenes — all video content types */}
                {sceneSections.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    {sceneSections.map((scene) => {
                      const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
                      const url = getJsonField(scene.id, scene.contentText, "referenceImageUrl");
                      return (
                        <div key={scene.id}>
                          <p className="text-[10px] font-medium text-red-500 uppercase mb-1">
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
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveSections}
                disabled={!isDirty || savingSections}
                className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  isDirty
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {savingSections ? "Saving..." : "Save Changes"}
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

        {/* Footer — Status dropdown */}
        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 shrink-0">
          <span className="text-xs font-medium text-gray-500">Status:</span>
          <div className="relative">
            <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
              currentStatus === "approved" ? "bg-green-500" :
              currentStatus === "rejected" ? "bg-red-500" :
              currentStatus === "in_review" ? "bg-amber-500" : "bg-gray-400"
            }`} />
            <select
              value={currentStatus}
              disabled={updating}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`appearance-none pl-6 pr-8 py-1.5 text-xs font-medium border rounded-lg cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 capitalize ${getStatusStyle(currentStatus)}`}
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
        </div>
      </div>
    </div>
  );
}
