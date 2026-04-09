import { ImageIcon } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function InstagramSingleImage({ content, sections, brandName }: PreviewProps) {
  const hook = getSectionText(sections, "hook") || (content.hook as string) || (content.headline as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";
  const visualDirection = getSectionText(sections, "visual_direction") || (content.visualDirection as string) || "";

  const brandSlug = brandName.toLowerCase().replace(/\s+/g, "");

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{brandSlug}</p>
            <p className="text-[10px] text-gray-400">Sponsored</p>
          </div>
        </div>

        {/* Image */}
        <div className="relative aspect-square bg-gray-100 flex items-center justify-center">
          <ImageIcon size={48} className="text-gray-300" />
          {hook && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
              <p className="text-white text-sm font-semibold">{hook}</p>
            </div>
          )}
        </div>

        {/* Engagement icons */}
        <div className="flex items-center gap-4 px-4 py-2">
          <svg className="w-6 h-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
          </svg>
          <svg className="w-6 h-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
          </svg>
          <svg className="w-6 h-6 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
          </svg>
        </div>

        {/* Caption */}
        <div className="px-4 pb-3 space-y-1">
          {caption && (
            <p className="text-sm text-gray-800">
              <span className="font-semibold">{brandSlug}</span>{" "}
              {caption}
            </p>
          )}
          {hashtags && <p className="text-sm text-blue-800">{hashtags}</p>}
          {cta && <p className="text-sm text-indigo-600 font-medium">{cta}</p>}
        </div>
      </div>

      {visualDirection && (
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Visual Direction</p>
          <p className="text-xs text-gray-600">{visualDirection}</p>
        </div>
      )}
    </div>
  );
}
