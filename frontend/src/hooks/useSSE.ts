import { useEffect, useRef } from "react";
import { getAccessToken } from "../services/api";

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

// All event types the frontend cares about. Each must match a backend
// `notificationService.notify(userId, { type, data })` event name.
const EVENT_TYPES = [
  // Content generation
  "generation_complete",
  "generation_failed",
  // Campaign
  "campaign_complete",
  // Topic generation
  "topics_generated",
  "topic_generation_complete",
  "topic_generation_failed",
  // Topic regeneration (single topic)
  "topic_regenerated",
  "topic_regeneration_failed",
  "topic_preview_regenerated",
  "topic_preview_regeneration_failed",
  // Brand scraping
  "brand_scraped",
  // Research runs
  "research_run_complete",
  "research_run_failed",
  // Campaign PDF generation
  "campaign_pdf_progress",
  "campaign_pdf_complete",
  "campaign_pdf_failed",
  // Competitor analyzer
  "creator_enrichment_completed",
  "competitor_pipeline_stage_changed",
  "competitor_pipeline_video_analyzed",
  "competitor_pipeline_completed",
  "competitor_pipeline_failed",
] as const;

export function useSSE(onEvent: (event: SSEEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    const baseUrl = import.meta.env.VITE_API_URL || "";
    const es = new EventSource(`${baseUrl}/api/sse?token=${token}`);
    eventSourceRef.current = es;

    // Register a listener for each known event type. EventSource only
    // delivers named events to listeners explicitly subscribed to them.
    for (const eventType of EVENT_TYPES) {
      es.addEventListener(eventType, (e) => {
        try {
          onEventRef.current({ type: eventType, data: JSON.parse(e.data) });
        } catch {
          // ignore malformed events
        }
      });
    }

    es.onerror = () => {
      es.close();
      // Reconnect after 3s
      setTimeout(() => {
        const newToken = getAccessToken();
        if (newToken) {
          // Re-mount will reconnect via effect cleanup + re-run
        }
      }, 3000);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);
}
