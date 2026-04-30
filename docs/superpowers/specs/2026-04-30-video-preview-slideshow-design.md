# Video Preview Slideshow — Design

**Date:** 2026-04-30
**Status:** Spec
**Owner:** Frontend

## Problem

Content Library previews for video formats (Instagram Reels & Story, TikTok, YouTube Shorts) currently render a static 9:16 black frame with a play-button icon — the user can't get a feel for how the generated content sequences. The scene-by-scene visuals are listed below the frame as a vertical list with thumbnails, but reading rows isn't the same as seeing the post in motion. Users want the frame to auto-cycle through the scene reference images so the preview "feels like" watching the video.

Plus four video formats (YouTube long video, Twitter/X video, LinkedIn video, Facebook reel) currently route to a generic preview that doesn't even render a video frame — they need their own platform previews built in this same effort.

## Goals

- Each video preview's main frame auto-plays through the scenes' `referenceImageUrl` images.
- Cycling uses each scene's `timeRange` when present (e.g. `"0:00-0:03"` → 3s), with a fixed fallback otherwise.
- Click anywhere on the frame toggles pause/resume.
- Bottom of the frame shows a thin progress bar that fills as the current scene plays.
- All eight video formats get a dedicated platform preview using the same shared frame component.

## Non-Goals

- **Audio.** No synthesized voiceover, no music. Visual-only.
- **Real video export.** This is a preview, not an MP4. A render-to-file feature is a separate spec.
- **Editing scenes from inside the slideshow** (e.g. clicking a scene image to jump to its detail row). Possible follow-up.
- **Static-image post previews.** Instagram Single Image, Facebook Post, LinkedIn Post, Twitter Thread, etc. stay unchanged — they don't have scenes.

## Architecture

One shared component drives the slideshow logic; eight platform previews provide the chrome. Existing `VisualScriptScenes` (the vertical scene list rendered below the frame) keeps working unchanged — the slideshow is purely additive at the frame level.

```
[Platform preview .tsx]                         (8 files)
  ├─ Platform chrome (avatar, handle, captions, side icons, etc.)
  └─ <VideoSlideshowFrame scenes={...} aspectRatio="9/16" accentBg="bg-pink-500">
       <PlatformOverlays />        ← rendered above the slideshow
     </VideoSlideshowFrame>
```

`VideoSlideshowFrame` owns: the timer, current scene index, paused state, image rendering with crossfade, on-screen text overlay, progress bar, click-to-toggle handler.

## Files

### Create

**`frontend/src/components/library/previews/VideoSlideshowFrame.tsx`** — the shared slideshow component.

