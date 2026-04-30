# Video Preview Slideshow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static play-icon overlay on the 8 video-format Content Library previews with an auto-cycling slideshow of scene reference images, driven by a shared component.

**Architecture:** One new shared `VideoSlideshowFrame` component owns the timer, current scene index, paused state, image rendering, on-screen text overlay, and progress bar. Each of the 8 existing video previews wraps it in their own platform chrome (avatars, side icons, captions, etc.). All 8 video previews already exist — this work only adds the slideshow behavior; no preview component is created from scratch.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, `lucide-react`.

**Spec:** [docs/superpowers/specs/2026-04-30-video-preview-slideshow-design.md](../specs/2026-04-30-video-preview-slideshow-design.md)

**Spec correction**: The spec assumed YouTubeLongVideo, TwitterVideoTweet, LinkedInVideo, and FacebookReel didn't exist yet and would need to be built. They already exist (see `frontend/src/components/library/previews/PreviewRegistry.tsx`). This plan therefore only updates them, doesn't create them.

---

## Task 1: Create the `VideoSlideshowFrame` component

**Files:**
- Create: `frontend/src/components/library/previews/VideoSlideshowFrame.tsx`

- [ ] **Step 1: Create the file**

`frontend/src/components/library/previews/VideoSlideshowFrame.tsx`:

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
```

- [ ] **Step 2: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent (no errors). The component imports `SceneLike` from the existing `VisualScriptScenes.tsx`.

- [ ] **Step 3: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/library/previews/VideoSlideshowFrame.tsx
git commit -m "feat(library): add VideoSlideshowFrame component for video previews"
```

---

## Task 2: Wire `VideoSlideshowFrame` into the 9:16 video previews

**Files:**
- Modify: `frontend/src/components/library/previews/InstagramReels.tsx`
- Modify: `frontend/src/components/library/previews/InstagramStory.tsx`
- Modify: `frontend/src/components/library/previews/TikTokVideo.tsx`
- Modify: `frontend/src/components/library/previews/YouTubeShorts.tsx`
- Modify: `frontend/src/components/library/previews/FacebookPost.tsx` (the `FacebookReel` named export)

Each of these renders a 9:16 black frame with a centered play icon as the "video preview". Replace that frame with `<VideoSlideshowFrame>`; move the existing chrome (brand info, side icons, bottom caption block) into the children slot. The `<VisualScriptScenes>` block below the frame stays as-is.

- [ ] **Step 1: Update `InstagramReels.tsx`**

In `frontend/src/components/library/previews/InstagramReels.tsx`, replace the existing 9:16 frame block (the one starting `<div className="relative bg-gray-900 rounded-2xl overflow-hidden mx-auto" style={{ maxWidth: 340, aspectRatio: "9/16" }}>` and ending at its closing `</div>`) with:

```tsx
<VideoSlideshowFrame
  scenes={scenes}
  aspectRatio="9/16"
  accentBg="bg-pink-500"
  maxWidth={340}
>
  {/* Top: Brand info */}
  <div className="absolute top-4 left-4 right-12 flex items-center gap-2 z-10">
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
      {brandName.charAt(0).toUpperCase()}
    </div>
    <p className="text-white text-sm font-semibold truncate">{brandSlug}</p>
  </div>

  {/* Right side icons (decorative) */}
  <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
    <div className="flex flex-col items-center">
      <Heart size={24} className="text-white" />
      <span className="text-white text-[10px] mt-0.5">12.3k</span>
    </div>
    <div className="flex flex-col items-center">
      <MessageCircle size={24} className="text-white" />
      <span className="text-white text-[10px] mt-0.5">234</span>
    </div>
    <div className="flex flex-col items-center">
      <Send size={24} className="text-white" />
      <span className="text-white text-[10px] mt-0.5">Share</span>
    </div>
  </div>

  {/* Bottom: Caption + music */}
  <div className="absolute bottom-4 left-4 right-12 z-10 space-y-2">
    <p className="text-white text-xs font-semibold">{brandSlug}</p>
    {hook && <p className="text-white text-xs line-clamp-2">{hook}</p>}
    <div className="flex items-center gap-1.5">
      <Music size={12} className="text-white" />
      <p className="text-white text-[10px]">Original Audio</p>
    </div>
  </div>
</VideoSlideshowFrame>
```

