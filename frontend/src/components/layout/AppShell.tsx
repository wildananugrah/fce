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
  GraduationCap,
  Settings,
  Users,
  Shield,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useWorkspace } from "../../hooks/useWorkspace";
import { Spinner } from "../ui/Spinner";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/brands", label: "Brands", icon: Palette },
  { to: "/products", label: "Products", icon: Package },
  { to: "/generate", label: "Generate", icon: Sparkles },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/topics", label: "Topics", icon: Lightbulb },
  { to: "/topic-library", label: "Topic Library", icon: BookOpen },
  { to: "/library", label: "Library", icon: Library },
  { to: "/learning", label: "Learning", icon: GraduationCap },
];

const bottomNavItems = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/workspace-settings", label: "Workspace Settings", icon: Users },
];

export function AppShell() {
  const { user, isLoading: authLoading } = useAuth();
  const { workspaces, activeWorkspace, setActiveWorkspace, isLoading: wsLoading } = useWorkspace();
  const [workspaceSwitcherOpen, setWorkspaceSwitcherOpen] = useState(false);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
      isActive
        ? "bg-[#333] text-white"
        : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
    }`;

  return (
    <div className="min-h-screen flex bg-[#f5f5f5]">
      <aside className="w-[220px] bg-[#111] flex flex-col shrink-0 h-screen sticky top-0">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-gray-800">
          <span className="text-white font-bold text-sm tracking-tight">FCE Dashboard</span>
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={navLinkClass}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {/* Separator */}
          <div className="my-2 border-t border-gray-800" />

          {bottomNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={navLinkClass}>
              <item.icon size={14} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          {user.isSuperadmin && (
            <NavLink to="/admin" className={navLinkClass}>
              <Shield size={14} />
              <span>Admin</span>
            </NavLink>
          )}
        </nav>

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
                onClick={() => setWorkspaceSwitcherOpen((o) => !o)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#1a1a1a] transition-colors text-left"
              >
                {activeWorkspace ? (
                  <>
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
                      style={{ backgroundColor: activeWorkspace.avatarColor || "#444" }}
                    >
                      {activeWorkspace.avatarEmoji || activeWorkspace.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-xs text-gray-300 truncate flex-1">
                      {activeWorkspace.name}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-500">No workspace</span>
                )}
                <ChevronDown size={12} className="text-gray-500 shrink-0" />
              </button>

              {workspaceSwitcherOpen && workspaces.length > 0 && (
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
                </div>
              )}
            </div>
          )}
        </div>

        {/* User email */}
        <div className="px-4 py-3 border-t border-gray-800">
          <p className="text-gray-500 text-xs truncate">{user.email}</p>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