```tsx
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
}

const DEFAULT_SCENE_SECONDS = 2.5;
const FRAME_INTERVAL_MS = 50; // progress-bar tick rate

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
}: Props) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  // Elapsed time within the current scene, in milliseconds.
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  const sceneSecs =
    parseTimeRangeSeconds(scenes[index]?.timeRange) ?? defaultSecondsPerScene;
  const sceneMs = Math.max(500, sceneSecs * 1000); // floor so a 0s scene still ticks

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

  // Reset elapsed when scene changes (defensive — also handled in tick).
  useEffect(() => {
    setElapsed(0);
  }, [index]);

  // Empty-scenes fallback: keep the previous static play overlay so older
  // content (and content-not-yet-generated) still renders sensibly.
  if (scenes.length === 0) {
    return (
      <div
        className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto"
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
      className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto block w-full p-0"
      style={{ maxWidth, aspectRatio }}
      aria-label={`Video preview, ${scenes.length} scenes, ${paused ? "paused" : "auto-playing"}`}
    >
      {/* Scene image / placeholder */}
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

      {/* On-screen text overlay (only when image is present — placeholder
          already shows the text inline). */}
      {scene?.referenceImageUrl && scene.onScreenText && (
        <div className="absolute top-1/4 left-4 right-4 text-center pointer-events-none">
          <span className="inline-block bg-black/60 text-white text-sm font-semibold px-3 py-1.5 rounded-md">
            {scene.onScreenText}
          </span>
        </div>
      )}

      {/* Pause indicator (briefly visible while paused) */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-black/50 flex items-center justify-center">
            <Pause size={28} className="text-white" />
          </div>
        </div>
      )}

      {/* Platform chrome layered above */}
      {children}

      {/* Progress bar at the bottom of the frame */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
        <div
          className={`h-full transition-[width] ${accentBg}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </button>
  );
}
```

### Create — four new platform previews

Each file is ~100–150 lines, mostly chrome. They follow the same shape: pull `scenes` via `extractScenes`, render `<VideoSlideshowFrame>` with platform chrome as children, and put `<VisualScriptScenes>` below the frame.

**`frontend/src/components/library/previews/YouTubeLong.tsx`** — 16:9 frame, accent red. Chrome:
- Above the frame: nothing (YouTube videos are full-width).
- Inside the frame: small "Up next" / mock pause-bar idle (decorative).
- Below the frame: video title (from content), channel row with avatar + brand name + Subscribe button, view count + posted-time line, like/dislike/share/save buttons, then the description (caption).
- `<VisualScriptScenes>` block follows.

**`frontend/src/components/library/previews/TwitterVideo.tsx`** — 16:9 frame, accent sky-500. Chrome:
- Above the frame: avatar (gradient circle with brand initial), display name, `@handle`, posted-time, body text (caption + hashtags).
- Inside the frame: nothing decorative beyond the slideshow itself.
- Below the frame: reply / retweet / like / view counts in a row.

**`frontend/src/components/library/previews/LinkedInVideo.tsx`** — 16:9 frame, accent indigo-700. Chrome:
- Above the frame: profile row (avatar, name, headline like "Brand • Following", posted-time + 🌐 icon), body text.
- Inside the frame: nothing decorative.
- Below the frame: reaction icons (👍 ❤ 💡), reaction count, comments + reposts.

**`frontend/src/components/library/previews/FacebookReel.tsx`** — 9:16 frame, accent blue-600. Chrome:
- Inside the frame:
  - Top: brand avatar + brand handle + Follow button (decorative).
  - Right side: like / comment / share / save / "more" stacked (decorative, with mock counts).
  - Bottom-left: brand name, hook text, audio attribution.
- Below the frame: no extra metadata; `<VisualScriptScenes>` block follows.

### Modify — four existing video previews

For each:

**`frontend/src/components/library/previews/InstagramReels.tsx`** — replace the static play-button div with `<VideoSlideshowFrame scenes={scenes} aspectRatio="9/16" accentBg="bg-pink-500">`. Move the existing brand-info, side-icons, bottom-caption-and-music JSX into the children slot. The existing `<VisualScriptScenes>` block below stays unchanged.

**`frontend/src/components/library/previews/InstagramStory.tsx`** — same swap, accent `bg-pink-500`.

**`frontend/src/components/library/previews/TikTokVideo.tsx`** — same swap, accent `bg-red-500`.

**`frontend/src/components/library/previews/YouTubeShorts.tsx`** — same swap, accent `bg-red-500`.

### Modify — registry

`frontend/src/components/library/previews/PreviewRegistry.tsx` adds four new mappings. Concrete keys depend on what the backend emits — read the file to match the existing convention. Likely:

```ts
{ platform: "youtube",  contentType: "long_video" }    → YouTubeLong
{ platform: "twitter",  contentType: "video_tweet" }   → TwitterVideo
{ platform: "linkedin", contentType: "linkedin_video" } → LinkedInVideo
{ platform: "facebook", contentType: "reel" }          → FacebookReel
```

If those exact strings don't match what `GenerationRequest.contentType` actually stores, adjust to match.

## Testing

No new unit tests — the existing preview components have none, and the convention is to not add them for pure presentational React. Manual smoke as part of the implementation plan:

1. Generate content for each of the 8 video formats (or pick existing rows from the Library that already have multiple scenes with reference images).
2. Open the preview. Verify the frame auto-cycles through scenes, stops on click, resumes on click, and the progress bar matches.
3. Verify scenes without reference images render the placeholder card with the on-screen text or voiceover.
4. Verify a content row with `scenes.length === 0` (older content) still shows the static play-icon fallback.
5. Verify the four new platform previews render correctly without console errors.

## Rollout

Single PR. Pure frontend additive change — no backend or schema changes. Existing content rows without scenes fall through to the static fallback, so deploy is safe even on a database with mixed content.

## Open Questions

None. Sectioned design (component shape + per-platform usage) approved during brainstorming.
