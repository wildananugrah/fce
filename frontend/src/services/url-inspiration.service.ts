import { api } from "./api";

export interface InspirationSummary {
  angle: string;
  tone: string;
  keyPoints: string[];
  format: string;
  hashtags?: string[];
  engagementSignal?: string;
}

export interface InspirationResult {
  url: string;
  kind: string;
  summary: InspirationSummary | null;
  status: "cached" | "scraped" | "fallback" | "failed";
  error?: string;
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
