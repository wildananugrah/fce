import { useEffect, useState } from "react";

export interface OpenRouterModel {
  id: string;
  name: string;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

let cachedModels: OpenRouterModel[] | null = null;
let inflight: Promise<OpenRouterModel[]> | null = null;

async function fetchModels(): Promise<OpenRouterModel[]> {
  if (cachedModels) return cachedModels;
  if (inflight) return inflight;
  inflight = fetch("https://openrouter.ai/api/v1/models")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ data: OpenRouterModel[] }>;
    })
    .then((j) => {
      cachedModels = j.data;
      return j.data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function refreshOpenRouterModels(): void {
  cachedModels = null;
}

export function useOpenRouterModels() {
  const [models, setModels] = useState<OpenRouterModel[] | null>(cachedModels);
  const [loading, setLoading] = useState(!cachedModels);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // useState(cachedModels) already initializes models; loading is initialized to !cachedModels.
    // Only kick off a fetch when the cache is empty.
    if (cachedModels) return;
    fetchModels()
      .then((data) => setModels(data))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return {
    models,
    loading,
    error,
    refresh: () => {
      refreshOpenRouterModels();
      setLoading(true);
      fetchModels()
        .then((data) => {
          setModels(data);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
        .finally(() => setLoading(false));
    },
  };
}
