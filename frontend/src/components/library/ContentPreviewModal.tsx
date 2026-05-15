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
  canChangeStatus = true,
  onSent,
}: ContentPreviewModalProps) {
  const [currentStatus, setCurrentStatus] = useState(item.status);
  const [copied, setCopied] = useState(false);
  const [updating, setUpdating] = useState(false);
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
      setHistory((prev) => [
        {
          id: crypto.randomUUID(),
          before: { status: currentStatus },
          after: { status: newStatus },
          note: statusNote.trim() || null,
          createdAt: new Date().toISOString(),
          user: null,
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex h-full w-[50vw] flex-col bg-surface shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-surface shrink-0">
          <h2 className="text-sm font-semibold text-foreground">Content Details</h2>
          <div className="flex items-center gap-2 shrink-0">
            {/* Status — shown in header for non-generator context */}
            {!isGeneratorContext && (
              <div className="relative">
                <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full ${
                  (pendingStatus ?? currentStatus) === "approved" ? "bg-green-500" :
                  (pendingStatus ?? currentStatus) === "rejected" ? "bg-red-500" :
                  (pendingStatus ?? currentStatus) === "in_review" ? "bg-amber-500" : "bg-border"
                }`} />
                {canChangeStatus ? (
                  <>
                    <select
                      value={pendingStatus ?? currentStatus}
                      disabled={updating}
                      onChange={(e) => handleStatusPick(e.target.value)}
                      className={`appearance-none pl-6 pr-7 py-1.5 text-xs font-medium border rounded-[--radius] cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent capitalize ${getStatusStyle(pendingStatus ?? currentStatus)}`}
                    >
                      <option value="approved">Approved</option>
                      <option value="in_review">In Review</option>
                      <option value="draft">Draft</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-current opacity-60 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </>
                ) : (
                  <span
                    className={`inline-flex items-center pl-6 pr-3 py-1.5 rounded-[--radius] text-xs font-medium border capitalize ${getStatusStyle(currentStatus)}`}
                    title="Only approvers can change status"
                  >
                    {currentStatus.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleCopyAll}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted bg-surface border border-border rounded-[--radius] hover:bg-surface-secondary hover:text-foreground transition-colors"
            >
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              {copied ? "Copied!" : "Copy All"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted hover:bg-surface-secondary hover:text-foreground transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Pending-status confirmation strip — shown below header when a status change is pending */}
        {!isGeneratorContext && pendingStatus && (
          <div className="flex flex-wrap items-stretch gap-2 px-6 py-3 border-b border-border bg-surface-secondary shrink-0">
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={1}
              placeholder={
                pendingStatus === "rejected"
                  ? "Note (required) — why are you rejecting?"
                  : "Note (optional)"
              }
              className="min-w-0 flex-1 px-2 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none"
            />
            <button
              type="button"
              onClick={handleCancelStatusChange}
              disabled={updating}
              className="px-2.5 py-1.5 text-xs font-medium text-muted bg-surface border border-border rounded-[--radius] hover:bg-surface-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmStatusChange}
              disabled={updating || (pendingStatus === "rejected" && !statusNote.trim())}
              className="px-2.5 py-1.5 text-xs font-medium bg-foreground text-background rounded-[--radius] hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {updating ? "Saving..." : "Confirm"}
            </button>
          </div>
        )}

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">
          {/* Left — editable fields */}
          <div className="w-1/2 shrink-0 border-r border-border overflow-y-auto px-6 py-5 space-y-4">
            {/* Content title / platform / type */}
            <div>
              <p className="text-sm font-semibold text-foreground break-words">
                {item.contentTitle ?? "Untitled Content"}
              </p>
              <p className="text-xs text-muted mt-0.5">
                {platformLabel} &middot; {contentTypeCapitalized}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Copy in Visual (Hook)
              </label>
              <textarea
                value={getSectionText("hook")}
                onChange={(e) => handleFieldChange("hook", e.target.value)}
                rows={1}
                className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none field-sizing-content"
                placeholder="No hook"
              />
            </div>

            {isSingleImage && (
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                  Visual Direction
                </label>
                <textarea
                  value={getSectionText("visual_direction")}
                  onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none field-sizing-content"
                  placeholder="No visual direction"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
                Caption
              </label>
              <textarea
                value={getSectionText("caption")}
                onChange={(e) => handleFieldChange("caption", e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none field-sizing-content"
                placeholder="No caption"
              />
            </div>

            {/* ─── Images ─── */}
            <div className="mt-2 pt-5 border-t border-border space-y-3">
              <div className="flex items-baseline justify-between">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide">
                  Images
                </label>
                <span className="text-[10px] text-muted">
                  Saved automatically
                </span>
              </div>

              {isSingleImage && (
                <div className="w-40">
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
                      square
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

              {slideSections.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-medium text-muted uppercase tracking-wide">
                    Slides ({slideSections.length})
                  </label>
                  {slideSections.map((slide) => {
                    const num = getJsonField(slide.id, slide.contentText, "slideNumber");
                    const url = getJsonField(slide.id, slide.contentText, "referenceImageUrl");
                    return (
                      <div key={slide.id} className="bg-surface border border-border rounded-[--radius] p-3 flex gap-3">
                        <div className="w-24 shrink-0">
                          <p className="text-[10px] font-semibold text-accent uppercase mb-1">
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
                            square
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Headline</label>
                            <textarea
                              value={getJsonField(slide.id, slide.contentText, "headline")}
                              onChange={(e) =>
                                handleJsonFieldChange(slide.id, slide.contentText, "headline", e.target.value)
                              }
                              rows={1}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Body</label>
                            <textarea
                              value={getJsonField(slide.id, slide.contentText, "body")}
                              onChange={(e) =>
                                handleJsonFieldChange(slide.id, slide.contentText, "body", e.target.value)
                              }
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Visual Direction</label>
                            <textarea
                              value={getJsonField(slide.id, slide.contentText, "visualDirection")}
                              onChange={(e) =>
                                handleJsonFieldChange(slide.id, slide.contentText, "visualDirection", e.target.value)
                              }
                              rows={1}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {frameSections.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-medium text-muted uppercase tracking-wide">
                    Frames ({frameSections.length})
                  </label>
                  {frameSections.map((frame) => {
                    const num = getJsonField(frame.id, frame.contentText, "frameNumber");
                    const url = getJsonField(frame.id, frame.contentText, "referenceImageUrl");
                    return (
                      <div key={frame.id} className="bg-surface border border-border rounded-[--radius] p-3 flex gap-3">
                        <div className="w-20 shrink-0">
                          <p className="text-[10px] font-semibold text-accent uppercase mb-1">
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
                            square
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Visual</label>
                            <textarea
                              value={getJsonField(frame.id, frame.contentText, "visual")}
                              onChange={(e) =>
                                handleJsonFieldChange(frame.id, frame.contentText, "visual", e.target.value)
                              }
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Text Overlay</label>
                            <textarea
                              value={getJsonField(frame.id, frame.contentText, "textOverlay")}
                              onChange={(e) =>
                                handleJsonFieldChange(frame.id, frame.contentText, "textOverlay", e.target.value)
                              }
                              rows={1}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {sceneSections.length > 0 && (
                <div className="space-y-3">
                  <label className="block text-[10px] font-medium text-muted uppercase tracking-wide">
                    Scenes ({sceneSections.length})
                  </label>
                  {sceneSections.map((scene) => {
                    const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
                    const url = getJsonField(scene.id, scene.contentText, "referenceImageUrl");
                    return (
                      <div key={scene.id} className="bg-surface border border-border rounded-[--radius] p-3 flex gap-3">
                        <div className="w-32 shrink-0">
                          <p className="text-[10px] font-semibold text-accent uppercase mb-1">
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
                            square
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Time Range</label>
                            <textarea
                              value={getJsonField(scene.id, scene.contentText, "timeRange")}
                              onChange={(e) =>
                                handleJsonFieldChange(scene.id, scene.contentText, "timeRange", e.target.value)
                              }
                              rows={1}
                              placeholder="00:00 – 00:03"
                              className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Visual Direction</label>
                            <textarea
                              value={getJsonField(scene.id, scene.contentText, "visualDirection")}
                              onChange={(e) =>
                                handleJsonFieldChange(scene.id, scene.contentText, "visualDirection", e.target.value)
                              }
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">Voiceover</label>
                            <textarea
                              value={getJsonField(scene.id, scene.contentText, "voiceover")}
                              onChange={(e) =>
                                handleJsonFieldChange(scene.id, scene.contentText, "voiceover", e.target.value)
                              }
                              rows={2}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-muted mb-0.5">On-Screen Text</label>
                            <textarea
                              value={getJsonField(scene.id, scene.contentText, "onScreenText")}
                              onChange={(e) =>
                                handleJsonFieldChange(scene.id, scene.contentText, "onScreenText", e.target.value)
                              }
                              rows={1}
                              className="w-full px-2.5 py-1.5 text-xs bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent resize-none field-sizing-content"
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
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-[--radius] transition-colors ${
                isGeneratorContext
                  ? "bg-warning text-warning-foreground hover:bg-warning/90 disabled:opacity-50 disabled:cursor-not-allowed"
                  : isDirty
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-surface-secondary text-muted cursor-not-allowed"
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

            {/* History — below save button */}
            {!isGeneratorContext && canChangeStatus && history.length > 0 && (
              <div className="pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground"
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
                  <ol className="mt-2 space-y-2">
                    {history.map((h) => {
                      const oldS = (h.before as any)?.status ?? "—";
                      const newS = (h.after as any)?.status ?? "—";
                      const who = h.user?.fullName || h.user?.email || "Someone";
                      return (
                        <li key={h.id} className="text-xs">
                          <div className="text-foreground">
                            <span className="font-medium">{who}</span>
                            <span className="text-muted"> · </span>
                            <span className="capitalize">{oldS.replace(/_/g, " ")}</span>
                            <span className="text-muted"> → </span>
                            <span className="capitalize">{newS.replace(/_/g, " ")}</span>
                            <span className="text-muted"> · </span>
                            <span className="text-muted">
                              {new Date(h.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {h.note ? (
                            <p className="mt-0.5 pl-2 border-l-2 border-border text-foreground">
                              "{h.note}"
                            </p>
                          ) : (
                            <p className="mt-0.5 pl-2 text-muted italic">(no note)</p>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>

          {/* Right — live preview */}
          <div className="w-1/2 overflow-y-auto bg-surface-secondary px-5 py-4">
            <PreviewComponent
              content={item.content}
              sections={localSections}
              brandName={brandName}
              productName={productName ?? undefined}
              contentTitle={item.contentTitle ?? undefined}
              contentType={item.request.contentType}
              platform={item.request.platform}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
