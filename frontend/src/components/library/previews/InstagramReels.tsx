import { Heart, MessageCircle, Send, Music } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";
import { VideoSlideshowFrame } from "./VideoSlideshowFrame";
import { VisualScriptScenes, extractScenes } from "./VisualScriptScenes";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function InstagramReels({ content, sections, brandName }: PreviewProps) {
  const scenes = extractScenes(sections, content);

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  const brandSlug = brandName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="space-y-4">
      {/* Reels phone mockup (9:16) */}
      <VideoSlideshowFrame
        scenes={scenes}
        aspectRatio="9/16"
        accentBg="bg-pink-500"
        maxWidth={340}
      >
        {/* Top: Brand info */}
        <div className="absolute top-4 left-4 right-12 flex items-center gap-2 z-10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <p className="text-white text-sm font-semibold truncate">{brandSlug}</p>
        </div>

        {/* Right side icons (decorative) */}
        <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
          <div className="flex flex-col items-center">
            <Heart size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">12.3k</span>
          </div>
          <div className="flex flex-col items-center">
            <MessageCircle size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">234</span>
          </div>
          <div className="flex flex-col items-center">
            <Send size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">Share</span>
          </div>
        </div>

        {/* Bottom: Caption + music */}
        <div className="absolute bottom-4 left-4 right-12 z-10 space-y-2">
          <p className="text-white text-xs font-semibold">{brandSlug}</p>
          {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
          <div className="flex items-center gap-1.5">
            <Music size={12} className="text-white" />
            <p className="text-white text-[10px]">Original Audio</p>
          </div>
        </div>
      </VideoSlideshowFrame>

      <VisualScriptScenes scenes={scenes} accentClass="text-pink-500" />

      {/* Fallback if no scenes */}
      {scenes.length === 0 && (caption || cta) && (
        <div className="space-y-2">
          {caption && (
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
            </div>
          )}
          {hashtags && <p className="text-sm text-blue-500">{hashtags}</p>}
          {cta && <p className="text-sm text-indigo-600 font-medium">{cta}</p>}
        </div>
      )}
    </div>
  );
}
