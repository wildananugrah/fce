import { useState } from "react";
import { Play, Heart, MessageCircle, Share2, Music, Bookmark } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function TikTokVideo({ content, sections, brandName }: PreviewProps) {
  const scenes = Array.isArray(content.scenes)
    ? (content.scenes as { voiceover?: string; onScreenText?: string; visualDirection?: string }[])
    : [];
  const [currentScene, setCurrentScene] = useState(0);

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");

  const brandSlug = `@${brandName.toLowerCase().replace(/\s+/g, "")}`;

  return (
    <div className="space-y-4">
      {/* TikTok phone mockup (9:16) */}
      <div className="relative bg-black rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>

        {/* Right side actions */}
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-10">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white text-xs font-bold ring-2 ring-rose-500">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col items-center">
            <Heart size={28} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">42.1k</span>
          </div>
          <div className="flex flex-col items-center">
            <MessageCircle size={28} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">1,234</span>
          </div>
          <div className="flex flex-col items-center">
            <Bookmark size={28} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">5,678</span>
          </div>
          <div className="flex flex-col items-center">
            <Share2 size={28} className="text-white" />
            <span className="text-white text-[10px] mt-0.5">Share</span>
          </div>
        </div>

        {/* Bottom: Caption + music */}
        <div className="absolute bottom-4 left-4 right-16 z-10 space-y-2">
          <p className="text-white text-sm font-bold">{brandSlug}</p>
          {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
          {hashtags && <p className="text-white/70 text-[10px]">{hashtags}</p>}
          <div className="flex items-center gap-1.5">
            <Music size={12} className="text-white" />
            <div className="overflow-hidden">
              <p className="text-white text-[10px] whitespace-nowrap animate-pulse">Original Sound - {brandName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scene list */}
      {scenes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Scenes ({scenes.length})
          </p>
          <div className="space-y-2">
            {scenes.map((scene, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentScene(i)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${
                  i === currentScene ? "border-gray-800 bg-gray-50" : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-white bg-gray-900 w-5 h-5 rounded flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {scene.voiceover && <p className="text-xs text-gray-800 line-clamp-2">{scene.voiceover}</p>}
                    {scene.onScreenText && <p className="text-[10px] text-rose-600 mt-0.5">{scene.onScreenText}</p>}
                    {scene.visualDirection && <p className="text-[10px] text-gray-400 mt-0.5 italic">{scene.visualDirection}</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fallback caption */}
      {scenes.length === 0 && caption && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
        </div>
      )}
    </div>
  );
}
