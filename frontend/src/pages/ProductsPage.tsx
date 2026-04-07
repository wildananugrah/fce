import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { ProductForm, type ProductFormData } from "../components/products/ProductForm";
import { ProductBrainEditor, type ProductBrainData } from "../components/products/ProductBrainEditor";

interface Brand {
  id: string;
  name: string;
}

interface ProductBrainVersion {
  id: string;
  versionNumber: number;
  status: string;
  createdAt: string;
  usp?: string;
  rtb?: string;
  functionalBenefits?: string;
  emotionalBenefits?: string;
  targetAudience?: string;
  claims?: string[];
  disclaimers?: string[];
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  status: string;
  brandId: string;
  brand?: Brand;
  brainVersions?: ProductBrainVersion[];
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "default";
}

// ---- Product Detail Modal ----
interface ProductDetailModalProps {
  product: Product;
  workspaceId: string;
  onUpdated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function ProductDetailModal({ product, workspaceId, onUpdated, onClose, onToast }: ProductDetailModalProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [detail, setDetail] = useState<Product | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Details form
  const [name, setName] = useState(product.name);
  const [type, setType] = useState(product.type ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoadingDetail(true);
      try {
        const p = await api<Product>(`/api/workspaces/${workspaceId}/products/${product.id}`);
        setDetail(p);
        setName(p.name);
        setType(p.type ?? "");
      } catch {
        setDetail(product);
      } finally {
        setLoadingDetail(false);
      }
    };
    load();
  }, [product, workspaceId]);

  const handleSaveDetails = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          type: type || null,
        }),
      });
      onToast("Product updated", "success");
      onUpdated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update product", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrain = async (data: ProductBrainData) => {
    try {
      await api(`/api/workspaces/${workspaceId}/products/${product.id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          usp: data.usp,
          rtb: data.rtb,
          functionalBenefits: data.functionalBenefits,
          emotionalBenefits: data.emotionalBenefits,
          targetAudience: data.targetAudience,
          claims: data.claims ? data.claims.split("\n").map((v) => v.trim()).filter(Boolean) : undefined,
          disclaimers: data.disclaimers
            ? data.disclaimers.split("\n").map((v) => v.trim()).filter(Boolean)
            : undefined,
        }),
      });
      onToast("Brain version saved", "success");
      onUpdated();
      const p = await api<Product>(`/api/workspaces/${workspaceId}/products/${product.id}`);
      setDetail(p);
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save brain version", "error");
    }
  };

  const tabs = [
    { key: "details", label: "Details" },
    { key: "brain", label: "Brain" },
    { key: "versions", label: "Versions" },
  ];

  const versions = detail?.brainVersions ?? [];
  const activeBrainVersion = versions.find((v) => v.status === "active") ?? versions[0];

  return (
    <Modal isOpen onClose={onClose} title={product.name}>
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
                  label="Type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  placeholder="product, service, feature..."
                />
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSaveDetails} loading={saving}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}

            {activeTab === "brain" && (
              <div className="pt-2">
                <ProductBrainEditor
                  onSave={handleSaveBrain}
                  initial={
                    activeBrainVersion
                      ? {
                          usp: activeBrainVersion.usp ?? "",
                          rtb: activeBrainVersion.rtb ?? "",
                          functionalBenefits: activeBrainVersion.functionalBenefits ?? "",
                          emotionalBenefits: activeBrainVersion.emotionalBenefits ?? "",
                          targetAudience: activeBrainVersion.targetAudience ?? "",
                          claims: activeBrainVersion.claims?.join("\n") ?? "",
                          disclaimers: activeBrainVersion.disclaimers?.join("\n") ?? "",
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
          </>
        )}
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function ProductsPage() {
  const { activeWorkspace } = useWorkspace();
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [p, b] = await Promise.all([
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
      ]);
      setProducts(p);
      setBrands(b);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load products", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProduct = async (data: ProductFormData) => {
    if (!activeWorkspace) return;
    await api(`/api/workspaces/${activeWorkspace.id}/products`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    await loadData();
    setShowCreate(false);
    showToast("Product created", "success");
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to manage products.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Products</h1>
        <Button onClick={() => setShowCreate(true)}>New Product</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">No products yet. Create your first product to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const brandName = product.brand?.name ?? brands.find((b) => b.id === product.brandId)?.name ?? "Unknown";
            return (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="text-sm font-semibold text-black truncate flex-1">{product.name}</p>
                  <Badge variant={statusBadgeVariant(product.status)}>{product.status}</Badge>
                </div>
                <p className="text-xs text-gray-500 mb-1">{brandName}</p>
                {product.type && (
                  <p className="text-xs text-gray-400">{product.type}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal isOpen onClose={() => setShowCreate(false)} title="New Product">
          <ProductForm
            brands={brands}
            onSubmit={handleCreateProduct}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          workspaceId={activeWorkspace.id}
          onUpdated={loadData}
          onClose={() => setSelectedProduct(null)}
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
