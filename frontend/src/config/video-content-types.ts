// Must stay in sync with backend/src/config/content-formats.ts.
// Canonical content-type values that produce a visual script with per-scene
// reference images (rendered via VisualScriptTable).

export const VIDEO_CONTENT_TYPES = new Set<string>([
  "reels",
  "story_video",
  "tiktok_video",
  "long_video",
  "youtube_shorts",
  "video_tweet",
  "linkedin_video",
  "reel_short_video",
  "story",
]);

export function isVideoContentType(contentType: string): boolean {
  return VIDEO_CONTENT_TYPES.has(contentType);
}
