import { useState } from "react";
import { X } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

// Scene data as it comes out of the content generator — may come either from
// the per-section JSON (authoritative after the user has generated images and
// edited fields) or from the original `content.scenes` array.
export interface SceneLike {
  sceneNumber?: number | string;
  timeRange?: string;
  visualDirection?: string;
  voiceover?: string;
  onScreenText?: string;
  visualReference?: string;
  referenceImageUrl?: string;
}

// Convenience: safely parse a section's JSON contentText.
function parseSectionJson(contentText: string): Record<string, unknown> {
  try {
    const data = JSON.parse(contentText);
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Returns the single post-level reference image (for single_image, feed_post,
// single_post, story_image, etc.), or an empty string if none.
export function extractPostImage(sections: PreviewProps["sections"]): string {
  const section = sections.find((s) => s.sectionType === "post_image");
  if (!section) return "";
  const data = parseSectionJson(section.contentText);
  return (data.referenceImageUrl as string) || "";
}

// Returns per-slide data (headline, body, visualDirection, referenceImageUrl),
// reading from slide sections first and falling back to content.slides.
export interface SlideLike {
  slideNumber?: number | string;
  headline?: string;
  body?: string;
  visualDirection?: string;
  referenceImageUrl?: string;
}

export function extractSlides(
  sections: PreviewProps["sections"],
  content: Record<string, unknown>,
): SlideLike[] {
  const slideSections = sections
    .filter((s) => s.sectionType === "slide")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);
  if (slideSections.length > 0) {
    return slideSections.map((s) => parseSectionJson(s.contentText) as SlideLike);
  }
  if (Array.isArray(content.slides)) {
    return content.slides as SlideLike[];
  }
  return [];
}

// Frames (story_image / story_video / facebook story) — similar shape to slides.
export interface FrameLike {
  frameNumber?: number | string;
  visual?: string;
  textOverlay?: string;
  referenceImageUrl?: string;
}

export function extractFrames(
  sections: PreviewProps["sections"],
  content: Record<string, unknown>,
): FrameLike[] {
  const frameSections = sections
    .filter((s) => s.sectionType === "frame")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);
  if (frameSections.length > 0) {
    return frameSections.map((s) => parseSectionJson(s.contentText) as FrameLike);
  }
  if (Array.isArray(content.frames)) {
    return content.frames as FrameLike[];
  }
  return [];
}

// Scene sections store their fields as a JSON string in contentText. Parse
// them first, then fall back to content.scenes if no sections exist yet.
export function extractScenes(
  sections: PreviewProps["sections"],
  content: Record<string, unknown>,
): SceneLike[] {
  const sceneSections = sections
    .filter((s) => s.sectionType === "scene")
    .sort((a, b) => a.sectionOrder - b.sectionOrder);

  if (sceneSections.length > 0) {
    return sceneSections.map((s) => {
      try {
        return JSON.parse(s.contentText) as SceneLike;
      } catch {
        return {} as SceneLike;
      }
    });
  }

  if (Array.isArray(content.scenes)) {
    return content.scenes as SceneLike[];
  }

  return [];
}

interface Props {
  scenes: SceneLike[];
  accentClass?: string; // tailwind text color for scene badge, e.g. "text-red-500"
}

export function VisualScriptScenes({ scenes, accentClass = "text-indigo-500" }: Props) {
  const [preview, setPreview] = useState<SceneLike | null>(null);

  if (scenes.length === 0) return null;

  return (
    <>
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Visual Script ({scenes.length} scenes)
        </p>
        <div className="space-y-2">
          {scenes.map((scene, i) => {
            const num = scene.sceneNumber ?? i + 1;
            return (
              <div
                key={i}
                className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-white"
              >
                {/* Thumbnail or placeholder */}
                <div className="shrink-0 w-28">
                  {scene.referenceImageUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreview(scene)}
                      className="block w-full aspect-video rounded overflow-hidden border border-gray-200 hover:border-indigo-400 hover:shadow-sm transition-all"
                      title="Click to view full size"
                    >
                      <img
                        src={scene.referenceImageUrl}
                        alt={`Scene ${num}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="w-full aspect-video rounded border border-dashed border-gray-200 bg-gray-50 flex items-center justify-center">
                      <span className="text-[9px] text-gray-400">No image</span>
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider ${accentClass}`}
                    >
                      Scene {num}
                    </span>
                    {scene.timeRange && (
                      <span className="text-[10px] text-gray-400 font-mono tabular-nums">
                        {scene.timeRange}
                      </span>
                    )}
                  </div>
                  {scene.visualDirection && (
                    <p className="text-xs text-gray-700 line-clamp-2">
                      {scene.visualDirection}
                    </p>
                  )}
                  {scene.voiceover && (
                    <p className="text-[11px] text-gray-500 italic line-clamp-2">
                      "{scene.voiceover}"
                    </p>
                  )}
                  {scene.onScreenText && (
                    <p className="text-[10px] text-indigo-600">{scene.onScreenText}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-wide ${accentClass}`}>
                  Scene {preview.sceneNumber ?? ""}
                </p>
                <h3 className="text-sm font-semibold text-gray-900">Visual Reference</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto">
              {preview.referenceImageUrl && (
                <img
                  src={preview.referenceImageUrl}
                  alt={`Scene ${preview.sceneNumber ?? ""}`}
                  className="w-full object-contain bg-gray-50"
                />
              )}
              <div className="p-5 space-y-3">
                {preview.timeRange && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Time
                    </p>
                    <p className="text-sm text-gray-700 font-mono tabular-nums">
                      {preview.timeRange}
                    </p>
                  </div>
                )}
                {preview.visualDirection && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Visual Direction
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {preview.visualDirection}
                    </p>
                  </div>
                )}
                {preview.voiceover && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      Voiceover
                    </p>
                    <p className="text-sm text-gray-700 italic leading-relaxed">
                      "{preview.voiceover}"
                    </p>
                  </div>
                )}
                {preview.onScreenText && (
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-1">
                      On-Screen Text
                    </p>
                    <p className="text-sm text-indigo-700">{preview.onScreenText}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
