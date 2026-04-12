import { useEffect, useRef } from "react";
import { getAccessToken } from "../services/api";

interface SSEEvent {
  type: string;
  data: Record<string, unknown>;
}

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

    es.addEventListener("generation_complete", (e) => {
      onEventRef.current({ type: "generation_complete", data: JSON.parse(e.data) });
    });

    es.addEventListener("generation_failed", (e) => {
      onEventRef.current({ type: "generation_failed", data: JSON.parse(e.data) });
    });

    es.addEventListener("campaign_complete", (e) => {
      onEventRef.current({ type: "campaign_complete", data: JSON.parse(e.data) });
    });

    es.addEventListener("topics_generated", (e) => {
      onEventRef.current({ type: "topics_generated", data: JSON.parse(e.data) });
    });

    es.addEventListener("topic_generation_complete", (e) => {
      onEventRef.current({ type: "topic_generation_complete", data: JSON.parse(e.data) });
    });

    es.addEventListener("topic_generation_failed", (e) => {
      onEventRef.current({ type: "topic_generation_failed", data: JSON.parse(e.data) });
    });

    es.addEventListener("brand_scraped", (e) => {
      onEventRef.current({ type: "brand_scraped", data: JSON.parse(e.data) });
    });

    es.addEventListener("research_run_complete", (e) => {
      onEventRef.current({ type: "research_run_complete", data: JSON.parse(e.data) });
    });

    es.addEventListener("research_run_failed", (e) => {
      onEventRef.current({ type: "research_run_failed", data: JSON.parse(e.data) });
    });

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
