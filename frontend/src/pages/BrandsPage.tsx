import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  versionNumber: number;
  status: string;
  createdAt: string;
  personality?: string;
  tone?: string;
  audiencePersonas?: unknown;
  values?: string[];
  messagingRules?: unknown;
  vocabularyPreferred?: string[];
  vocabularyAvoided?: string[];
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <button
              key={brand.id}
              onClick={() => navigate(`/brands/${brand.id}`)}
              className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-sm font-semibold text-black truncate flex-1">{brand.name}</p>
                <Badge variant={statusBadgeVariant(brand.status)}>{brand.status}</Badge>
              </div>
              {brand.category && (
                <p className="text-xs text-gray-500 mb-2">{brand.category}</p>
              )}
              <p className="text-xs text-gray-400">
                {(brand.brainVersions?.length ?? 0) > 0
                  ? `v${brand.brainVersions!.length} active`
                  : "No brain versions"}
              </p>
            </button>
          ))}
        </div>
      )}

      <NewBrandBrainDrawer
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        workspaceId={activeWorkspace.id}
        onCreated={loadBrands}
      />

      {selectedBrand && (
        <BrandDetailModal
          brand={selectedBrand}
          workspaceId={activeWorkspace.id}
          onUpdated={loadBrands}
          onClose={() => setSelectedBrand(null)}
          onToast={showToast}
        />
      )}

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
