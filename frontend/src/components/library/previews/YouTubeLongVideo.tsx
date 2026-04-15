import { Play, ThumbsUp, ThumbsDown, Share2, Download } from "lucide-react";
import type { PreviewProps } from "./PreviewRegistry";
import { VisualScriptScenes, extractScenes } from "./VisualScriptScenes";

function getSectionText(sections: PreviewProps["sections"], type: string): string {
  return sections
    .filter((s) => s.sectionType === type)
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map((s) => s.contentText)
    .join("\n");
}

export function YouTubeLongVideo({ content, sections, brandName, contentTitle }: PreviewProps) {
  const scenes = extractScenes(sections, content);

  const hook = getSectionText(sections, "hook") || (content.hook as string) || "";
  const caption = getSectionText(sections, "caption") || (content.caption as string) || (content.body as string) || "";
  const hashtags = getSectionText(sections, "hashtag") || (Array.isArray(content.hashtags) ? (content.hashtags as string[]).join(" ") : "");
  const cta = getSectionText(sections, "cta") || (content.cta as string) || "";

  return (
    <div className="space-y-4">
      {/* YouTube player mockup (16:9) */}
      <div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>
        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
          <div className="h-full w-0 bg-red-600 rounded-full" />
        </div>
      </div>

      {/* Title + Channel */}
      <div>
        <h3 className="text-base font-semibold text-gray-900 leading-snug">
          {contentTitle ?? hook ?? "Untitled Video"}
        </h3>
        <div className="flex items-center gap-3 mt-2">
          <div className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold shrink-0">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{brandName}</p>
            <p className="text-xs text-gray-500">12.3K subscribers</p>
          </div>
          <button type="button" className="ml-auto px-4 py-1.5 bg-black text-white text-xs font-semibold rounded-full">
            Subscribe
          </button>
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2">
        {[
          { icon: ThumbsUp, label: "1.2K" },
          { icon: ThumbsDown, label: "" },
          { icon: Share2, label: "Share" },
          { icon: Download, label: "Download" },
        ].map(({ icon: Icon, label }, i) => (
          <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs text-gray-700 font-medium">
            <Icon size={14} />
            {label}
          </div>
        ))}
      </div>

      {/* Description box */}
      <div className="bg-gray-100 rounded-xl p-3 space-y-2">
        <p className="text-xs text-gray-500">1.2K views &middot; 2 hours ago</p>
        {caption && <p className="text-sm text-gray-800 whitespace-pre-wrap line-clamp-4">{caption}</p>}
        {hashtags && <p className="text-sm text-blue-600">{hashtags}</p>}
        {cta && <p className="text-sm text-gray-900 font-medium">{cta}</p>}
      </div>

      <VisualScriptScenes scenes={scenes} accentClass="text-red-600" />
    </div>
  );
}
