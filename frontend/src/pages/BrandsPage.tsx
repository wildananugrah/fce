import { useState, useEffect, useCallback } from "react";
import { Trash2, Globe, Dna, Copy, ExternalLink, Check } from "lucide-react";
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
  messagingRules?: unknown;
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

// ---- Main Page ----
export function BrandsPage() {
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      // ignore
    }
  };

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Brands</h1>
        <Button onClick={() => setShowCreate(true)}>New Brand</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : brands.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">No brands yet. Create your first brand to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {brands.map((brand) => {
            const brain = brand.brainVersions?.[0];
            const pillars = brain?.vocabulary?.contentPillars ?? [];
            const platforms = brain?.vocabulary?.preferred ?? [];
            const language = brain?.vocabulary?.contentLanguage;
            const summary = brain?.vocabulary?.summary;

            return (
              <div
                key={brand.id}
                className="relative bg-white border border-gray-200 rounded-xl hover:border-gray-400 transition-colors overflow-hidden"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(brand.id, brand.name);
                  }}
                  className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded-md hover:bg-red-50 z-10"
                  title="Delete brand"
                >
                  <Trash2 size={14} />
                </button>

                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBrand(brand)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedBrand(brand);
                    }
                  }}
                  className="text-left w-full cursor-pointer"
                >
                  {/* Header */}
                  <div className="p-4 pb-2.5">
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {brand.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-black truncate">{brand.name}</p>
                        {brand.category && (
                          <p className="text-xs text-gray-500 truncate">{brand.category}</p>
                        )}
                      </div>
                    </div>

                    {/* Website URL */}
                    {brand.websiteUrl && (
                      <div className="flex items-center gap-1.5 mb-2 group/url">
                        <Globe size={12} className="text-gray-400 shrink-0" />
                        <a
                          href={brand.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-indigo-600 truncate hover:underline"
                        >
                          {brand.websiteUrl}
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyUrl(brand.websiteUrl!);
                          }}
                          className="ml-auto p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                          title="Copy URL"
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
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                          title="Open in new tab"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    )}

                    {/* Summary */}
                    {summary && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2.5 leading-relaxed">{summary}</p>
                    )}
                  </div>

                  {/* Brain DNA section */}
                  {brain && (
                    <div className="mx-4 mb-3 border border-gray-100 rounded-lg p-3 bg-gray-50/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Dna size={12} className="text-gray-400" />
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Brand DNA</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {brain.tone && (
                          <div>
                            <span className="text-[10px] text-gray-400">Tone</span>
                            <p className="text-gray-700 font-medium">{brain.tone}</p>
                          </div>
                        )}
                        {brain.personality && (
                          <div>
                            <span className="text-[10px] text-gray-400">Personality</span>
                            <p className="text-gray-700 font-medium">{brain.personality}</p>
                          </div>
                        )}
                        {language && (
                          <div>
                            <span className="text-[10px] text-gray-400">Language</span>
                            <p className="text-gray-700 font-medium">{language}</p>
                          </div>
                        )}
                        {pillars.length > 0 && (
                          <div>
                            <span className="text-[10px] text-gray-400">Pillars</span>
                            <p className="text-gray-700 font-medium">{pillars.length} defined</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Platform tags */}
                  {platforms.length > 0 && (
                    <div className="px-4 pb-4 flex flex-wrap gap-1.5">
                      {platforms.map((p) => (
                        <span
                          key={p}
                          className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 rounded-full"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Empty state */}
                  {!brain && (
                    <div className="px-4 pb-4">
                      <p className="text-xs text-gray-400">No brain versions yet</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NewBrandBrainDrawer
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        workspaceId={activeWorkspace.id}
        projectId={activeProject?.id}
        onCreated={loadBrands}
      />

      <NewBrandBrainDrawer
        isOpen={!!selectedBrand}
        onClose={() => setSelectedBrand(null)}
        workspaceId={activeWorkspace.id}
        projectId={activeProject?.id}
        onCreated={loadBrands}
        editBrand={selectedBrand}
      />

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
