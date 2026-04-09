import type { ComponentType } from "react";
import { InstagramCarousel } from "./InstagramCarousel";
import { InstagramSingleImage } from "./InstagramSingleImage";
import { InstagramReels } from "./InstagramReels";
import { InstagramStory } from "./InstagramStory";
import { TikTokVideo } from "./TikTokVideo";
import { TikTokCarousel } from "./TikTokCarousel";
import { YouTubeLongVideo } from "./YouTubeLongVideo";
import { YouTubeShorts } from "./YouTubeShorts";
import { TwitterTweet } from "./TwitterTweet";
import { TwitterThread } from "./TwitterThread";
import { TwitterVideoTweet } from "./TwitterVideoTweet";
import { LinkedInPost, LinkedInCarouselPost, LinkedInVideo, LinkedInArticle } from "./LinkedInPost";
import { FacebookFeedPost, FacebookCarouselAd, FacebookReel, FacebookStory } from "./FacebookPost";
import { GenericPreview } from "./GenericPreview";

export interface PreviewProps {
  content: Record<string, unknown>;
  sections: {
    id: string;
    sectionType: string;
    sectionOrder: number;
    contentText: string;
  }[];
  brandName: string;
  productName?: string;
  contentTitle?: string;
  contentType: string;
  platform: string;
}

const PREVIEW_MAP: Record<string, ComponentType<PreviewProps>> = {
  // Instagram
  single_image: InstagramSingleImage,
  carousel: InstagramCarousel,
  reels: InstagramReels,
  story_image: InstagramStory,
  story_video: InstagramStory,

  // TikTok
  tiktok_video: TikTokVideo,
  tiktok_carousel: TikTokCarousel,

  // YouTube
  long_video: YouTubeLongVideo,
  youtube_shorts: YouTubeShorts,

  // Twitter/X
  single_tweet: TwitterTweet,
  thread: TwitterThread,
  video_tweet: TwitterVideoTweet,

  // LinkedIn
  single_post: LinkedInPost,
  carousel_post: LinkedInCarouselPost,
  linkedin_video: LinkedInVideo,
  article: LinkedInArticle,

  // Facebook
  feed_post: FacebookFeedPost,
  carousel_ad: FacebookCarouselAd,
  reel_short_video: FacebookReel,
  story: FacebookStory,
};

export function getPreviewComponent(contentType: string): ComponentType<PreviewProps> {
  return PREVIEW_MAP[contentType] ?? GenericPreview;
}
