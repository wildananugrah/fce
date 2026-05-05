import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../services/api";

export type AiMode = "openrouter" | "legacy";

interface SystemContextValue {
  aiMode: AiMode | null; // null while loading; defaults to legacy on error
  loading: boolean;
}

const SystemContext = createContext<SystemContextValue>({ aiMode: null, loading: true });

export function SystemProvider({ children }: { children: ReactNode }) {
  const [aiMode, setAiMode] = useState<AiMode | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ mode: AiMode }>("/api/system/ai-mode")
      .then((res) => setAiMode(res.mode))
      .catch(() => setAiMode("legacy")) // fail-closed to legacy
      .finally(() => setLoading(false));
  }, []);

  return (
    <SystemContext.Provider value={{ aiMode, loading }}>{children}</SystemContext.Provider>
  );
}

export function useSystemContext() {
  return useContext(SystemContext);
}
