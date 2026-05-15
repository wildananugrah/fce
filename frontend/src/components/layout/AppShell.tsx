import { useState } from "react";
import floothinkLogo from "../../assets/floothink-logo.png";
import floothinkIcon from "../../assets/floothink-icon.png";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import { GlobalHeader } from "./GlobalHeader";
import { TopicGeneratorSlider } from "../planner/TopicGeneratorSlider";
import { HeaderSlotProvider } from "../../contexts/HeaderSlotContext";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  CalendarDays,
  Palette,
  Package,
  Sparkles,
  Megaphone,
  Lightbulb,
  BookOpen,
  Library,
  GraduationCap,
  Settings,
  Briefcase,
  Users,
  ChevronDown,
  Menu,
  Check,
  Plus,
  LogOut,
  Search,
  LineChart,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useProject } from "../../hooks/useProject";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Spinner } from "../ui/Spinner";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { WelcomeModal } from "../onboarding/WelcomeModal";
import { GettingStartedChecklist } from "../onboarding/GettingStartedChecklist";

import type { MenuKey } from "../../contexts/ProjectContext";
import { isMenuEnabled, type MenuFlagKey } from "../../config/menu-flags";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /**
   * RBAC key — drives per-user visibility via menuAccess. Omit for items that
   * should always pass the RBAC check (e.g. Dashboard).
   */
  menuKey?: MenuKey;
  /**
   * Global flag key — drives the on/off toggle in frontend/src/config/menu-flags.ts.
   * Items without a `flagKey` are always shown when RBAC allows.
   */
  flagKey?: MenuFlagKey;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true, flagKey: "dashboard" },
    ],
  },
  {
    label: "Plan",
    items: [
      { to: "/planner", label: "Planner", icon: CalendarDays, menuKey: "planner", flagKey: "planner" },
    ],
  },
  {
    label: "Core",
    items: [
      { to: "/brands", label: "Brand Brain", icon: Palette, menuKey: "brand-brain", flagKey: "brand-brain" },
      { to: "/products", label: "Product Brain", icon: Package, menuKey: "product-brain", flagKey: "product-brain" },
    ],
  },
  {
    label: "Generate",
    items: [
      { to: "/topics", label: "Topic Generator", icon: Lightbulb, menuKey: "topic-generator", flagKey: "topic-generator" },
      { to: "/generate", label: "Content Generator", icon: Sparkles, menuKey: "content-generator", flagKey: "content-generator" },
      { to: "/campaigns", label: "Campaign Generator", icon: Megaphone, menuKey: "campaign-generator", flagKey: "campaign-generator" },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/topic-library", label: "Topic Library", icon: BookOpen, menuKey: "topic-library", flagKey: "topic-library" },
      { to: "/content-library", label: "Content Library", icon: Library, menuKey: "content-library", flagKey: "content-library" },
      { to: "/learning", label: "Learning Center", icon: GraduationCap, menuKey: "learning-center", flagKey: "learning-center" },
    ],
  },
  {
    label: "Research",
    items: [
      { to: "/research", label: "Research Hub", icon: Search, menuKey: "research-hub", flagKey: "research-hub" },
      { to: "/competitor-analyzer", label: "Competitor Analyzer", icon: LineChart, menuKey: "competitor-analyzer", flagKey: "competitor-analyzer" },
    ],
  },
];

