import { useEffect, useState, useMemo } from "react";
import { Loader2, Check, AlertCircle, Globe, ChevronDown, ChevronRight } from "lucide-react";
import {
  urlInspirationApi,
  type InspirationResult,
} from "../../services/url-inspiration.service";

interface Props {
  workspaceId: string;
  prompt: string;
}

interface TrackedInspiration extends InspirationResult {
  loading: boolean;
}

const URL_REGEX = /https?:\/\/[^\s<>"]+/g;

export function UrlInspirationChips({ workspaceId, prompt }: Props) {
  const [inspirations, setInspirations] = useState<Map<string, TrackedInspiration>>(
    new Map(),
  );
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);

  // Extract unique URLs from prompt (max 5)
  const urls = useMemo(() => {
    const matches = prompt.match(URL_REGEX) ?? [];
    return Array.from(new Set(matches)).slice(0, 5);
  }, [prompt]);

  // Debounced fetch: 800ms after prompt stops changing, kick off previews for new URLs
  useEffect(() => {
    const timer = setTimeout(() => {
      // Fetch any new URLs not already tracked
      for (const url of urls) {
        if (!inspirations.has(url)) {
          setInspirations((prev) => {
            const next = new Map(prev);
            next.set(url, {
              url,
              kind: "website",
              summary: null,
              status: "scraped",
              loading: true,
            });
            return next;
          });
          urlInspirationApi
            .preview(workspaceId, url)
            .then((result) => {
              setInspirations((prev) => {
                const next = new Map(prev);
                next.set(url, { ...result, loading: false });
                return next;
              });
            })
            .catch(() => {
              setInspirations((prev) => {
                const next = new Map(prev);
                next.set(url, {
                  url,
                  kind: "website",
                  summary: null,
                  status: "failed",
                  loading: false,
                  error: "Preview failed",
                });
                return next;
              });
            });
        }
      }
      // Drop inspirations for URLs that were removed from the prompt
      setInspirations((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const key of next.keys()) {
          if (!urls.includes(key)) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls, workspaceId]);

  if (urls.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Chips row */}
      <div className="flex flex-wrap gap-1.5">
        {urls.map((url) => {
          const insp = inspirations.get(url);
          let hostname = "link";
          try {
            hostname = new URL(url).hostname.replace(/^www\./, "");
          } catch {
            /* ignore */
          }

          const statusIcon = insp?.loading ? (
            <Loader2 size={11} className="animate-spin text-gray-400" />
          ) : insp?.status === "failed" ? (
            <AlertCircle size={11} className="text-red-500" />
          ) : insp?.summary ? (
            <Check size={11} className="text-green-500" />
          ) : (
            <Globe size={11} className="text-gray-400" />
          );

          const isExpanded = expandedUrl === url;
          const canExpand = !!insp?.summary;

          return (
            <button
              key={url}
              type="button"
              onClick={() => canExpand && setExpandedUrl(isExpanded ? null : url)}
              disabled={!canExpand}
              className={`inline-flex items-center gap-1.5 px-2 py-1 text-[10px] bg-gray-50 border border-gray-200 rounded-md transition-colors max-w-[220px] ${
                canExpand ? "hover:border-indigo-300 cursor-pointer" : "cursor-default"
              }`}
              title={insp?.summary?.angle ?? url}
            >
              {statusIcon}
              <span className="truncate text-gray-600">{hostname}</span>
              {canExpand && (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
            </button>
          );
        })}
      </div>

      {/* Expanded summary card */}
      {expandedUrl && inspirations.get(expandedUrl)?.summary && (() => {
        const expandedInsp = inspirations.get(expandedUrl)!;
        const summary = expandedInsp.summary!;
        return (
          <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-lg text-[11px] space-y-1.5">
            <p className="font-semibold text-indigo-700 truncate">{expandedUrl}</p>
            <p>
              <span className="font-medium text-gray-700">Angle:</span>{" "}
              <span className="text-gray-600">{summary.angle}</span>
            </p>
            <p>
              <span className="font-medium text-gray-700">Tone:</span>{" "}
              <span className="text-gray-600">{summary.tone}</span>
            </p>
            <p>
              <span className="font-medium text-gray-700">Format:</span>{" "}
              <span className="text-gray-600">{summary.format}</span>
            </p>
            <div>
              <span className="font-medium text-gray-700">Key points:</span>
              <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                {summary.keyPoints.map((p, i) => (
                  <li key={i} className="text-gray-600">
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            {summary.hashtags && summary.hashtags.length > 0 && (
              <p>
                <span className="font-medium text-gray-700">Hashtags:</span>{" "}
                <span className="text-indigo-600">{summary.hashtags.join(" ")}</span>
              </p>
            )}
            {summary.engagementSignal && (
              <p>
                <span className="font-medium text-gray-700">Engagement:</span>{" "}
                <span className="text-gray-600">{summary.engagementSignal}</span>
              </p>
            )}
            {expandedInsp.media?.hasVideo && !expandedInsp.media.skipped && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-1.5 text-xs text-indigo-700">
                🎥 Video detected — will be analyzed during generation
              </div>
            )}
            {expandedInsp.media?.skipped?.reason === "size cap exceeded" && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                🎥 Video exceeds {expandedInsp.media.skipped.sizeMb} MB (cap {expandedInsp.media.skipped.capMb} MB). Try a shorter clip.
              </div>
            )}
            {expandedInsp.media?.skipped?.reason === "duration cap exceeded" && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                🎥 Video exceeds {expandedInsp.media.skipped.durationSeconds}s (cap {expandedInsp.media.skipped.capSeconds}s). Try a shorter clip.
              </div>
            )}
            {expandedInsp.media?.skipped?.reason === "video analysis requires Gemini" && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                🎥 Video analysis requires Gemini. Configure a Gemini key in Workspace Settings.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
