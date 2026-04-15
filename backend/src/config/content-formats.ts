// Centralised classification of canonical contentType values.
//
// Keep in sync with frontend/src/config/video-content-types.ts —
// both files must list the exact same set of video content types.

export const VIDEO_CONTENT_TYPES = new Set<string>([
	"reels", // instagram
	"story_video", // instagram
	"tiktok_video",
	"long_video", // youtube
	"youtube_shorts",
	"video_tweet", // twitter
	"linkedin_video",
	"reel_short_video", // facebook
	"story", // facebook (can be video or image)
]);

export const CAROUSEL_CONTENT_TYPES = new Set<string>([
	"carousel",
	"tiktok_carousel",
	"carousel_post",
	"carousel_ad",
	"thread",
]);

export const STORY_CONTENT_TYPES = new Set<string>(["story_image"]);

export type ContentFormatCategory = "single_image" | "carousel" | "video" | "story";

export function isVideoContentType(contentType: string): boolean {
	return VIDEO_CONTENT_TYPES.has(contentType);
}

export function getContentFormatCategory(contentType: string): ContentFormatCategory {
	if (VIDEO_CONTENT_TYPES.has(contentType)) return "video";
	if (CAROUSEL_CONTENT_TYPES.has(contentType)) return "carousel";
	if (STORY_CONTENT_TYPES.has(contentType)) return "story";
	return "single_image";
}
