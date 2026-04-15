import { useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Heart, MessageCircle, Share2, Bookmark, Music } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";
import { extractSlides } from "./VisualScriptScenes";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function TikTokCarousel({ content, sections, brandName }: PreviewProps) {
  const slides = extractSlides(sections, content);
  const [current, setCurrent] = useState(0);
  const total = slides.length || 1;

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");

  const brandSlug = `@${brandName.toLowerCase().replace(/\s+/g, "")}`;
  const currentSlide = slides[current];

  return (
    <div className="space-y-4">
      {/* TikTok carousel mockup */}
      <div className="relative bg-black rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>
        {/* Image area */}
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 group overflow-hidden">
          {currentSlide?.referenceImageUrl ? (
            <img
              src={currentSlide.referenceImageUrl}
              alt={`Slide ${current + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <ImageIcon size={48} className="text-gray-600" />
          )}

          {/* Slide headline overlay */}
          {currentSlide?.headline && (
            <div className="absolute top-1/3 left-4 right-4">
              <p className="text-white text-base font-bold text-center">{currentSlide.headline}</p>
              {currentSlide.body && (
                <p className="text-white/80 text-xs text-center mt-2">{currentSlide.body}</p>
              )}
            </div>
          )}

          {/* Navigation */}
          {total > 1 && (
            <>
              {current > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrent(current - 1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronLeft size={16} className="text-white" />
                </button>
              )}
              {current < total - 1 && (
                <button
                  type="button"
                  onClick={() => setCurrent(current + 1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <ChevronRight size={16} className="text-white" />
                </button>
              )}
            </>
          )}

          {/* Slide counter */}
          {total > 1 && (
            <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-medium">
              {current + 1}/{total}
            </span>
          )}
        </div>

        {/* Right side actions */}
        <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5 z-10">
          <Heart size={24} className="text-white" />
          <MessageCircle size={24} className="text-white" />
          <Bookmark size={24} className="text-white" />
          <Share2 size={24} className="text-white" />
        </div>

        {/* Bottom */}
        <div className="absolute bottom-4 left-4 right-16 z-10 space-y-2">
          <p className="text-white text-sm font-bold">{brandSlug}</p>
          {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
          {hashtags && <p className="text-white/70 text-[10px]">{hashtags}</p>}
          <div className="flex items-center gap-1.5">
            <Music size={12} className="text-white" />
            <p className="text-white text-[10px]">Original Sound</p>
          </div>
        </div>

        {/* Dots */}
        {total > 1 && (
          <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-1 z-10">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full ${i === current ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
