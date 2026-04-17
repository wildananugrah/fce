import { useState } from "react";
import { ChevronRight, ChevronDown, Eye, Check, X, Save, Loader2, Trash2 } from "lucide-react";
import { api } from "../../services/api";
import { isVideoContentType } from "../../config/video-content-types";
import { VisualScriptTable } from "./VisualScriptTable";
import { SectionImageCell, PostImageGenerator } from "./SectionImageCell";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

interface Generation {
  id: string;
  status: string;
  platform: string;
  contentType: string;
  createdAt: string;
  brand?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
}

interface GenerationResultRowProps {
  generation: Generation;
  workspaceId: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onApproved: (id: string) => void;
  onRejected: (id: string) => void;
  onDeleted: (id: string) => void;
  onViewFull: (generation: Generation) => void;
  getPlatformStyle: (platform: string) => { bg: string; text: string };
  getStatusStyle: (status: string) => string;
  getStatusDot: (status: string) => string;
  formatRelativeDate: (date: string) => string;
}

export function GenerationResultRow({
  generation,
  workspaceId,
  selected,
  onSelect,
  onApproved,
  onRejected,
  onDeleted,
  onViewFull,
  getPlatformStyle,
  getStatusStyle,
  getStatusDot,
  formatRelativeDate,
}: GenerationResultRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [editedSections, setEditedSections] = useState<Record<string, string>>({});
  const [outputId, setOutputId] = useState<string | null>(null);

  const isDirty = Object.keys(editedSections).length > 0;

  const fetchSections = async () => {
    if (sections !== null) return;
    setLoading(true);
    try {
      const res = await api<{
        data: {
          outputs: Array<{
            id: string;
            sections: Section[];
          }>;
        };
      }>(`/api/workspaces/${workspaceId}/generations/${generation.id}`);
      const data = (res as any).data ?? res;
      const output = data.outputs?.[0];
      if (output) {
        setOutputId(output.id);
        setSections(output.sections ?? []);
      } else {
        setSections([]);
      }
    } catch {
      setSections([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = () => {
    if (!expanded) {
      fetchSections();
    }
    setExpanded(!expanded);
  };

  const getSectionText = (type: string): string => {
    if (!sections) return "";
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return "";
    return editedSections[section.id] ?? section.contentText;
  };

  const getSectionsByType = (type: string) => {
    if (!sections) return [];
    return sections.filter((s) => s.sectionType === type).sort((a, b) => a.sectionOrder - b.sectionOrder);
  };

  const getJsonField = (sectionId: string, contentText: string, field: string): string => {
    try {
      const edited = editedSections[sectionId];
      const data = JSON.parse(edited ?? contentText);
      return data[field] ?? "";
    } catch {
      return "";
    }
  };

  const handleJsonFieldChange = (sectionId: string, contentText: string, field: string, value: string) => {
    try {
      const current = editedSections[sectionId] ?? contentText;
      const data = JSON.parse(current);
      data[field] = value;
      const newText = JSON.stringify(data);
      if (newText === contentText) {
        setEditedSections((prev) => {
          const next = { ...prev };
          delete next[sectionId];
          return next;
        });
      } else {
        setEditedSections((prev) => ({ ...prev, [sectionId]: newText }));
      }
    } catch {
      // ignore parse errors
    }
  };

  const handleFieldChange = (type: string, value: string) => {
    if (!sections) return;
    const section = sections.find((s) => s.sectionType === type);
    if (!section) return;
    if (value === section.contentText) {
      setEditedSections((prev) => {
        const next = { ...prev };
        delete next[section.id];
        return next;
      });
    } else {
      setEditedSections((prev) => ({ ...prev, [section.id]: value }));
    }
  };

  const hasTopLevelFields = sections ? sections.some((s) => ["hook", "caption", "visual_direction"].includes(s.sectionType)) : false;
  const slides = getSectionsByType("slide");
  const scenes = getSectionsByType("scene");
  const frames = getSectionsByType("frame");
  const postImage = sections?.find((s) => s.sectionType === "post_image") ?? null;

  // Helper used by SectionImageCell to patch a section's JSON in place after
  // image generation. Clears any pending local edit for that section since
  // the server already rewrote the contentText.
  const applySectionUpdate = (sectionId: string, contentText: string) => {
    setSections((prev) =>
      prev ? prev.map((s) => (s.id === sectionId ? { ...s, contentText } : s)) : prev,
    );
    setEditedSections((prev) => {
      const next = { ...prev };
      delete next[sectionId];
      return next;
    });
  };

  const handleSave = async () => {
    if (!outputId || !isDirty) return;
    setSaving(true);
    try {
      const updates = Object.entries(editedSections).map(([id, contentText]) => ({
        id,
        contentText,
      }));
      await api(`/api/workspaces/${workspaceId}/library/${outputId}/sections/bulk`, {
        method: "PATCH",
        body: JSON.stringify({ sections: updates }),
      });
      setSections((prev) =>
        prev
          ? prev.map((s) =>
              editedSections[s.id] !== undefined
                ? { ...s, contentText: editedSections[s.id] }
                : s
            )
          : prev
      );
      setEditedSections({});
    } catch {
      // silently fail — user can retry
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!outputId) return;
    setStatusUpdating(true);
    try {
      // "approved" in Content Generator means "send to library for review"
      // Sets status to "in_review" so Library shows it as a draft for Stage 2 approval
      const actualStatus = newStatus === "approved" ? "in_review" : newStatus;
      await api(`/api/workspaces/${workspaceId}/library/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: actualStatus }),
      });
      if (newStatus === "approved") {
        onApproved(generation.id);
      } else if (newStatus === "rejected") {
        onRejected(generation.id);
      }
    } catch (e) {
      console.error("Failed to update generation status", e);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api(`/api/workspaces/${workspaceId}/generations/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids: [generation.id] }),
      });
      onDeleted(generation.id);
    } catch {
      // silently fail
    }
  };

  const ps = getPlatformStyle(generation.platform);

  return (
    <>
      {/* Main row */}
      <tr
        className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
        onClick={handleToggle}
      >
        {onSelect && (
          <td className="w-10 px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={() => onSelect(generation.id)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
          </td>
        )}
        <td className="px-4 py-2.5 w-8">
          {expanded ? (
            <ChevronDown size={14} className="text-gray-400" />
          ) : (
            <ChevronRight size={14} className="text-gray-400" />
          )}
        </td>
        <td className="px-4 py-2.5">
          <p className="text-sm text-gray-800">{generation.brand?.name ?? "—"}</p>
          {generation.product?.name && (
            <p className="text-xs text-gray-400">{generation.product.name}</p>
          )}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${ps.bg} ${ps.text}`}
          >
            {generation.platform}
          </span>
        </td>
        <td className="px-4 py-2.5 text-sm text-gray-700 capitalize">
          {generation.contentType?.replace(/_/g, " ")}
        </td>
        <td className="px-4 py-2.5">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusStyle(generation.status)}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(generation.status)}`} />
            {generation.status}
          </span>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatRelativeDate(generation.createdAt)}
          </p>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {generation.status === "completed" && (
              <>
                <button
                  type="button"
                  onClick={() => onViewFull(generation)}
                  className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-md hover:bg-indigo-50"
                  title="View full preview"
                >
                  <Eye size={14} />
                </button>
                {outputId && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("approved")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-md hover:bg-green-50"
                      title="Approve — move to library"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange("rejected")}
                      disabled={statusUpdating}
                      className="p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50"
                      title="Reject"
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded content */}
      {expanded && (
        <tr>
          <td colSpan={onSelect ? 7 : 6} className="px-4 py-4 bg-gray-50/50">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={18} className="animate-spin text-gray-400" />
              </div>
            ) : sections && sections.length > 0 ? (
              <div className="space-y-3">
                {/* ─── Single-format fields (hook, visual direction, caption) ─── */}
                {hasTopLevelFields && (
                  <div className="max-w-2xl space-y-3">
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Copy in Visual (Hook)
                      </label>
                      <input
                        type="text"
                        value={getSectionText("hook")}
                        onChange={(e) => handleFieldChange("hook", e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                        placeholder="No hook generated"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Visual Direction
                      </label>
                      <textarea
                        value={getSectionText("visual_direction")}
                        onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                        placeholder="No visual direction generated"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                        Caption
                      </label>
                      <textarea
                        value={getSectionText("caption")}
                        onChange={(e) => handleFieldChange("caption", e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-none"
                        placeholder="No caption generated"
                      />
                    </div>
                  </div>
                )}

                {/* ─── Slides (carousel, thread, carousel_post, etc.) ─── */}
                {slides.length > 0 && outputId && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Slides ({slides.length})
                    </label>
                    {slides.map((slide) => {
                      const num = getJsonField(slide.id, slide.contentText, "slideNumber");
                      const imageUrl = getJsonField(slide.id, slide.contentText, "referenceImageUrl");
                      return (
                        <div key={slide.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="flex-1 space-y-2">
                            <p className="text-[10px] font-semibold text-indigo-500 uppercase">Slide {num}</p>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Headline</label>
                              <input
                                type="text"
                                value={getJsonField(slide.id, slide.contentText, "headline")}
                                onChange={(e) => handleJsonFieldChange(slide.id, slide.contentText, "headline", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Body</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "body")}
                                onChange={(e) => handleJsonFieldChange(slide.id, slide.contentText, "body", e.target.value)}
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(slide.id, slide.contentText, "visualDirection")}
                                onChange={(e) => handleJsonFieldChange(slide.id, slide.contentText, "visualDirection", e.target.value)}
                                rows={1}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                          </div>
                          <div className="w-32 shrink-0">
                            <SectionImageCell
                              sectionId={slide.id}
                              imageUrl={imageUrl}
                              label={`Slide ${num}`}
                              workspaceId={workspaceId}
                              outputId={outputId}
                              onSectionUpdated={applySectionUpdate}
                              onError={() => {}}
                              aspectRatio="1/1"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── Scenes (reels, video, shorts, etc.) ─── */}
                {scenes.length > 0 && outputId &&
                  (isVideoContentType(generation.contentType) ? (
                    <VisualScriptTable
                      scenes={scenes}
                      workspaceId={workspaceId}
                      outputId={outputId}
                      getJsonField={getJsonField}
                      onJsonFieldChange={handleJsonFieldChange}
                      onSectionUpdated={(sectionId, contentText) => {
                        setSections((prev) =>
                          prev
                            ? prev.map((s) =>
                                s.id === sectionId ? { ...s, contentText } : s,
                              )
                            : prev,
                        );
                        // Clear any pending edit for this section since the
                        // server just overwrote it with the new image URL.
                        setEditedSections((prev) => {
                          const next = { ...prev };
                          delete next[sectionId];
                          return next;
                        });
                      }}
                      onError={() => {
                        /* errors surface via inline button state */
                      }}
                    />
                  ) : (
                    <div className="space-y-3">
                      <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                        Scenes ({scenes.length})
                      </label>
                      {scenes.map((scene) => {
                        const num = getJsonField(scene.id, scene.contentText, "sceneNumber");
                        return (
                          <div key={scene.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
                            <p className="text-[10px] font-semibold text-red-500 uppercase">Scene {num}</p>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual Direction</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "visualDirection")}
                                onChange={(e) => handleJsonFieldChange(scene.id, scene.contentText, "visualDirection", e.target.value)}
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Voiceover</label>
                              <textarea
                                value={getJsonField(scene.id, scene.contentText, "voiceover")}
                                onChange={(e) => handleJsonFieldChange(scene.id, scene.contentText, "voiceover", e.target.value)}
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">On-Screen Text</label>
                              <input
                                type="text"
                                value={getJsonField(scene.id, scene.contentText, "onScreenText")}
                                onChange={(e) => handleJsonFieldChange(scene.id, scene.contentText, "onScreenText", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}

                {/* ─── Frames (story, story_image, story_video) ─── */}
                {frames.length > 0 && outputId && (
                  <div className="space-y-3">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                      Frames ({frames.length})
                    </label>
                    {frames.map((frame) => {
                      const num = getJsonField(frame.id, frame.contentText, "frameNumber");
                      const imageUrl = getJsonField(frame.id, frame.contentText, "referenceImageUrl");
                      return (
                        <div key={frame.id} className="bg-white border border-gray-200 rounded-lg p-3 flex gap-3">
                          <div className="flex-1 space-y-2">
                            <p className="text-[10px] font-semibold text-purple-500 uppercase">Frame {num}</p>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Visual</label>
                              <textarea
                                value={getJsonField(frame.id, frame.contentText, "visual")}
                                onChange={(e) => handleJsonFieldChange(frame.id, frame.contentText, "visual", e.target.value)}
                                rows={2}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400 resize-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-gray-400 mb-0.5">Text Overlay</label>
                              <input
                                type="text"
                                value={getJsonField(frame.id, frame.contentText, "textOverlay")}
                                onChange={(e) => handleJsonFieldChange(frame.id, frame.contentText, "textOverlay", e.target.value)}
                                className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:border-indigo-400"
                              />
                            </div>
                          </div>
                          <div className="w-28 shrink-0">
                            <SectionImageCell
                              sectionId={frame.id}
                              imageUrl={imageUrl}
                              label={`Frame ${num}`}
                              workspaceId={workspaceId}
                              outputId={outputId}
                              onSectionUpdated={applySectionUpdate}
                              onError={() => {}}
                              aspectRatio="9/16"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ─── Post image (single_image, single_post, feed_post, story_image) ─── */}
                {outputId && slides.length === 0 && frames.length === 0 && scenes.length === 0 && (
                  <div className="max-w-2xl">
                    <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Post Image
                    </label>
                    <div className="bg-white border border-gray-200 rounded-lg p-3">
                      <div className="w-64">
                        {postImage ? (
                          <SectionImageCell
                            sectionId={postImage.id}
                            imageUrl={getJsonField(postImage.id, postImage.contentText, "referenceImageUrl")}
                            label="Post Image"
                            workspaceId={workspaceId}
                            outputId={outputId}
                            onSectionUpdated={applySectionUpdate}
                            onError={() => {}}
                            aspectRatio="1/1"
                          />
                        ) : (
                          <PostImageGenerator
                            workspaceId={workspaceId}
                            outputId={outputId}
                            onSectionCreated={(section) => {
                              setSections((prev) => (prev ? [...prev, section] : [section]));
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── Save button ─── */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!isDirty || saving}
                    className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      isDirty
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {saving ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Save size={12} />
                    )}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  View token usage details on the Settings page.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                No content sections available. Content may still be processing.
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
