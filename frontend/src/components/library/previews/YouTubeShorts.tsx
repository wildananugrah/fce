import { Play, ThumbsUp, ThumbsDown, MessageCircle, Share2 } from "lucide-react";
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

export function YouTubeShorts({ content, sections, brandName }: PreviewProps) {
  const scenes = extractScenes(sections, content);

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");

  const brandSlug = brandName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="space-y-4">
      {/* Shorts phone mockup (9:16) */}
      <VideoSlideshowFrame
        scenes={scenes}
        aspectRatio="9/16"
        accentBg="bg-red-500"
        maxWidth={340}
      >
        {/* Shorts badge */}
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5">
          <div className="w-5 h-6 bg-red-600 rounded-sm flex items-center justify-center">
            <Play size={10} className="text-white ml-0.5" />
          </div>
          <span className="text-white text-sm font-semibold">Shorts</span>
        </div>

        {/* Right side actions */}
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-10">
          <div className="flex flex-col items-center">
            <ThumbsUp size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">5.6K</span>
          </div>
          <div className="flex flex-col items-center">
            <ThumbsDown size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">Dislike</span>
          </div>
          <div className="flex flex-col items-center">
            <MessageCircle size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">234</span>
          </div>
          <div className="flex flex-col items-center">
            <Share2 size={24} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">Share</span>
          </div>
        </div>

        {/* Bottom: Channel + caption */}
        <div className="absolute bottom-4 left-4 right-16 z-10 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
              {brandName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm font-semibold">@{brandSlug}</p>
            <button type="button" className="px-2 py-0.5 border border-white rounded text-white text-[10px]">
              Subscribe
            </button>
          </div>
          {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
          {hashtags && <p className="text-white/70 text-[10px]">{hashtags}</p>}
        </div>
      </VideoSlideshowFrame>

      <VisualScriptScenes scenes={scenes} accentClass="text-red-600" />

      {scenes.length === 0 && caption && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
        </div>
      )}
    </div>
  );
}
