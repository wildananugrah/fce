import { useEffect, useRef, useState, type ReactNode } from "react";
import { Play, Pause } from "lucide-react";
import type { SceneLike } from "./VisualScriptScenes";

interface Props {
  scenes: SceneLike[];
  aspectRatio: "9/16" | "16/9";
  /** Tailwind bg class for the progress bar accent (e.g. "bg-pink-500"). */
  accentBg?: string;
  /** Default seconds per scene when timeRange is missing/unparseable. */
  defaultSecondsPerScene?: number;
  /** Overlay chrome (brand info, side icons, etc.) rendered above the
   *  slideshow but inside the frame. */
  children?: ReactNode;
  /** Max width in px so the frame doesn't blow up on wide screens. */
  maxWidth?: number;
  /** Optional className additions on the root frame. */
  className?: string;
  /** Optional rounded corners override. Defaults to "rounded-2xl". */
  rounded?: string;
}

const DEFAULT_SCENE_SECONDS = 2.5;
const FRAME_INTERVAL_MS = 50;

/** Parse a "0:00-0:03" timeRange into seconds; returns null if unparseable. */
function parseTimeRangeSeconds(range: string | undefined): number | null {
  if (!range) return null;
  const match = /^(\d+):(\d+)\s*[-–]\s*(\d+):(\d+)$/.exec(range);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const dur = end - start;
  return dur > 0 ? dur : null;
}

export function VideoSlideshowFrame({
  scenes,
  aspectRatio,
  accentBg = "bg-white",
  defaultSecondsPerScene = DEFAULT_SCENE_SECONDS,
  children,
  maxWidth = 340,
  className = "",
  rounded = "rounded-2xl",
}: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  const sceneSecs =
    parseTimeRangeSeconds(scenes[index]?.timeRange) ?? defaultSecondsPerScene;
  const sceneMs = Math.max(500, sceneSecs * 1000);

  useEffect(() => {
    if (paused || scenes.length === 0) return;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      setElapsed((e) => {
        const next = e + delta;
        if (next >= sceneMs) {
          setIndex((i) => (i + 1) % scenes.length);
          return 0;
        }
        return next;
      });
      tickRef.current = window.setTimeout(tick, FRAME_INTERVAL_MS);
    };
    tickRef.current = window.setTimeout(tick, FRAME_INTERVAL_MS);
    return () => {
      if (tickRef.current !== null) window.clearTimeout(tickRef.current);
    };
  }, [paused, scenes.length, sceneMs]);

  useEffect(() => {
    setElapsed(0);
  }, [index]);

  // Empty-scenes fallback: keep the static play overlay so older content
  // (and content not yet generated) still renders sensibly.
  if (scenes.length === 0) {
    return (
      <div
        className={`relative bg-gray-900 ${rounded} overflow-hidden mx-auto ${className}`}
        style={{ maxWidth, aspectRatio }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>
        {children}
      </div>
    );
  }

  const scene = scenes[index];
  const num = scene?.sceneNumber ?? index + 1;
  const progress = Math.min(100, (elapsed / sceneMs) * 100);

  return (
    <button
      type="button"
      onClick={() => setPaused((p) => !p)}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          setPaused((p) => !p);
        }
      }}
      className={`relative bg-gray-900 ${rounded} overflow-hidden mx-auto block w-full p-0 ${className}`}
      style={{ maxWidth, aspectRatio }}
      aria-label={`Video preview, ${scenes.length} scenes, ${paused ? "paused" : "auto-playing"}`}
    >
      {scene?.referenceImageUrl ? (
        <img
          src={scene.referenceImageUrl}
          alt={`Scene ${num}`}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-700 to-gray-900 flex flex-col items-center justify-center text-center px-8">
          <span className="text-[10px] font-semibold text-white/60 uppercase tracking-wider mb-2">
            Scene {num}
          </span>
          {scene?.onScreenText ? (
            <p className="text-white text-sm font-medium">{scene.onScreenText}</p>
          ) : scene?.voiceover ? (
            <p className="text-white/80 text-xs italic line-clamp-3">"{scene.voiceover}"</p>
          ) : (
            <p className="text-white/50 text-xs">No reference image</p>
          )}
        </div>
      )}

      {scene?.referenceImageUrl && scene.onScreenText && (
        <div className="absolute top-1/4 left-4 right-4 text-center pointer-events-none">
          <span className="inline-block bg-black/60 text-white text-sm font-semibold px-3 py-1.5 rounded-md">
            {scene.onScreenText}
          </span>
        </div>
      )}

      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
            <Pause size={28} className="text-white" />
          </div>
        </div>
      )}

      {children}

      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className={`h-full transition-[width] ${accentBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </button>
  );
}