Add the import at the top of the file:

```tsx
import { VideoSlideshowFrame } from "./VideoSlideshowFrame";
```

You can also drop the `Play` import from `lucide-react` since the static play icon is no longer rendered here (`VideoSlideshowFrame` owns it). But if other parts of the file use `Play`, leave it. Spot-check after editing.

- [ ] **Step 2: Update `InstagramStory.tsx`**

Read the file first to know its exact frame structure:

```bash
sed -n '1,140p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/InstagramStory.tsx
```

`InstagramStory` is routed for both `story_image` AND `story_video`. The video case has scenes; the image case has frames. The component likely branches on whether `scenes.length > 0` or similar.

Apply the same swap pattern: where the component currently renders the 9:16 black frame with a play overlay (the video-case branch), replace with `<VideoSlideshowFrame scenes={scenes} aspectRatio="9/16" accentBg="bg-pink-500" maxWidth={340}>`. Move the existing in-frame chrome into the children slot. The image-case branch (story_image, no scenes) is **unchanged** — that's a static post, not a video.

If the component renders just one frame regardless of type, only swap when scenes are present. Concretely: if the existing JSX is unconditional, wrap the `<VideoSlideshowFrame>` swap in `scenes.length > 0 ? <slideshow> : <existing static>` to avoid breaking the image case.

- [ ] **Step 3: Update `TikTokVideo.tsx`**

Same swap pattern. TikTok uses a 9:16 frame with chrome (brand info top, side icons right, caption bottom). Use `accentBg="bg-red-500"`. Read the file first to identify the frame block:

```bash
sed -n '1,82p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/TikTokVideo.tsx
```

Replace the 9:16 frame block with `<VideoSlideshowFrame scenes={scenes} aspectRatio="9/16" accentBg="bg-red-500" maxWidth={340}>` containing the existing chrome as children.

- [ ] **Step 4: Update `YouTubeShorts.tsx`**

Same swap, accent `bg-red-500`. Read the file:

```bash
sed -n '1,87p' /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/YouTubeShorts.tsx
```

Replace the 9:16 frame block with the slideshow wrapper. Move existing in-frame chrome (channel handle, like/dislike/comment counts, bottom subscribe button row, etc.) into children.

- [ ] **Step 5: Update `FacebookReel` in `FacebookPost.tsx`**

`FacebookPost.tsx` exports several variants; we only touch the `FacebookReel` function. Read it:

```bash
grep -n "export function FacebookReel" /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/FacebookPost.tsx
```

Then locate the 9:16 frame block inside that function and replace it with `<VideoSlideshowFrame scenes={scenes} aspectRatio="9/16" accentBg="bg-blue-600" maxWidth={340}>` containing the existing chrome. The other Facebook variants in the same file (`FacebookFeedPost`, `FacebookCarouselAd`, `FacebookStory`) stay untouched — they're not video formats.

- [ ] **Step 6: Type-check + smoke build**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent. If TypeScript complains about `scenes` not being defined inside `FacebookReel` or `InstagramStory`, ensure those components extract scenes via `extractScenes(sections, content)` from `VisualScriptScenes.tsx` (the existing pattern in `InstagramReels.tsx`). Add the `import { VideoSlideshowFrame } from "./VideoSlideshowFrame";` at the top of each modified file.

- [ ] **Step 7: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/library/previews/InstagramReels.tsx \
        frontend/src/components/library/previews/InstagramStory.tsx \
        frontend/src/components/library/previews/TikTokVideo.tsx \
        frontend/src/components/library/previews/YouTubeShorts.tsx \
        frontend/src/components/library/previews/FacebookPost.tsx
