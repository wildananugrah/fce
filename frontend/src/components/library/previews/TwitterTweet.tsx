import { Heart, MessageCircle, Repeat2, Share, BarChart3 } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function TwitterTweet({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || (content.headline as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  const brandHandle = `@${brandName.toLowerCase().replace(/\s+/g, "")}`;
  const tweetText = [hook, caption, cta].filter(Boolean).join("\n\n");

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold shrink-0">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-gray-900">{brandName}</span>
              <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.68-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z" />
              </svg>
            </div>
            <p className="text-xs text-gray-500">{brandHandle}</p>
          </div>
          {/* X logo */}
          <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </div>

        {/* Tweet body */}
        <div className="mt-3">
          <p className="text-[15px] text-gray-900 whitespace-pre-wrap leading-relaxed">{tweetText}</p>
          {hashtags && <p className="text-[15px] text-blue-500 mt-1">{hashtags}</p>}
        </div>

        {/* Timestamp */}
        <p className="text-xs text-gray-500 mt-3">10:30 AM &middot; Apr 9, 2026</p>

        {/* Divider */}
        <div className="border-t border-gray-100 my-3" />

        {/* Engagement stats */}
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span><strong className="text-gray-900">1,234</strong> Reposts</span>
          <span><strong className="text-gray-900">5,678</strong> Likes</span>
          <span><strong className="text-gray-900">12.3K</strong> Views</span>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 my-3" />

        {/* Action buttons */}
        <div className="flex items-center justify-between px-4">
          {[MessageCircle, Repeat2, Heart, BarChart3, Share].map((Icon, i) => (
            <Icon key={i} size={18} className="text-gray-500" />
          ))}
        </div>
      </div>
    </div>
  );
}
