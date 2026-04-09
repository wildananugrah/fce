import { useState } from "react";
import { ThumbsUp, MessageCircle, Share2, Play, ImageIcon, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

function FacebookWrapper({ brandName, children }: { brandName: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0">
          {brandName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{brandName}</p>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span>Sponsored</span>
            <span>&middot;</span>
            <Globe size={10} />
          </div>
        </div>
      </div>

      {children}

      {/* Reactions bar */}
      <div className="px-4 py-1.5 flex items-center justify-between text-xs text-gray-500">
        <span>1.2K</span>
        <span>345 comments &middot; 123 shares</span>
      </div>
      <div className="border-t border-gray-200 flex items-center justify-between px-2 py-1">
        {[
          { icon: ThumbsUp, label: "Like" },
          { icon: MessageCircle, label: "Comment" },
          { icon: Share2, label: "Share" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} type="button" className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded">
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function FacebookFeedPost({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  const text = [hook, caption].filter(Boolean).join("\n\n");

  return (
    <FacebookWrapper brandName={brandName}>
      <div className="px-4 pb-2 space-y-1">
        <p className="text-sm text-gray-800 whitespace-pre-wrap">{text}</p>
        {hashtags && <p className="text-sm text-blue-600">{hashtags}</p>}
      </div>
      {/* Image placeholder */}
      <div className="bg-gray-100 flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
        <ImageIcon size={40} className="text-gray-300" />
      </div>
      {cta && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Learn More</p>
            <p className="text-sm font-semibold text-gray-900">{cta}</p>
          </div>
          <button type="button" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded">
            Learn More
          </button>
        </div>
      )}
    </FacebookWrapper>
  );
}

export function FacebookCarouselAd({ content, sections, brandName }: PreviewProps) {
  const slides = Array.isArray(content.slides)
    ? (content.slides as { headline?: string; body?: string; visualDirection?: string }[])
    : [];
  const [current, setCurrent] = useState(0);
  const total = slides.length || 1;
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";

  return (
    <FacebookWrapper brandName={brandName}>
      {hook && <p className="px-4 pb-2 text-sm text-gray-800">{hook}</p>}
      {/* Carousel */}
      <div className="relative bg-gray-100 flex items-center justify-center group" style={{ aspectRatio: "1/1" }}>
        <ImageIcon size={40} className="text-gray-300" />
        {slides[current]?.headline && (
          <div className="absolute bottom-0 left-0 right-0 bg-white px-4 py-3 border-t border-gray-200">
            <p className="text-sm font-semibold text-gray-900">{slides[current].headline}</p>
            {slides[current]?.body && <p className="text-xs text-gray-500 mt-0.5">{slides[current].body}</p>}
          </div>
        )}
        {total > 1 && current > 0 && (
          <button type="button" onClick={() => setCurrent(current - 1)} className="absolute left-2 top-1/3 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronLeft size={16} />
          </button>
        )}
        {total > 1 && current < total - 1 && (
          <button type="button" onClick={() => setCurrent(current + 1)} className="absolute right-2 top-1/3 w-7 h-7 rounded-full bg-white shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <ChevronRight size={16} />
          </button>
        )}
        {total > 1 && (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/60 text-white text-[10px]">
            {current + 1}/{total}
          </span>
        )}
      </div>
    </FacebookWrapper>
  );
}

export function FacebookReel({ content, sections, brandName }: PreviewProps) {
  const scenes = Array.isArray(content.scenes)
    ? (content.scenes as { voiceover?: string; onScreenText?: string; visualDirection?: string }[])
    : [];
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";

  return (
    <div className="space-y-4">
      {/* Vertical mockup */}
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-12 z-10 space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {brandName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white text-sm font-semibold">{brandName}</p>
          </div>
          {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
        </div>
        <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-10">
          <ThumbsUp size={24} className="text-white" />
          <MessageCircle size={24} className="text-white" />
          <Share2 size={24} className="text-white" />
        </div>
      </div>

      {/* Scenes */}
      {scenes.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Scenes ({scenes.length})</p>
          <div className="space-y-2">
            {scenes.map((scene, i) => (
              <div key={i} className="p-3 rounded-lg border border-gray-200 bg-white">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-bold text-white bg-blue-600 w-5 h-5 rounded flex items-center justify-center shrink-0">{i + 1}</span>
                  <div>
                    {scene.voiceover && <p className="text-xs text-gray-800">{scene.voiceover}</p>}
                    {scene.onScreenText && <p className="text-[10px] text-blue-600 mt-0.5">{scene.onScreenText}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scenes.length === 0 && caption && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{caption}</p>
        </div>
      )}
    </div>
  );
}

export function FacebookStory({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const visualDirection = getSectionText(sections, "visual_direction") || (content.visualDirection as string) || "";

  return (
    <div className="space-y-4">
      <div className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>
        {/* Progress bar */}
        <div className="absolute top-2 left-3 right-3 z-10 h-0.5 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-white rounded-full" />
        </div>
        {/* Brand */}
        <div className="absolute top-5 left-4 flex items-center gap-2 z-10">
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold ring-2 ring-white/30 shrink-0">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <p className="text-white text-sm font-semibold">{brandName}</p>
        </div>
        {/* Center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon size={48} className="text-gray-600" />
        </div>
        {/* Hook overlay */}
        {hook && (
          <div className="absolute top-1/3 left-4 right-4 z-10">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg px-4 py-3">
              <p className="text-white text-sm font-semibold text-center">{hook}</p>
            </div>
          </div>
        )}
        {/* CTA */}
        {cta && (
          <div className="absolute bottom-12 left-0 right-0 flex justify-center z-10">
            <div className="bg-white rounded-full px-5 py-2 shadow-lg">
              <p className="text-sm font-semibold text-gray-900">{cta}</p>
            </div>
          </div>
        )}
      </div>

      {caption && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Caption</p>
          <p className="text-sm text-gray-700">{caption}</p>
        </div>
      )}
      {visualDirection && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Visual Direction</p>
          <p className="text-xs text-gray-600">{visualDirection}</p>
        </div>
      )}
    </div>
  );
}
