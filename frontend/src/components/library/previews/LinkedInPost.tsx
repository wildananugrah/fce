import { ThumbsUp, MessageCircle, Repeat2, Send, Globe } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";
import { VisualScriptScenes, extractScenes, extractSlides, extractPostImage } from "./VisualScriptScenes";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

function LinkedInWrapper({ brandName, children }: { brandName: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div className="w-12 h-12 rounded-full bg-blue-700 text-white flex items-center justify-center text-lg font-bold shrink-0">
          {brandName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{brandName}</p>
          <p className="text-xs text-gray-500">Company &middot; Promoted</p>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <span>2h</span>
            <span>&middot;</span>
            <Globe size={12} />
          </div>
        </div>
      </div>

      {children}

      {/* Engagement bar */}
      <div className="px-4 py-2 flex items-center gap-2 text-xs text-gray-500">
        <ThumbsUp size={12} className="text-blue-600" />
        <span>1,234 &middot; 56 comments</span>
      </div>
      <div className="border-t border-gray-200 flex items-center justify-between px-2 py-1">
        {[
          { icon: ThumbsUp, label: "Like" },
          { icon: MessageCircle, label: "Comment" },
          { icon: Repeat2, label: "Repost" },
          { icon: Send, label: "Send" },
        ].map(({ icon: Icon, label }) => (
          <button key={label} type="button" className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded">
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LinkedInPost({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || (content.headline as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";
  const postImage = extractPostImage(sections);

  const text = [hook, caption, cta].filter(Boolean).join("\n\n");

  return (
    <LinkedInWrapper brandName={brandName}>
      <div className="px-4 pb-3 space-y-2">
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{text}</p>
        {hashtags && <p className="text-sm text-blue-600">{hashtags}</p>}
      </div>
      {postImage && (
        <img
          src={postImage}
          alt="Post"
          className="w-full object-cover"
          style={{ aspectRatio: "1.91/1" }}
        />
      )}
    </LinkedInWrapper>
  );
}

export function LinkedInCarouselPost({ content, sections, brandName }: PreviewProps) {
  const slides = extractSlides(sections, content);
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");

  return (
    <LinkedInWrapper brandName={brandName}>
      {hook && <p className="px-4 pb-2 text-sm text-gray-800">{hook}</p>}
      {/* Carousel slides horizontal scroll */}
      <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
        {slides.map((slide, i) => (
          <div
            key={i}
            className="shrink-0 w-48 bg-blue-50 border border-blue-100 rounded-lg overflow-hidden flex flex-col"
          >
            {slide.referenceImageUrl && (
              <img
                src={slide.referenceImageUrl}
                alt={`Slide ${i + 1}`}
                className="w-full object-cover"
                style={{ aspectRatio: "1/1" }}
              />
            )}
            <div className="p-3">
              <p className="text-[10px] text-blue-500 font-medium mb-1">Slide {i + 1}</p>
              {slide.headline && <p className="text-xs font-semibold text-gray-900">{slide.headline}</p>}
              {slide.body && <p className="text-[11px] text-gray-600 mt-1 line-clamp-3">{slide.body}</p>}
            </div>
          </div>
        ))}
        {slides.length === 0 && (
          <p className="text-xs text-gray-400">No slides available</p>
        )}
      </div>
      {hashtags && <p className="px-4 pb-3 text-sm text-blue-600">{hashtags}</p>}
    </LinkedInWrapper>
  );
}

export function LinkedInVideo({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const scenes = extractScenes(sections, content);

  return (
    <div className="space-y-4">
      <LinkedInWrapper brandName={brandName}>
        {(hook || caption) && (
          <p className="px-4 pb-2 text-sm text-gray-800 line-clamp-3">
            {hook || caption}
          </p>
        )}
        {/* Video placeholder */}
        <div className="relative bg-gray-900 mx-0" style={{ aspectRatio: "16/9" }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center">
              <Send size={24} className="text-white ml-1 rotate-[-30deg]" />
            </div>
          </div>
        </div>
        {hashtags && <p className="px-4 py-2 text-sm text-blue-600">{hashtags}</p>}
      </LinkedInWrapper>
      <VisualScriptScenes scenes={scenes} accentClass="text-blue-600" />
    </div>
  );
}

export function LinkedInArticle({ content, sections, brandName, contentTitle }: PreviewProps) {
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";

  return (
    <LinkedInWrapper brandName={brandName}>
      {hook && <p className="px-4 pb-2 text-sm text-gray-800">{hook}</p>}
      {/* Article card */}
      <div className="mx-4 mb-3 border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-100 h-32 flex items-center justify-center">
          <span className="text-gray-400 text-xs">Article Cover</span>
        </div>
        <div className="p-3">
          <p className="text-sm font-semibold text-gray-900">{contentTitle ?? "Untitled Article"}</p>
          {caption && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{caption}</p>}
        </div>
      </div>
    </LinkedInWrapper>
  );
}
