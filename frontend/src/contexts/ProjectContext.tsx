import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useWorkspace } from "../hooks/useWorkspace";

export type MenuKey =
  | "brand-brain"
  | "product-brain"
  | "topic-generator"
  | "content-generator"
  | "campaign-generator"
  | "topic-library"
  | "content-library"
  | "learning-center"
  | "research-hub";

export const ALL_MENU_KEYS: MenuKey[] = [
  "brand-brain",
  "product-brain",
  "topic-generator",
  "content-generator",
  "campaign-generator",
  "topic-library",
  "content-library",
  "learning-center",
  "research-hub",
];

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  _count?: { memberships: number; brands: number };
  /**
   * The caller's own membership in this project. `null` means the caller is a
   * workspace admin or superadmin — they bypass project membership entirely
   * and should be treated as having every menu + approver.
   */
  myMembership: { isApprover: boolean; menuAccess: MenuKey[] } | null;
}

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project | null;
  isLoading: boolean;
  /** true if current user bypasses project gating (superadmin or workspace admin). */
  hasFullAccess: boolean;
  /** Effective menu access in the active project (all menus when admin bypass). */
  menuAccess: MenuKey[];
  /** Effective approver flag in the active project (true when admin bypass). */
  isApprover: boolean;
  setActiveProject: (p: Project) => void;
  refresh: () => Promise<void>;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

const STORAGE_KEY_PREFIX = "activeProjectId:";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { activeWorkspace, isLoading: wsLoading } = useWorkspace();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActive] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasFullAccess = Boolean(
    user?.isSuperadmin || activeWorkspace?.role === "admin",
  );

  const refresh = useCallback(async () => {
    if (!activeWorkspace) {
      setProjects([]);
      setActive(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api<Project[]>(
        `/api/workspaces/${activeWorkspace.id}/projects`,
      );
      setProjects(data);
      const storageKey = `${STORAGE_KEY_PREFIX}${activeWorkspace.id}`;
      const savedId = localStorage.getItem(storageKey);
      const saved = data.find((p) => p.id === savedId);
      const next = saved ?? data[0] ?? null;
      setActive(next);
      if (next) localStorage.setItem(storageKey, next.id);
    } catch {
      setProjects([]);
      setActive(null);
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (authLoading || wsLoading) return;
    if (!user || !activeWorkspace) {
      setProjects([]);
      setActive(null);
      setIsLoading(false);
      return;
    }
    refresh();
  }, [authLoading, wsLoading, user, activeWorkspace, refresh]);

  const setActiveProject = useCallback(
    (p: Project) => {
      setActive(p);
      if (activeWorkspace) {
        localStorage.setItem(`${STORAGE_KEY_PREFIX}${activeWorkspace.id}`, p.id);
      }
    },
    [activeWorkspace],
  );

  const menuAccess: MenuKey[] = hasFullAccess
    ? ALL_MENU_KEYS
    : (activeProject?.myMembership?.menuAccess ?? []);

  const isApprover = hasFullAccess
    ? true
    : Boolean(activeProject?.myMembership?.isApprover);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        isLoading,
        hasFullAccess,
        menuAccess,
        isApprover,
        setActiveProject,
        refresh,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