export function AppShell() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace, isLoading: wsLoading, refresh } = useWorkspace();
  const {
    menuAccess,
    hasFullAccess,
    projects,
    activeProject,
    setActiveProject,
  } = useProject();
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [topicGeneratorOpen, setTopicGeneratorOpen] = useState(false);
  const canSeeMenu = (item: NavItem) => {
    // Global flag hides a menu for everyone, admins included.
    if (item.flagKey && !isMenuEnabled(item.flagKey)) return false;
    // No RBAC key → always-on for any signed-in user (e.g. Dashboard).
    if (!item.menuKey) return true;
    if (hasFullAccess) return true;
    return (menuAccess as string[]).includes(item.menuKey);
  };
  const canSeeWorkspaceSettings = hasFullAccess || Boolean(user?.isSuperadmin);
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("fce:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("fce:sidebar-collapsed", next ? "1" : "0");
      } catch {
        // ignore quota / disabled storage
      }
      // Close the workspace dropdown when collapsing so it doesn't linger off-screen
      if (next) setWorkspaceSwitcherOpen(false);
      return next;
    });
  };
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const handleCreateWorkspace = async () => {
    if (!newName.trim() || !newSlug.trim()) {
      setCreateError("Name and slug are required");
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      await api("/api/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), slug: newSlug.trim() }),
      });
      setCreateModalOpen(false);
      setNewName("");
      setNewSlug("");
      await refresh();
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create workspace");
    } finally {
      setCreating(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/landing" replace />;
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2.5 rounded-full text-xs font-medium transition-colors ${
      isActive
        ? "bg-black text-white"
        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    } ${collapsed ? "justify-center" : ""}`;

  return (
    <HeaderSlotProvider>
    <div className="h-screen overflow-hidden flex bg-[#f5f5f5]">
      <aside className={`${collapsed ? "w-[60px]" : "w-[220px]"} bg-white border-r border-gray-200 flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200`}>
        {/* Logo */}
        <div className={`h-14 ${collapsed ? "px-2" : "px-4"} border-b border-gray-200 flex items-center shrink-0 ${collapsed ? "justify-center" : "justify-between"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Expand sidebar"
              className="flex items-center focus:outline-none"
            >
              <img
                src={floothinkIcon}
                alt="Floothink"
                className="h-[22px] w-auto object-contain shrink-0"
              />
            </button>
          ) : (
            <>
              <img
                src={floothinkLogo}
                alt="Floothink"
                className="h-[22px] w-auto object-contain shrink-0"
              />
              <button
                type="button"
                onClick={toggleCollapsed}
                className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100 shrink-0"
                title="Collapse sidebar"
              >
                <Menu size={14} />
              </button>
            </>
          )}
        </div>

        {/* Project Switcher — hidden when there are no projects or sidebar is
             collapsed (saves vertical space; users can expand to switch). */}
        {!collapsed && projects.length > 0 && (
          <div className="px-3 pt-3">
            <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              Project
            </p>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProjectSwitcherOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-left"
                title={activeProject?.name}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />
                <span className="text-xs text-black truncate flex-1">
                  {activeProject?.name ?? "No project"}
                </span>
                <ChevronDown size={12} className="text-gray-500 shrink-0" />
              </button>

              {projectSwitcherOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 shadow-lg overflow-hidden z-10 max-h-60 overflow-y-auto">
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setActiveProject(p);
                        setProjectSwitcherOpen(false);
                      }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 transition-colors text-left ${
                        p.id === activeProject?.id ? "bg-gray-50" : ""
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-black shrink-0" />
                      <span className="text-xs text-black truncate flex-1">{p.name}</span>
                      {p.id === activeProject?.id && (
                        <Check size={12} className="text-black shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Main Navigation — filtered by the active project's menuAccess */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {navSections.map((section, i) => {
            const items = section.items.filter((item) => canSeeMenu(item));
            if (items.length === 0) return null;
            return (
              <div key={section.label ?? i}>
                {section.label && (
                  <div className="border-t border-gray-200 mb-3" />
                )}
                {section.label && !collapsed && (
                  <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    {section.label}
                  </p>
                )}
                <div className="space-y-1">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.exact}
                      className={navLinkClass}
                      title={collapsed ? item.label : undefined}
                    >
                      <item.icon size={14} />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Bottom nav — Settings */}
        <div className="px-3 pb-1 space-y-1">
          {canSeeWorkspaceSettings && (
            <NavLink to="/workspace-settings" className={navLinkClass} title={collapsed ? "Workspace Settings" : undefined}>
              <Briefcase size={14} />
              {!collapsed && <span>Workspace Settings</span>}
            </NavLink>
          )}
          <NavLink to="/settings" className={navLinkClass} title={collapsed ? "Profile Settings" : undefined}>
            <Settings size={14} />
            {!collapsed && <span>Profile Settings</span>}
          </NavLink>
          {user.isSuperadmin && (
            <NavLink to="/admin" className={navLinkClass} title={collapsed ? "User Settings" : undefined}>
              <Users size={14} />
              {!collapsed && <span>User Settings</span>}
            </NavLink>
          )}
        </div>

        {/* Workspace Switcher */}
        <div className="border-t border-gray-200 px-3 py-3">
          {wsLoading ? (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Spinner size="sm" />
              <span className="text-xs text-gray-500">Loading...</span>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => {
                  if (collapsed) {
                    toggleCollapsed();
                  } else {
                    setWorkspaceSwitcherOpen((o) => !o);
                  }
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 transition-colors text-left ${collapsed ? "justify-center" : ""}`}
                title={collapsed && activeWorkspace ? activeWorkspace.name : undefined}
              >
                {activeWorkspace ? (
                  <>
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: activeWorkspace.avatarColor || "#444" }}
                    >
                      {activeWorkspace.avatarEmoji || activeWorkspace.name.charAt(0).toUpperCase()}
                    </div>
                    {!collapsed && (
                      <>
                        <span className="text-xs text-black truncate flex-1">
                          {activeWorkspace.name}
                        </span>
                        <ChevronDown size={12} className="text-gray-500 shrink-0" />
                      </>
                    )}
                  </>
                ) : (
                  !collapsed && <span className="text-xs text-gray-500">No workspace</span>
                )}
                {!activeWorkspace && collapsed && (
                  <span className="text-xs text-gray-500">·</span>
                )}
              </button>

              {!collapsed && workspaceSwitcherOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-gray-200 shadow-lg overflow-hidden z-10">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setActiveWorkspace(ws);
                        setWorkspaceSwitcherOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 transition-colors text-left"
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
                        style={{ backgroundColor: ws.avatarColor || "#444" }}
                      >
                        {ws.avatarEmoji || ws.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-black truncate flex-1">{ws.name}</span>
                      {activeWorkspace?.id === ws.id && (
                        <Check size={12} className="text-gray-900 shrink-0" />
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setWorkspaceSwitcherOpen(false);
                      setCreateModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 transition-colors text-left border-t border-gray-200"
                  >
                    <Plus size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600">Create workspace</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User email + logout */}
        <div className={`${collapsed ? "px-2" : "px-4"} py-3 border-t border-gray-200 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && <p className="text-gray-500 text-xs truncate flex-1">{user.email}</p>}
          <button
            onClick={logout}
            title={collapsed ? `Logout (${user.email})` : "Logout"}
            className={`text-gray-500 hover:text-gray-900 transition-colors ${collapsed ? "" : "ml-2"} shrink-0`}
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <GlobalHeader onGenerateClick={() => setTopicGeneratorOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <TopicGeneratorSlider
        isOpen={topicGeneratorOpen}
        onClose={() => setTopicGeneratorOpen(false)}
        onSavedTopics={() => setTopicGeneratorOpen(false)}
      />

      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Workspace">
        <div className="space-y-4">
          <Input
            label="Name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
            }}
            placeholder="My Workspace"
          />
          <Input
            label="Slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="my-workspace"
          />
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateWorkspace} loading={creating}>Create</Button>
          </div>
        </div>
      </Modal>
      <WelcomeModal />
      <GettingStartedChecklist />
    </div>
    </HeaderSlotProvider>
  );
}
