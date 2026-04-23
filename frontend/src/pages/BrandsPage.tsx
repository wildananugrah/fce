import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2,
  Globe,
  Palette,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Mic2,
  Dna,
  Target,
  CircleDot,
} from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { NewBrandBrainDrawer } from "../components/brands/NewBrandBrainDrawer";

interface Brand {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  websiteUrl: string | null;
  status: string;
  brainVersions?: BrainVersion[];
}

interface BrainVersion {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  isActive: boolean;
  personality?: string | null;
  tone?: string | null;
  audiencePersonas?: unknown;
  values?: string[];
  messagingRules?: { do?: string[]; dont?: string[] };
  vocabulary?: {
    preferred?: string[];
    avoided?: string[];
    contentLanguage?: string;
    summary?: string;
    brandPromise?: string;
    usp?: string;
    contentPillars?: string[];
    marketingStrategy?: string;
  };
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

export function BrandsPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (brandId: string, brandName: string) => {
    if (!activeWorkspace) return;
    if (
      !window.confirm(
        `Move "${brandName}" to Trash? Its products, topics, and content will be hidden too. You can restore it within 30 days from Workspace Settings → Trash.`,
      )
    )
      return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`, {
        method: "DELETE",
      });
      showToast("Brand moved to Trash", "success");
      loadBrands();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete brand", "error");
    }
  };

  const loadBrands = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const data = await api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`);
      setBrands(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load brands", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to manage brands.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // ── Empty state: no brand in this project ─────────────────────────
  if (brands.length === 0) {
    return (
      <div className="p-6">
        <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-10 text-center mt-12">
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Palette size={24} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Set up this project's brand
          </h1>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            Your brand brain powers every generated topic and post.{" "}
            <span className="text-gray-700">{activeProject?.name ?? "This project"}</span>{" "}
            doesn't have a brand yet — create one to get started.
          </p>
          <Button onClick={() => navigate("/brands/new")}>
            <Sparkles size={14} className="mr-1.5" />
            Create Brand
          </Button>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── Data state: exactly one brand ─────────────────────────────────
  const brand = brands[0];
  const brain = brand.brainVersions?.[0];
  const vocab = brain?.vocabulary ?? {};
  const rules = brain?.messagingRules ?? {};
  const audience = Array.isArray(brain?.audiencePersonas)
    ? (brain.audiencePersonas as Array<{ name?: string; traits?: string[] }>)
    : [];
  const values = Array.isArray(brain?.values) ? brain.values : [];
  const pillars = vocab.contentPillars ?? [];
  const platforms = vocab.preferred ?? [];
  const dos = rules.do ?? [];
  const donts = rules.dont ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Brand hero header */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-start gap-5">
        <div className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shrink-0">
          {brand.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900 truncate">{brand.name}</h1>
            {brand.category && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                {brand.category}
              </span>
            )}
          </div>
          {brand.websiteUrl && (
            <div className="flex items-center gap-1.5 group/url">
              <Globe size={12} className="text-gray-400 shrink-0" />
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 truncate hover:underline"
              >
                {brand.websiteUrl}
              </a>
              <button
                type="button"
                onClick={() => handleCopyUrl(brand.websiteUrl!)}
                className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                title="Copy URL"
                aria-label="Copy website URL"
              >
                {copiedUrl === brand.websiteUrl ? (
                  <Check size={12} className="text-green-500" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                title="Open in new tab"
                aria-label="Open website in new tab"
              >
                <ExternalLink size={12} />
              </a>
            </div>
          )}
          {vocab.summary && (
            <p className="text-sm text-gray-700 leading-relaxed max-w-2xl">{vocab.summary}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setSelectedBrand(brand)}>
            <Pencil size={14} className="mr-1.5" />
            Edit
          </Button>
          <button
            onClick={() => handleDelete(brand.id, brand.name)}
            className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
            title="Delete brand"
            aria-label="Delete brand"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Brain sections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personality & Tone */}
        <SectionCard
          icon={<Mic2 size={16} className="text-gray-400" />}
          title="Personality & Tone"
          empty={!brain?.personality && !brain?.tone && !vocab.contentLanguage}
          emptyLabel="No voice set"
        >
          <DefinitionRow label="Personality" value={brain?.personality} />
          <DefinitionRow label="Tone" value={brain?.tone} />
          <DefinitionRow label="Language" value={vocab.contentLanguage} />
          {platforms.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Platforms</p>
              <div className="flex flex-wrap gap-1">
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded-full"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Audience & Values */}
        <SectionCard
          icon={<Dna size={16} className="text-gray-400" />}
          title="Audience & Values"
          empty={audience.length === 0 && values.length === 0 && !vocab.brandPromise && !vocab.usp}
          emptyLabel="No brand DNA set"
        >
          {audience.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Audience</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                {audience[0]?.traits?.join(", ") ?? audience[0]?.name ?? ""}
              </p>
            </div>
          )}
          {values.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Values</p>
              <div className="flex flex-wrap gap-1">
                {values.map((v) => (
                  <span
                    key={v}
                    className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-700 rounded"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          )}
          <DefinitionRow label="Brand Promise" value={vocab.brandPromise} />
          <DefinitionRow label="Unique Selling Point" value={vocab.usp} />
        </SectionCard>

        {/* Content Strategy */}
        <SectionCard
          icon={<Target size={16} className="text-gray-400" />}
          title="Content Strategy"
          empty={pillars.length === 0 && !vocab.marketingStrategy}
          emptyLabel="No strategy set"
        >
          {pillars.length > 0 && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
                Pillars ({pillars.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {pillars.map((p) => (
                  <span
                    key={p}
                    className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}
          <DefinitionRow label="Marketing Strategy" value={vocab.marketingStrategy} multiline />
        </SectionCard>

        {/* Messaging Rules */}
        <SectionCard
          icon={<CircleDot size={16} className="text-gray-400" />}
          title="Messaging Rules"
          empty={dos.length === 0 && donts.length === 0}
          emptyLabel="No rules set"
        >
          {dos.length > 0 && (
            <div>
              <p className="text-[10px] text-green-700 uppercase tracking-wider mb-1">Do's ({dos.length})</p>
              <ul className="text-xs text-gray-700 space-y-0.5">
                {dos.slice(0, 3).map((d) => (
                  <li key={d} className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-green-500 mt-1.5 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
                {dos.length > 3 && <li className="text-gray-400">+{dos.length - 3} more</li>}
              </ul>
            </div>
          )}
          {donts.length > 0 && (
            <div>
              <p className="text-[10px] text-red-600 uppercase tracking-wider mb-1">Don'ts ({donts.length})</p>
              <ul className="text-xs text-gray-700 space-y-0.5">
                {donts.slice(0, 3).map((d) => (
                  <li key={d} className="flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-red-500 mt-1.5 shrink-0" />
                    <span>{d}</span>
                  </li>
                ))}
                {donts.length > 3 && <li className="text-gray-400">+{donts.length - 3} more</li>}
              </ul>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Edit drawer — entry point is the hero's Edit button */}
      <NewBrandBrainDrawer
        isOpen={!!selectedBrand}
        onClose={() => setSelectedBrand(null)}
        workspaceId={activeWorkspace.id}
        projectId={activeProject?.id}
        onCreated={loadBrands}
        editBrand={selectedBrand}
      />

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Small presentational helpers ────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
  empty,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      {empty ? (
        <p className="text-xs text-gray-400 italic">{emptyLabel ?? "Not yet configured."}</p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  );
}

function DefinitionRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-700 ${multiline ? "leading-relaxed" : "truncate"}`}>{value}</p>
    </div>
  );
}
