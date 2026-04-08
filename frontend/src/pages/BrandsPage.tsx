import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Globe, Dna } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { BrainVersionEditor, type BrainVersionData } from "../components/brands/BrainVersionEditor";
import { DocumentUpload } from "../components/brands/DocumentUpload";
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
  personality?: string;
  tone?: string;
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

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "default";
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---- Create Brand Modal ----
interface CreateBrandModalProps {
  workspaceId: string;
  onCreated: () => void;
  onClose: () => void;
}

function CreateBrandModal({ workspaceId, onCreated, onClose }: CreateBrandModalProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    setSlug(generateSlug(val));
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api(`/api/workspaces/${workspaceId}/brands`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug || generateSlug(name.trim()),
          category: category.trim() || undefined,
          websiteUrl: websiteUrl.trim() || undefined,
        }),
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create brand");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Brand">
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={handleNameChange}
          placeholder="My Brand"
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="my-brand"
        />
        <Input
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Technology, Fashion, etc."
        />
        <Input
          label="Website URL"
          value={websiteUrl}
          onChange={(e) => setWebsiteUrl(e.target.value)}
          placeholder="https://example.com"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>Create Brand</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Brand Detail Modal ----
interface BrandDetailModalProps {
  brand: Brand;
  workspaceId: string;
  onUpdated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function BrandDetailModal({ brand, workspaceId, onUpdated, onClose, onToast }: BrandDetailModalProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [detail, setDetail] = useState<Brand | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Details form
  const [name, setName] = useState(brand.name);
  const [category, setCategory] = useState(brand.category ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(brand.websiteUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingDetail(true);
      try {
        const b = await api<Brand>(`/api/workspaces/${workspaceId}/brands/${brand.id}`);
        setDetail(b);
        setName(b.name);
        setCategory(b.category ?? "");
        setWebsiteUrl(b.websiteUrl ?? "");
      } catch {
        // use base brand data
        setDetail(brand);
      } finally {
        setLoadingDetail(false);
      }
    };
    load();
  }, [brand, workspaceId]);

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
        }),
      });
      onToast("Brand updated", "success");
      onUpdated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update brand", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrain = async (data: BrainVersionData) => {
    try {
      await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          personality: data.personality,
          tone: data.tone,
          audiencePersonas: data.audiencePersonas ? JSON.parse(data.audiencePersonas) : undefined,
          values: data.values ? data.values.split(",").map((v) => v.trim()).filter(Boolean) : undefined,
          messagingRules: data.messagingRules ? JSON.parse(data.messagingRules) : undefined,
          vocabularyPreferred: data.vocabularyPreferred
            ? data.vocabularyPreferred.split(",").map((v) => v.trim()).filter(Boolean)
            : undefined,
          vocabularyAvoided: data.vocabularyAvoided
            ? data.vocabularyAvoided.split(",").map((v) => v.trim()).filter(Boolean)
            : undefined,
        }),
      });
      onToast("Brain version saved", "success");
      onUpdated();
      // Reload detail to show new version
      const b = await api<Brand>(`/api/workspaces/${workspaceId}/brands/${brand.id}`);
      setDetail(b);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save brain version", "error");
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    try {
      await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/scrape`, { method: "POST" });
      onToast("Scraping started", "info");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to start scrape", "error");
    } finally {
      setScraping(false);
    }
  };

  const tabs = [
    { key: "details", label: "Details" },
    { key: "brain", label: "Brain" },
    { key: "versions", label: "Versions" },
    { key: "documents", label: "Documents" },
  ];

  const versions = detail?.brainVersions ?? [];
  const activeBrainVersion = versions.find((v) => v.status === "active") ?? versions[0];

  return (
    <Modal isOpen onClose={onClose} title={brand.name}>
      <div className="space-y-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {loadingDetail ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            {activeTab === "details" && (
              <div className="space-y-4 pt-2">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <Input
                  label="Category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="Technology, Fashion, etc."
                />
                <Input
                  label="Website URL"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://example.com"
                />
                <div className="flex justify-between items-center pt-2">
                  <Button variant="secondary" size="sm" onClick={handleScrape} loading={scraping}>
                    Scrape from URL
                  </Button>
                  <Button onClick={handleSaveDetails} loading={saving}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "brain" && (
              <div className="pt-2">
                <BrainVersionEditor
                  onSave={handleSaveBrain}
                  initial={
                    activeBrainVersion
                      ? {
                          personality: activeBrainVersion.personality ?? "",
                          tone: activeBrainVersion.tone ?? "",
                          audiencePersonas: activeBrainVersion.audiencePersonas
                            ? JSON.stringify(activeBrainVersion.audiencePersonas, null, 2)
                            : "",
                          values: activeBrainVersion.values?.join(", ") ?? "",
                          messagingRules: activeBrainVersion.messagingRules
                            ? JSON.stringify(activeBrainVersion.messagingRules, null, 2)
                            : "",
                          vocabularyPreferred: activeBrainVersion.vocabularyPreferred?.join(", ") ?? "",
                          vocabularyAvoided: activeBrainVersion.vocabularyAvoided?.join(", ") ?? "",
                        }
                      : {}
                  }
                />
              </div>
            )}

            {activeTab === "versions" && (
              <div className="space-y-2 pt-2">
                {versions.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No brain versions yet.</p>
                ) : (
                  versions.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-black">v{v.versionNumber}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={statusBadgeVariant(v.status)}>{v.status}</Badge>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "documents" && (
              <DocumentUpload
                workspaceId={workspaceId}
                brandId={brand.id}
                onToast={onToast}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function BrandsPage() {
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const handleDelete = async (brandId: string, brandName: string) => {
    if (!activeWorkspace) return;
    if (!window.confirm(`Delete "${brandName}"? This cannot be undone.`)) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`, {
        method: "DELETE",
      });
      showToast("Brand deleted", "success");
      loadBrands();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete brand", "error");
    }
  };

  const loadBrands = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const data = await api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`);
      setBrands(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load brands", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

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

                <button
                  onClick={() => setSelectedBrand(brand)}
                  className="text-left w-full"
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
                      <div className="flex items-center gap-1.5 mb-2">
                        <Globe size={12} className="text-gray-400 shrink-0" />
                        <span className="text-xs text-indigo-600 truncate">{brand.websiteUrl}</span>
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
                </button>
              </div>
            );
          })}
        </div>
      )}

      <NewBrandBrainDrawer
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        workspaceId={activeWorkspace.id}
        onCreated={loadBrands}
      />

      <NewBrandBrainDrawer
        isOpen={!!selectedBrand}
        onClose={() => setSelectedBrand(null)}
        workspaceId={activeWorkspace.id}
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
