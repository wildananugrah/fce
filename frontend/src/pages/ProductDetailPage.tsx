import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";

interface Brand {
  id: string;
  name: string;
}

interface ProductBrainVersion {
  id: string;
  version: number;
  status: string;
  isActive: boolean;
  createdAt: string;
  usp?: string;
  rtb?: string;
  functionalBenefits?: unknown;
  emotionalBenefits?: unknown;
  targetAudience?: string;
  claims?: unknown;
  disclaimers?: unknown;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  status: string;
  brandId: string;
  brand?: Brand;
  createdAt: string;
  brainVersions?: ProductBrainVersion[];
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const SECTIONS = [
  "Overview",
  "USP & RTB",
  "Benefits",
  "Audience Fit",
  "Claims & Disclaimers",
  "Content Angles",
  "Brain Versions",
] as const;

type Section = (typeof SECTIONS)[number];

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "default";
}

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("Overview");
  const [toast, setToast] = useState<ToastState>(null);
  const [saving, setSaving] = useState(false);

  // Overview fields
  const [name, setName] = useState("");
  const [type, setType] = useState("");

  // Brain fields
  const [usp, setUsp] = useState("");
  const [rtb, setRtb] = useState("");
  const [functionalBenefits, setFunctionalBenefits] = useState<string[]>([]);
  const [emotionalBenefits, setEmotionalBenefits] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState("");
  const [claims, setClaims] = useState<string[]>([]);
  const [disclaimers, setDisclaimers] = useState<string[]>([]);
  const [contentAngles, setContentAngles] = useState("");

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const workspaceId = activeWorkspace?.id;

  const loadProduct = useCallback(async () => {
    if (!workspaceId || !id) return;
    setLoading(true);
    try {
      const p = await api<Product>(`/api/workspaces/${workspaceId}/products/${id}`);
      setProduct(p);
      setName(p.name);
      setType(p.type ?? "");

      // Parse active brain version
      const versions = p.brainVersions ?? [];
      const active = versions.find((v) => v.status === "active") ?? versions[0];
      if (active) {
        setUsp(active.usp ?? "");
        setRtb(active.rtb ?? "");
        setTargetAudience(active.targetAudience ?? "");

        const fb = active.functionalBenefits;
        setFunctionalBenefits(Array.isArray(fb) ? fb.map(String) : []);

        const eb = active.emotionalBenefits;
        setEmotionalBenefits(Array.isArray(eb) ? eb.map(String) : []);

        const cl = active.claims;
        setClaims(Array.isArray(cl) ? cl.map(String) : []);

        const dl = active.disclaimers;
        setDisclaimers(Array.isArray(dl) ? dl.map(String) : []);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load product", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  const handleSaveOverview = async () => {
    if (!workspaceId || !id) return;
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim() || null,
        }),
      });
      showToast("Product updated", "success");
      await loadProduct();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update product", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrainSection = async () => {
    if (!workspaceId || !id) return;
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/products/${id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          usp: usp || undefined,
          rtb: rtb || undefined,
          functionalBenefits: functionalBenefits.length > 0 ? functionalBenefits : undefined,
          emotionalBenefits: emotionalBenefits.length > 0 ? emotionalBenefits : undefined,
          targetAudience: targetAudience || undefined,
          claims: claims.length > 0 ? claims : undefined,
          disclaimers: disclaimers.length > 0 ? disclaimers : undefined,
        }),
      });
      showToast("Brain version saved", "success");
      await loadProduct();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save brain version", "error");
    } finally {
      setSaving(false);
    }
  };

  // Reusable array editor
  function renderArrayEditor(
    label: string,
    items: string[],
    setItems: (items: string[]) => void
  ) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">
          {label}
        </label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                setItems(next);
              }}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, ""])}
          className="text-xs text-black underline hover:no-underline"
        >
          + Add {label.toLowerCase()}
        </button>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Select a workspace first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Product not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/products")} className="mt-2">
          Back to Products
        </Button>
      </div>
    );
  }

  const versions = product.brainVersions ?? [];
  const activeVersion = versions.find((v) => v.status === "active") ?? versions[0];
  const brandName = product.brand?.name ?? "";

  const renderCenterPanel = () => {
    switch (activeSection) {
      case "Overview":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Product Overview</h2>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="product, service, feature..."
            />
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveOverview} loading={saving}>
                Save Changes
              </Button>
            </div>
          </div>
        );

      case "USP & RTB":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">USP & RTB</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Unique Selling Proposition
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={4}
                value={usp}
                onChange={(e) => setUsp(e.target.value)}
                placeholder="What makes this product unique..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Reason to Believe
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={4}
                value={rtb}
                onChange={(e) => setRtb(e.target.value)}
                placeholder="Why should the audience believe in this product..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Benefits":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Benefits</h2>
            {renderArrayEditor("Functional Benefits", functionalBenefits, setFunctionalBenefits)}
            {renderArrayEditor("Emotional Benefits", emotionalBenefits, setEmotionalBenefits)}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Audience Fit":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Audience Fit</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Target Audience
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={4}
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder="Describe the target audience for this product..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Claims & Disclaimers":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Claims & Disclaimers</h2>
            {renderArrayEditor("Claims", claims, setClaims)}
            {renderArrayEditor("Disclaimers", disclaimers, setDisclaimers)}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Content Angles":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Content Angles</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Content Angle Notes
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={6}
                value={contentAngles}
                onChange={(e) => setContentAngles(e.target.value)}
                placeholder="Describe content angles, messaging hooks, storytelling approaches..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Brain Versions":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Brain Versions</h2>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No brain versions yet.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-black">v{v.version}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={statusBadgeVariant(v.status)}>{v.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Panel - Section Navigation */}
      <div className="w-48 border-r border-gray-200 bg-gray-50 p-4 flex-shrink-0 overflow-y-auto">
        <button
          onClick={() => navigate("/products")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-black mb-4"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Products
        </button>
        <nav className="space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                activeSection === section
                  ? "bg-black text-white font-medium"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {section}
            </button>
          ))}
        </nav>
      </div>

      {/* Center Panel - Editor */}
      <div className="flex-1 overflow-y-auto p-6">{renderCenterPanel()}</div>

      {/* Right Panel - Context */}
      <div className="w-64 border-l border-gray-200 bg-gray-50 p-4 flex-shrink-0 overflow-y-auto">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
          Product Info
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <Badge variant={statusBadgeVariant(product.status)}>{product.status}</Badge>
          </div>
          {brandName && (
            <div>
              <p className="text-xs text-gray-500">Brand</p>
              <p className="text-sm font-medium text-black">{brandName}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500">Active Version</p>
            <p className="text-sm font-medium text-black">
              {activeVersion ? `v${activeVersion.version}` : "None"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Versions</p>
            <p className="text-sm font-medium text-black">{versions.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm text-black">
              {new Date(product.createdAt).toLocaleDateString()}
            </p>
          </div>
          {product.type && (
            <div>
              <p className="text-xs text-gray-500">Type</p>
              <p className="text-sm text-black">{product.type}</p>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