git commit -m "feat(library): wire VideoSlideshowFrame into 9:16 video previews"
```

---

## Task 3: Wire `VideoSlideshowFrame` into the 16:9 video previews

**Files:**
- Modify: `frontend/src/components/library/previews/YouTubeLongVideo.tsx`
- Modify: `frontend/src/components/library/previews/TwitterVideoTweet.tsx`
- Modify: `frontend/src/components/library/previews/LinkedInPost.tsx` (the `LinkedInVideo` named export)

Same pattern as Task 2 but with `aspectRatio="16/9"`. These previews wrap the video frame inside platform chrome (tweet card, LinkedIn post, YouTube watch page); the chrome lives outside the frame, the slideshow goes inside.

- [ ] **Step 1: Update `YouTubeLongVideo.tsx`**

Read the file:

```bash
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/YouTubeLongVideo.tsx
```

Locate the 16:9 frame block (currently `<div className="relative bg-black rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}>` per the file at line 24). Replace with:

```tsx
<VideoSlideshowFrame
  scenes={scenes}
  aspectRatio="16/9"
  accentBg="bg-red-600"
  rounded="rounded-xl"
  maxWidth={640}
>
  {/* Existing chrome inside the frame, if any (typically nothing for YouTube) */}
</VideoSlideshowFrame>
```

The `maxWidth={640}` is wider than the 9:16 default because 16:9 fills horizontally. If the existing component already constrains the frame to a wider width via parent CSS, omit `maxWidth` — let the parent dictate.

If `scenes` isn't already extracted, add `const scenes = extractScenes(sections, content);` near the top of the function and `import { extractScenes } from "./VisualScriptScenes";` at the top of the file. Also add `import { VideoSlideshowFrame } from "./VideoSlideshowFrame";`.

- [ ] **Step 2: Update `TwitterVideoTweet.tsx`**

Read the file:

```bash
cat /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/TwitterVideoTweet.tsx
```

Locate the 16:9 block (at line 47 per current state). Replace with:

```tsx
<VideoSlideshowFrame
  scenes={scenes}
  aspectRatio="16/9"
  accentBg="bg-sky-500"
  rounded="rounded-xl"
>
  {/* Existing chrome inside the frame, if any */}
</VideoSlideshowFrame>
```

Same pattern: ensure `scenes` is extracted, add the imports.

- [ ] **Step 3: Update `LinkedInVideo` in `LinkedInPost.tsx`**

`LinkedInPost.tsx` exports several variants; only touch `LinkedInVideo`. Read:

```bash
grep -n "export function LinkedInVideo" /Users/bellinnn/Documents/projects/fce/frontend/src/components/library/previews/LinkedInPost.tsx
```

Then read that function block. Locate its 16:9 video frame and replace with:

```tsx
<VideoSlideshowFrame
  scenes={scenes}
  aspectRatio="16/9"
  accentBg="bg-indigo-700"
  rounded="rounded-xl"
>
  {/* Existing chrome inside the frame, if any */}
</VideoSlideshowFrame>
```

Same imports/extraction. Other LinkedIn variants in the same file (`LinkedInPost`, `LinkedInCarouselPost`, `LinkedInArticle`) stay untouched.

- [ ] **Step 4: Type-check**

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
bunx tsc -b 2>&1 | tail -5
```

Expected: silent.

- [ ] **Step 5: Commit**

```bash
cd /Users/bellinnn/Documents/projects/fce
git add frontend/src/components/library/previews/YouTubeLongVideo.tsx \
        frontend/src/components/library/previews/TwitterVideoTweet.tsx \
        frontend/src/components/library/previews/LinkedInPost.tsx
