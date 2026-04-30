import { ImageIcon } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";
import { VideoSlideshowFrame } from "./VideoSlideshowFrame";
import { VisualScriptScenes, extractScenes, extractPostImage, extractFrames } from "./VisualScriptScenes";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function InstagramStory({ content, sections, brandName, contentType }: PreviewProps) {
  const isVideo = contentType === "story_video";
  const hook = getSectionText(sections, "hook") || (content.hook as string) || (content.headline as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";
  const visualDirection = getSectionText(sections, "visual_direction") || (content.visualDirection as string) || "";
  const scenes = isVideo ? extractScenes(sections, content) : [];
  const postImage = extractPostImage(sections);
  const frames = extractFrames(sections, content);
  // The first frame's image doubles as the cover for image-story previews.
  const coverImage = postImage || frames[0]?.referenceImageUrl || "";

  const brandSlug = brandName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="space-y-4">
      {/* Story phone mockup (9:16) */}
      {isVideo && scenes.length > 0 ? (
        <VideoSlideshowFrame
          scenes={scenes}
          aspectRatio="9/16"
          accentBg="bg-pink-500"
          maxWidth={340}
        >
          {/* Progress bar */}
          <div className="absolute top-2 left-3 right-3 z-10">
            <div className="h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-white rounded-full" />
            </div>
          </div>

          {/* Brand header */}
          <div className="absolute top-5 left-4 right-4 flex items-center gap-2 z-10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/30 shrink-0">
              {brandName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm font-semibold">{brandSlug}</p>
            <span className="text-white/60 text-xs">2h</span>
          </div>

          {/* Hook text overlay */}
          {hook && (
            <div className="absolute top-1/3 left-4 right-4 z-10">
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-3">
                <p className="text-white text-sm font-semibold text-center">{hook}</p>
              </div>
            </div>
          )}

          {/* CTA sticker at bottom */}
          {cta && (
            <div className="absolute bottom-16 left-0 right-0 flex justify-center z-10">
              <div className="bg-white rounded-full px-5 py-2 shadow-lg">
                <p className="text-sm font-semibold text-gray-900">{cta}</p>
              </div>
            </div>
          )}

          {/* Swipe up indicator */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10">
            <svg className="w-5 h-5 text-white/60 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </VideoSlideshowFrame>
      ) : (
        <div
          className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto"
          style={{ maxWidth: 340, aspectRatio: "9/16" }}
        >
          {/* Progress bar */}
          <div className="absolute top-2 left-3 right-3 z-10">
            <div className="h-0.5 bg-white/30 rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-white rounded-full" />
            </div>
          </div>

          {/* Brand header */}
          <div className="absolute top-5 left-4 right-4 flex items-center gap-2 z-10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold ring-2 ring-white/30 shrink-0">
              {brandName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm font-semibold">{brandSlug}</p>
            <span className="text-white/60 text-xs">2h</span>
          </div>

          {/* Center content */}
          {coverImage && (
            <img
              src={coverImage}
              alt="Story cover"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          {!coverImage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <ImageIcon size={48} className="text-gray-600" />
            </div>
          )}

          {/* Hook text overlay */}
          {hook && (
            <div className="absolute top-1/3 left-4 right-4 z-10">
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-3">
                <p className="text-white text-sm font-semibold text-center">{hook}</p>
              </div>
            </div>
          )}

          {/* CTA sticker at bottom */}
          {cta && (
            <div className="absolute bottom-16 left-0 right-0 flex justify-center z-10">
              <div className="bg-white rounded-full px-5 py-2 shadow-lg">
                <p className="text-sm font-semibold text-gray-900">{cta}</p>
              </div>
            </div>
          )}

          {/* Swipe up indicator */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center z-10">
            <svg className="w-5 h-5 text-white/60 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          </div>
        </div>
      )}

      {/* Details below */}
      {caption && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
        </div>
      )}

      {visualDirection && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Visual Direction</p>
          <p className="text-xs text-gray-600">{visualDirection}</p>
        </div>
      )}

      <VisualScriptScenes scenes={scenes} accentClass="text-pink-500" />
    </div>
  );
}
