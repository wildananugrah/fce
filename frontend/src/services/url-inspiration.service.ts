import { api } from "./api";

export interface InspirationSummary {
  angle: string;
  tone: string;
  keyPoints: string[];
  format: string;
  hashtags?: string[];
  engagementSignal?: string;
}

export interface MediaSkipped {
  reason:
    | "size cap exceeded"
    | "duration cap exceeded"
    | "duration unknown"
    | "fetch failed"
    | "analysis failed"
    | "video analysis requires Gemini";
  sizeMb?: number;
  durationSeconds?: number;
  capMb?: number;
  capSeconds?: number;
}

export interface InspirationMedia {
  hasVideo: boolean;
  durationSeconds?: number;
  sizeMb?: number;
  skipped?: MediaSkipped;
}

export interface InspirationResult {
  url: string;
  kind: string;
  summary: InspirationSummary | null;
  status: "cached" | "scraped" | "fallback" | "failed";
  error?: string;
  media?: InspirationMedia;
}

export const urlInspirationApi = {
  async preview(workspaceId: string, url: string): Promise<InspirationResult> {
    const res = await api<{ data: InspirationResult }>(
      `/api/workspaces/${workspaceId}/url-inspiration/preview`,
      {
        method: "POST",
        body: JSON.stringify({ url }),
      },
    );
    return ((res as any).data ?? res) as InspirationResult;
  },
};
