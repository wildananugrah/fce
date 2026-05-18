import { useState, useRef, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useHeaderSlotContent } from "../../contexts/HeaderSlotContext";
import {
  Search,
  CalendarDays,
  Table as TableIcon,
  LayoutGrid,
  Sparkles,
  HelpCircle,
  X,
} from "lucide-react";

interface ViewOption {
  value: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
}

interface RouteConfig {
  title: string;
  showSearch: boolean;
  showGenerate: boolean;
  viewOptions?: ViewOption[];
  defaultView?: string;
  help: { title: string; body: string };
}

const ROUTE_CONFIG: Record<string, RouteConfig> = {
  "/": {
    title: "Dashboard",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Dashboard",
      body: "Overview of your workspace's content activity, recent generations, and AI usage. Use it to quickly see what's happening across your projects.",
    },
  },
  "/planner": {
    title: "Planner",
    showSearch: false,
    showGenerate: true,
    viewOptions: [
      { value: "calendar", icon: CalendarDays, label: "Calendar" },
      { value: "list", icon: TableIcon, label: "List" },
    ],
    defaultView: "calendar",
    help: {
      title: "Planner",
      body: "Plan and schedule your content topics. Calendar view organizes topics by date; List view gives a compact overview. Drag topics between dates to reschedule.",
    },
  },
  "/brands": {
    title: "Brand Brain",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Brand Brain",
      body: "Define your brand's personality, tone, target audience, and messaging rules. The AI uses this configuration to generate consistently on-brand content.",
    },
  },
  "/products": {
    title: "Product Brain",
    showSearch: true,
    showGenerate: true,
    help: {
      title: "Product Brain",
      body: "Manage your products and configure their AI context — USP, RTB, benefits, and target audience. Content is always generated against a product's brain configuration.",
    },
  },
  "/topics": {
    title: "Topic Generator",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Topic Generator",
      body: "Generate content topic ideas for your brand. Select a brand, set your parameters, and AI will suggest relevant topics for your content calendar.",
    },
  },
  "/generate": {
    title: "Content Generator",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Content Generator",
      body: "Generate platform-specific content from your brand and product context. Choose a topic, platform, and content type, then AI creates the copy.",
    },
  },
  "/campaigns": {
    title: "Campaign Generator",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Campaign Generator",
      body: "Plan and generate full content campaigns. Define objectives, timeframes, and platforms for a cohesive set of content aligned to your brand strategy.",
    },
  },
  "/topic-library": {
    title: "Topic Library",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Topic Library",
      body: "View and manage all your generated topics. Filter by brand, platform, or status. Approve topics to move them into your content pipeline.",
    },
  },
  "/content-library": {
    title: "Content Library",
    showSearch: true,
    showGenerate: true,
    viewOptions: [
      { value: "table", icon: TableIcon, label: "Table" },
      { value: "grid", icon: LayoutGrid, label: "Grid" },
    ],
    defaultView: "table",
    help: {
      title: "Content Library",
      body: "Review and manage all generated content. Move items through the workflow: Draft → In Review → Approved or Rejected. Use bulk actions to manage multiple items at once.",
    },
  },
  "/learning": {
    title: "Learning Center",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Learning Center",
      body: "Resources, guides, and best practices for getting the most out of Floothink Content Engine.",
    },
  },
  "/research": {
    title: "Research Hub",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Research Hub",
      body: "Research tools to gather insights and inspiration for your content strategy.",
    },
  },
  "/competitor-analyzer": {
    title: "Competitor Analyzer",
    showSearch: false,
    showGenerate: true,
    help: {
      title: "Competitor Analyzer",
      body: "Analyze competitor content on TikTok and other platforms. Identify viral strategies, hooks, and retention mechanisms to inform your own content creation.",
    },
  },
  "/workspace-settings": {
    title: "Workspace Settings",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Workspace Settings",
      body: "Manage workspace members, configure AI providers, set up integrations, and restore archived content from the Trash.",
    },
  },
  "/settings": {
    title: "Profile Settings",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Profile Settings",
      body: "Update your account information, email, password, and personal preferences.",
    },
  },
  "/admin": {
    title: "Admin",
    showSearch: false,
    showGenerate: false,
    help: {
      title: "Admin Console",
      body: "Superadmin controls for managing all workspaces, users, and system-wide configuration.",
    },
  },
};

const FALLBACK_CONFIG: RouteConfig = {
  title: "",
  showSearch: false,
  showGenerate: true,
  help: { title: "Help", body: "" },
};

function resolveConfig(pathname: string): RouteConfig {
  if (ROUTE_CONFIG[pathname]) return ROUTE_CONFIG[pathname];
  const prefix = Object.keys(ROUTE_CONFIG)
    .filter((k) => k !== "/" && pathname.startsWith(k + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? ROUTE_CONFIG[prefix] : FALLBACK_CONFIG;
}

interface GlobalHeaderProps {
  onGenerateClick?: () => void;
}

export function GlobalHeader({ onGenerateClick }: GlobalHeaderProps = {}) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  const slot = useHeaderSlotContent();

  const config = resolveConfig(location.pathname);
  const currentView = searchParams.get("view") ?? config.defaultView ?? "";
  const searchQuery = searchParams.get("q") ?? "";

  // Close help popover on outside pointer-down
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Auto-focus search input when expanded
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // Reset UI state on route change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchOpen(false);
    setHelpOpen(false);
  }, [location.pathname]);

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  function handleViewChange(view: string) {
    updateParam("view", view);
  }

  function handleSearchChange(q: string) {
    updateParam("q", q || null);
  }

  function handleSearchClose() {
    setSearchOpen(false);
    updateParam("q", null);
  }

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 shrink-0 z-20">
      {/* Page title */}
      <h1 className="text-sm font-semibold text-gray-900 shrink-0">{config.title}</h1>

      {/* Slot — contextual controls injected by the active page.
          justify-end keeps Products/Library items flush-left of the permanent
          controls; Planner wraps its own content in flex-1 justify-center. */}
      {slot ? (
        <div className="flex-1 flex items-center justify-end min-w-0 overflow-hidden">{slot}</div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Right-side controls */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search — expanding input */}
        {config.showSearch &&
          (searchOpen ? (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search..."
                  className="w-52 pl-8 pr-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") handleSearchClose();
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleSearchClose}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-1.5 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 transition-colors"
              title="Search"
            >
              <Search size={16} />
            </button>
          ))}

        {/* View switcher */}
        {config.viewOptions && config.viewOptions.length > 0 && (
          <div className="inline-flex rounded-full border border-gray-200 bg-gray-50 p-0.5">
            {config.viewOptions.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleViewChange(value)}
                title={label}
                className={`p-1.5 rounded-full transition-colors ${
                  currentView === value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
        )}

        {/* Generate button */}
        {config.showGenerate && (
          <button
            type="button"
            onClick={onGenerateClick}
            className="flex items-center gap-1.5 bg-yellow-400 text-black text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-yellow-300 transition-colors"
          >
            <Sparkles size={13} />
            Generate
          </button>
        )}

        {/* Help popover */}
        <div className="relative" ref={helpRef}>
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            title="Page help"
          >
            <HelpCircle size={16} />
          </button>
          {helpOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-900">{config.help.title}</h3>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(false)}
                    className="text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 p-0.5 transition-colors -mt-0.5 -mr-0.5"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{config.help.body}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
