import { useState } from "react";
import { Outlet, Navigate, NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Palette,
  Package,
  Sparkles,
  Megaphone,
  Lightbulb,
  BookOpen,
  Library,
  Brain,
  GraduationCap,
  Settings,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  LogOut,
  Search,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Spinner } from "../ui/Spinner";
import { Modal } from "../ui/Modal";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { api } from "../../services/api";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  exact?: boolean;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Core",
    items: [
      { to: "/brands", label: "Brand Brain", icon: Palette },
      { to: "/products", label: "Product Brain", icon: Package },
    ],
  },
  {
    label: "Generate",
    items: [
      { to: "/topics", label: "Topic Generator", icon: Lightbulb },
      { to: "/generate", label: "Content Generator", icon: Sparkles },
      { to: "/campaigns", label: "Campaign Generator", icon: Megaphone },
    ],
  },
  {
    label: "Manage",
    items: [
      { to: "/topic-library", label: "Topic Library", icon: BookOpen },
      { to: "/content-library", label: "Content Library", icon: Library },
      { to: "/skills", label: "AI Skills", icon: Brain },
      { to: "/learning", label: "Learning Center", icon: GraduationCap },
    ],
  },
  {
    label: "Research",
    items: [
      { to: "/research", label: "Research Hub", icon: Search },
    ],
  },
];

export function AppShell() {
  const { user, isLoading: authLoading, logout } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace, isLoading: wsLoading, refresh } = useWorkspace();
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
    `flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
      isActive
        ? "bg-[#333] text-white"
        : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
    } ${collapsed ? "justify-center" : ""}`;

  return (
    <div className="min-h-screen flex bg-[#f5f5f5]">
      <aside className={`${collapsed ? "w-[60px]" : "w-[220px]"} bg-[#111] flex flex-col shrink-0 h-screen sticky top-0 transition-[width] duration-200`}>
        {/* Logo */}
        <div className={`${collapsed ? "px-2" : "px-4"} py-4 border-b border-gray-800 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <span className="text-white font-bold text-sm tracking-tight truncate">FCE Dashboard</span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-[#1a1a1a]"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-4">
          {navSections.map((section, i) => (
            <div key={section.label ?? i}>
              {section.label && !collapsed && (
                <p className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
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
          ))}
        </nav>

        {/* Bottom nav — Settings */}
        <div className="px-3 pb-1 space-y-0.5">
          <NavLink to="/workspace-settings" className={navLinkClass} title={collapsed ? "Workspace Settings" : undefined}>
            <Settings size={14} />
            {!collapsed && <span>Workspace Settings</span>}
          </NavLink>
          <NavLink to="/settings" className={navLinkClass} title={collapsed ? "Profile Settings" : undefined}>
            <Settings size={14} />
            {!collapsed && <span>Profile Settings</span>}
          </NavLink>
          {user.isSuperadmin && (
            <NavLink to="/admin" className={navLinkClass} title={collapsed ? "Admin" : undefined}>
              <Shield size={14} />
              {!collapsed && <span>Admin</span>}
            </NavLink>
          )}
        </div>

        {/* Workspace Switcher */}
        <div className="border-t border-gray-800 px-3 py-3">
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
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1a1a1a] transition-colors text-left ${collapsed ? "justify-center" : ""}`}
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
                        <span className="text-xs text-gray-300 truncate flex-1">
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
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-lg overflow-hidden z-10">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => {
                        setActiveWorkspace(ws);
                        setWorkspaceSwitcherOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#333] transition-colors text-left"
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
                        style={{ backgroundColor: ws.avatarColor || "#444" }}
                      >
                        {ws.avatarEmoji || ws.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-300 truncate flex-1">{ws.name}</span>
                      {activeWorkspace?.id === ws.id && (
                        <Check size={12} className="text-white shrink-0" />
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setWorkspaceSwitcherOpen(false);
                      setCreateModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-[#333] transition-colors text-left border-t border-gray-700"
                  >
                    <Plus size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-400">Create workspace</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User email + logout */}
        <div className={`${collapsed ? "px-2" : "px-4"} py-3 border-t border-gray-800 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && <p className="text-gray-500 text-xs truncate flex-1">{user.email}</p>}
          <button
            onClick={logout}
            title={collapsed ? `Logout (${user.email})` : "Logout"}
            className={`text-gray-500 hover:text-white transition-colors ${collapsed ? "" : "ml-2"} shrink-0`}
          >
            <LogOut size={14} />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>

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
    </div>
  );
}
