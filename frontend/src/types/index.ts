export type ScrapeLanguage = "indonesian" | "english";

export interface User {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  isSuperadmin: boolean;
  defaultScrapeLanguage: ScrapeLanguage;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface ApiError {
  error: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  avatarColor: string;
  avatarEmoji: string | null;
  role: string;
}

export interface TonePreset {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
}

export interface VisualStyle {
  id: string;
  name: string;
  description: string | null;
  isGlobal: boolean;
}

export interface OutputSection {
	id: string;
	outputId: string;
	sectionType: "hook" | "caption" | "cta" | "hashtag" | "visual_direction" | "rationale";
	sectionOrder: number;
	contentText: string;
	createdAt: string;
	updatedAt: string;
}

export interface CampaignBrief {
  id: string;
  campaignId: string;
  objectiveDetail?: string;
  channelMix?: string[];
  mandatoryDeliverables?: string[];
  culturalContext?: string;
  trendContext?: string;
  competitiveContext?: string;
  kpiPreference?: Record<string, any>;
  toneDirection?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignChannelRole {
  id: string;
  channelCode: string;
  channelRole: string;
  priorityOrder: number;
}

export interface CampaignDeliverable {
  id: string;
  deliverableType: string;
  deliverableName: string;
  recommendedChannel?: string;
  funnelStage?: string;
  qtyRecommendation?: number;
}

export interface BrandDocument {
  id: string;
  brandId: string;
  productId?: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  extractionStatus: string;
  sourceType?: string;
  createdAt: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  contentText: string;
  retrievalTags?: string[];
}

export interface DashboardStats {
  brandCount: number;
  productCount: number;
  generationCount: number;
  campaignCount: number;
  apiUsageUsd: number;
  apiLimitUsd: number;
  recentGenerations: {
    id: string;
    platform: string;
    contentType: string;
    status: string;
    createdAt: string;
  }[];
}
