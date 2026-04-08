import { createContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  avatarColor: string;
  avatarEmoji: string | null;
  role: string;
}

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  setActiveWorkspace: (ws: Workspace) => void;
  refresh: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActive] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Workspace[]>("/api/workspaces");
      setWorkspaces(data);
      // Restore from localStorage or pick first
      const savedId = localStorage.getItem("activeWorkspaceId");
      const saved = data.find((w) => w.id === savedId);
      if (saved) {
        setActive(saved);
      } else if (data.length > 0) {
        setActive(data[0]);
        localStorage.setItem("activeWorkspaceId", data[0].id);
      }
    } catch {
      // Not logged in or error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setWorkspaces([]);
      setActive(null);
      setIsLoading(false);
      return;
    }
    refresh();
  }, [authLoading, user, refresh]);

  const setActiveWorkspace = useCallback((ws: Workspace) => {
    setActive(ws);
    localStorage.setItem("activeWorkspaceId", ws.id);
  }, []);

  return (
    <WorkspaceContext.Provider value={{ workspaces, activeWorkspace, isLoading, setActiveWorkspace, refresh }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
