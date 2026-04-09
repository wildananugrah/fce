import { Play, Heart, MessageCircle, Repeat2, Share, BarChart3 } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function TwitterVideoTweet({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  const brandHandle = `@${brandName.toLowerCase().replace(/\s+/g, "")}`;
  const tweetText = [hook, caption, cta].filter(Boolean).join("\n\n");

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">
          {brandName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-gray-900">{brandName}</span>
            <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
            </svg>
            <span className="text-xs text-gray-500">{brandHandle}</span>
          </div>
        </div>
      </div>

      {/* Tweet text */}
      <p className="text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed">{tweetText}</p>
      {hashtags && <p className="text-[15px] text-blue-500">{hashtags}</p>}

      {/* Video thumbnail */}
      <div className="relative bg-gray-900 rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-blue-500/80 flex items-center justify-center">
            <Play size={28} className="text-white ml-1" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-white text-[10px]">
          0:30
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        {[MessageCircle, Repeat2, Heart, BarChart3, Share].map((Icon, i) => (
          <Icon key={i} size={16} className="text-gray-500" />
        ))}
      </div>
    </div>
  );
}
