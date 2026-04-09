import { useState } from "react";
import { Play, Heart, MessageCircle, Send, Music } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function InstagramReels({ content, sections, brandName }: PreviewProps) {
  const scenes = Array.isArray(content.scenes)
    ? (content.scenes as { voiceover?: string; onScreenText?: string; visualDirection?: string }[])
    : [];
  const [currentScene, setCurrentScene] = useState(0);

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  const brandSlug = brandName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="space-y-4">
      {/* Reels phone mockup (9:16) */}
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>

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
                  i === currentScene
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-100 w-5 h-5 rounded flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {scene.voiceover && (
                      <p className="text-xs text-gray-800 line-clamp-2">{scene.voiceover}</p>
                    )}
                    {scene.onScreenText && (
                      <p className="text-[10px] text-indigo-600 mt-0.5">{scene.onScreenText}</p>
                    )}
                    {scene.visualDirection && (
                      <p className="text-[10px] text-gray-400 mt-0.5 italic">{scene.visualDirection}</p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

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
