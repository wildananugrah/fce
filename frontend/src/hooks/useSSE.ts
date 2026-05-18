import { useEffect, useRef } from "react";
import { getAccessToken, refreshAccessToken } from "../services/api";

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
  // Brand brain auto-refresh from references
  "brand_brain_updated",
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

// EventSource doesn't surface the HTTP status of a failure — `onerror` just
// fires. We treat any error after a successful connect as either a network
// blip OR an expired token; refresh once before reconnecting, and if the
// refresh fails (no refresh cookie / user logged out) we stop trying.
const RECONNECT_MS = 3000;

export function useSSE(onEvent: (event: SSEEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async (forceRefresh = false) => {
      if (destroyed) return;

      let token = getAccessToken();
      if (forceRefresh || !token) {
        token = await refreshAccessToken();
      }
      if (destroyed) return;
      if (!token) {
        // No valid token and refresh failed (user logged out, refresh cookie
        // expired, etc.) — stop reconnecting. The next call to useSSE on
        // login will start a fresh cycle.
        return;
      }

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
        eventSourceRef.current = null;
        if (destroyed) return;
        // Refresh the token before reconnecting. If we don't, an expired
        // access token causes a 401 every RECONNECT_MS forever — that was
        // the source of the /api/sse 401 spam in the backend logs.
        reconnectTimer = setTimeout(() => connect(true), RECONNECT_MS);
      };
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);
}