git commit -m "feat(library): wire VideoSlideshowFrame into 16:9 video previews"
```

---

## Task 4: Manual smoke test

**Files:**
- No file changes.

- [ ] **Step 1: Restart the frontend dev server (if needed)**

Vite HMR usually swaps the components live, but if anything looks stale:

```bash
cd /Users/bellinnn/Documents/projects/fce/frontend
# Find the existing Vite process if any:
pgrep -f "vite"
# Then kill + restart, or just hard-refresh the browser tab.
```

- [ ] **Step 2: Verify each of the 8 video formats**

In the browser, open Content Library and find existing rows for each video format. If a particular format isn't present, generate fresh content for it.

For each row, click to open the preview and verify:

| Format | Aspect | Accent color |
|---|---|---|
| Instagram Reels | 9:16 | pink |
| Instagram Story (video) | 9:16 | pink |
| TikTok Video | 9:16 | red |
| YouTube Shorts | 9:16 | red |
| Facebook Reel | 9:16 | blue |
| YouTube Long Video | 16:9 | red |
| Twitter/X Video Tweet | 16:9 | sky |
| LinkedIn Video | 16:9 | indigo |

For each, verify:
- Frame auto-cycles through the scenes' reference images.
- A thin progress bar at the bottom of the frame fills as each scene plays, in the accent color above.
- On-screen text (when present in a scene) overlays in the upper-third area.
- Clicking the frame pauses playback; a `❚❚` icon flashes briefly. Clicking again resumes.
- Pressing Space when the frame has keyboard focus also toggles pause.
- The `<VisualScriptScenes>` list below the frame is unchanged.

- [ ] **Step 3: Verify scene-without-image fallback**

If any scenes lack `referenceImageUrl`, the slideshow should render a dark gradient with the scene number and the scene's `onScreenText` (or `voiceover`) centered. Verify by opening a content row that has at least one scene without an image.

If you can't easily find such a row, you can simulate by editing a scene in dev tools to remove its `referenceImageUrl` — but this is optional.

- [ ] **Step 4: Verify empty-scenes fallback**

Find an old content row that has zero scenes (some early-generation content, or content where scene-image generation never ran). The frame should render the original static play-icon overlay — no slideshow, no progress bar. This is the "graceful degradation" path.

- [ ] **Step 5: Verify the static-image previews are unchanged**

Sanity-check that we didn't accidentally break the non-video previews:
- Instagram Single Image, Carousel
- TikTok Carousel
- Twitter Tweet, Thread
- LinkedIn Post, Carousel Post, Article
- Facebook Feed Post, Carousel Ad, Story

These should look exactly as before.

- [ ] **Step 6: No commit**

If anything misbehaves, return to the relevant task.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `VideoSlideshowFrame` component (props, behavior, fallback) | Task 1 |
| Wire into Instagram Reels | Task 2 |
| Wire into Instagram Story | Task 2 |
| Wire into TikTok Video | Task 2 |
| Wire into YouTube Shorts | Task 2 |
| Wire into Facebook Reel | Task 2 |
| Wire into YouTube Long Video | Task 3 |
| Wire into Twitter/X Video Tweet | Task 3 |
| Wire into LinkedIn Video | Task 3 |
| Pause on click + Space | Task 1 (component implements this; smoke verifies) |
| Per-scene timing from `timeRange` | Task 1 |
| Progress bar | Task 1 |
| Scene-without-image fallback | Task 1 |
| Empty-scenes fallback | Task 1 (smoke in Task 4) |
| Existing `<VisualScriptScenes>` list unchanged | Tasks 2 + 3 (we don't touch it) |
| Manual smoke for all 8 formats | Task 4 |

All spec sections covered. Note: the spec talked about creating four "missing" video previews — they all already exist, so this plan only updates them. Documented at the top of the plan.

**Type / name consistency:**
- `VideoSlideshowFrame` is the component name in Task 1 and used identically in Tasks 2 and 3.
- `accentBg` prop is the same name across all uses.
- `aspectRatio` literal types (`"9/16" | "16/9"`) match across Tasks 1, 2, 3.
- `SceneLike` is imported from the existing `VisualScriptScenes.tsx` — no duplication.

**Placeholder scan:** No "TBD". A few "Existing chrome inside the frame, if any" placeholders appear in Task 3's snippets — those are honest gaps where the implementer reads the existing file to see what chrome (if any) lived inside the frame and moves it into the children slot. Not a plan failure; the existing chrome is in source code that the implementer reads on the spot.

---

## Execution Handoff

Plan complete and saved to [docs/superpowers/plans/2026-04-30-video-preview-slideshow.md](2026-04-30-video-preview-slideshow.md). Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — run tasks directly in this session.

Which approach?
