import type { PreviewProps } from "./PreviewRegistry";

function getSectionsByType(sections: PreviewProps["sections"], type: string): string[] {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText);
}

export function GenericPreview({ content, sections, platform, contentType }: PreviewProps) {
  const hooks = getSectionsByType(sections, "hook");
  const captions = getSectionsByType(sections, "caption");
  const ctas = getSectionsByType(sections, "cta");
  const hashtags = getSectionsByType(sections, "hashtag");
  const visuals = getSectionsByType(sections, "visual_direction");

  const slides = Array.isArray(content.slides) ? (content.slides as Record<string, string>[]) : [];
  const scenes = Array.isArray(content.scenes) ? (content.scenes as Record<string, string>[]) : [];

  return (
    <div className="space-y-4">
      {/* Platform badge */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="capitalize font-medium">{platform}</span>
        <span>&middot;</span>
        <span>{contentType.replace(/_/g, " ")}</span>
      </div>

      {/* Hooks */}
      {hooks.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hook</p>
          {hooks.map((h, i) => (
            <p key={i} className="text-sm text-gray-800 mb-1">{h}</p>
          ))}
        </div>
      )}

      {/* Caption / Body */}
      {captions.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
          {captions.map((c, i) => (
            <p key={i} className="text-sm text-gray-700 whitespace-pre-wrap">{c}</p>
          ))}
        </div>
      )}

      {/* Slides */}
      {slides.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Slides ({slides.length})
          </p>
          <div className="space-y-3">
            {slides.map((slide, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-[10px] font-medium text-gray-400 mb-1">Slide {i + 1}</p>
                {slide.headline && <p className="text-sm font-semibold text-gray-900">{slide.headline}</p>}
                {slide.body && <p className="text-sm text-gray-700 mt-1">{slide.body}</p>}
                {slide.visualDirection && (
                  <p className="text-xs text-gray-400 mt-1 italic">{slide.visualDirection}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scenes */}
      {scenes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Scenes ({scenes.length})
          </p>
          <div className="space-y-3">
            {scenes.map((scene, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <p className="text-[10px] font-medium text-gray-400 mb-1">Scene {i + 1}</p>
                {scene.voiceover && <p className="text-sm text-gray-700">{scene.voiceover}</p>}
                {scene.onScreenText && (
                  <p className="text-xs text-indigo-600 mt-1">{scene.onScreenText}</p>
                )}
                {scene.visualDirection && (
                  <p className="text-xs text-gray-400 mt-1 italic">{scene.visualDirection}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {ctas.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">CTA</p>
          {ctas.map((c, i) => (
            <p key={i} className="text-sm text-indigo-600 font-medium">{c}</p>
          ))}
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Hashtags</p>
          <p className="text-sm text-blue-500">{hashtags.join(" ")}</p>
        </div>
      )}

      {/* Visual Direction */}
      {visuals.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Visual Direction</p>
          {visuals.map((v, i) => (
            <p key={i} className="text-xs text-gray-500 italic">{v}</p>
          ))}
        </div>
      )}
    </div>
  );
}
