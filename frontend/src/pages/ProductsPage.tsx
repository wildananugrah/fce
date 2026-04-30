import { useState, useEffect, useCallback, useMemo } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { useOnboarding } from "../hooks/useOnboarding";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
import { ProductDrawer } from "../components/products/ProductDrawer";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { type ProductFormData } from "../components/products/ProductForm";
import { Trash2, ImageOff, Brain } from "lucide-react";

interface Brand {
  id: string;
  name: string;
  language?: string;
}

interface ProductBrainVersion {
  id: string;
  versionNumber: number;
  version: number;
  status: string;
  createdAt: string;
  isActive: boolean;
  usp?: string;
  rtb?: string;
  functionalBenefits?: string | string[];
  emotionalBenefits?: string | string[];
  targetAudience?: string;
  claims?: string[];
  disclaimers?: string[];
}

interface Product {
  id: string;
  name: string;
  slug: string;
  type: string | null;
  priceTier: string | null;
  summary: string | null;
  imageUrl: string | null;
  status: string;
  brandId: string;
  brand?: Brand;
  brainVersions?: ProductBrainVersion[];
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

// ---- Main Page ----
export function ProductsPage() {
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();
  const { refreshProgress } = useOnboarding();
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
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const [p, b] = await Promise.all([
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products${qs}`),
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`),
      ]);
      setProducts(p);
      setBrands(b);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load products", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProduct = async (data: ProductFormData) => {
    if (!activeWorkspace) return;

    // Create the product
    const product = await api<{ id: string }>(`/api/workspaces/${activeWorkspace.id}/products`, {
      method: "POST",
      body: JSON.stringify({
        brandId: data.brandId,
        name: data.name,
        slug: data.slug,
        type: data.type || undefined,
        priceTier: data.priceTier || undefined,
        summary: data.summary || undefined,
        imageUrl: data.imageUrl || undefined,
      }),
    });

    // Create brain version if any brain fields are filled
    const hasBrain = data.usp || data.rtb || data.functionalBenefits || data.emotionalBenefits || data.targetAudience;
    if (hasBrain) {
      await api(`/api/workspaces/${activeWorkspace.id}/products/${product.id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          usp: data.usp || undefined,
          rtb: data.rtb || undefined,
          functionalBenefits: data.functionalBenefits
            ? data.functionalBenefits.split("\n").map((v) => v.trim()).filter(Boolean)
            : undefined,
          emotionalBenefits: data.emotionalBenefits
            ? data.emotionalBenefits.split("\n").map((v) => v.trim()).filter(Boolean)
            : undefined,
          targetAudience: data.targetAudience || undefined,
        }),
      });
    }

    await loadData();
    setShowCreate(false);
    refreshProgress();
    showToast("Product created", "success");
  };

  const handleEditProduct = async (product: Product, data: ProductFormData) => {
    if (!activeWorkspace) return;

    // Update product fields
    await api(`/api/workspaces/${activeWorkspace.id}/products/${product.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: data.name,
        type: data.type || null,
        priceTier: data.priceTier || null,
        summary: data.summary || null,
        imageUrl: data.imageUrl || null,
      }),
    });

    // Create new brain version with updated fields
    const hasBrain = data.usp || data.rtb || data.functionalBenefits || data.emotionalBenefits || data.targetAudience;
    if (hasBrain) {
      await api(`/api/workspaces/${activeWorkspace.id}/products/${product.id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          usp: data.usp || undefined,
          rtb: data.rtb || undefined,
          functionalBenefits: data.functionalBenefits
            ? data.functionalBenefits.split("\n").map((v) => v.trim()).filter(Boolean)
            : undefined,
          emotionalBenefits: data.emotionalBenefits
            ? data.emotionalBenefits.split("\n").map((v) => v.trim()).filter(Boolean)
            : undefined,
          targetAudience: data.targetAudience || undefined,
        }),
      });
    }

    await loadData();
    setSelectedProduct(null);
    showToast("Product updated", "success");
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!activeWorkspace) return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/products/${productId}`, { method: "DELETE" });
      showToast("Product deleted", "success");
      loadData();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete product", "error");
    }
  };

  const productsByBrand = useMemo(() => {
    const grouped = new Map<string, { brand: Brand; products: Product[] }>();
    for (const product of products) {
      const brand = product.brand ?? brands.find((b) => b.id === product.brandId);
      const brandId = brand?.id ?? product.brandId;
      const brandName = brand?.name ?? "Unknown";
      if (!grouped.has(brandId)) {
        grouped.set(brandId, { brand: { id: brandId, name: brandName }, products: [] });
      }
      grouped.get(brandId)!.products.push(product);
    }
    return Array.from(grouped.values());
  }, [products, brands]);

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
        <div>
          <h1 className="text-lg font-semibold text-black">Product Brain</h1>
          <p className="text-sm text-gray-500">Manage your products and their AI-powered content context.</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton pageKey="products" />
          <Button onClick={() => setShowCreate(true)}>+ Add Product</Button>
        </div>
      </div>
      <CoachMark pageKey="products" title="Products" body="Products live inside a brand and represent what you're talking about — a service, a launch, a feature. Content is generated against a product, not a brand." />

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : products.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">No products yet. Create your first product to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {productsByBrand.map(({ brand, products: brandProducts }) => (
            <div key={brand.id}>
              {/* Brand group header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-sm font-bold">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
                <h2 className="text-base font-semibold text-black">{brand.name}</h2>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{brandProducts.length}</span>
              </div>

              {/* Product cards grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {brandProducts.map((product) => {
                  const activeBrain = product.brainVersions?.find((v) => v.isActive) ?? product.brainVersions?.[0];
                  return (
                    <div
                      key={product.id}
                      className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-gray-300 hover:shadow-sm transition-all group"
                    >
                      {/* Card header — image or placeholder */}
                      <div className="relative h-28 bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100">
                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <ImageOff size={28} className="text-indigo-300" />
                          </div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (
                              confirm(
                                `Move "${product.name}" to Trash? You can restore it from Workspace Settings → Trash within 30 days.`,
                              )
                            )
                              handleDeleteProduct(product.id);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-sm rounded-md text-gray-400 hover:text-red-500 hover:bg-white opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Card body */}
                      <button
                        onClick={() => setSelectedProduct(product)}
                        className="w-full text-left p-4"
                      >
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                            {brand.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-black truncate">{product.name}</p>
                            {product.type && (
                              <p className="text-xs text-gray-400">{product.type}</p>
                            )}
                          </div>
                        </div>

                        {product.summary && (
                          <p className="text-xs text-gray-500 line-clamp-2 mb-3">{product.summary}</p>
                        )}

                        {/* Product Brain preview */}
                        {activeBrain && (
                          <div className="border-t border-gray-100 pt-3 mt-1">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Brain size={12} className="text-indigo-500" />
                              <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">Product Brain</span>
                            </div>
                            {activeBrain.usp && (
                              <div className="mb-2">
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">USP</p>
                                <p className="text-xs text-gray-600 line-clamp-2">{activeBrain.usp}</p>
                              </div>
                            )}
                            {product.priceTier && (
                              <div>
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Price Tier</p>
                                <p className="text-xs text-gray-700 font-medium">{product.priceTier}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <ProductDrawer
          isOpen
          onClose={() => setShowCreate(false)}
          title="New Product"
          brands={brands}
          workspaceId={activeWorkspace.id}
          mode="create"
          onSubmit={handleCreateProduct}
        />
      )}

      {selectedProduct && (() => {
        const activeBrain = selectedProduct.brainVersions?.find((v) => v.isActive) ?? selectedProduct.brainVersions?.[0];
        const toStr = (val: unknown): string => {
          if (!val) return "";
          if (Array.isArray(val)) return val.join("\n");
          return String(val);
        };
        return (
          <ProductDrawer
            isOpen
            onClose={() => setSelectedProduct(null)}
            title="Edit Product"
            subtitle={selectedProduct.name}
            brands={brands}
            workspaceId={activeWorkspace.id}
            mode="edit"
            productId={selectedProduct.id}
            brandId={selectedProduct.brandId}
            initial={{
              brandId: selectedProduct.brandId,
              name: selectedProduct.name,
              slug: selectedProduct.slug,
              type: selectedProduct.type ?? "",
              priceTier: selectedProduct.priceTier ?? "",
              summary: selectedProduct.summary ?? "",
              imageUrl: selectedProduct.imageUrl ?? "",
              usp: activeBrain?.usp ?? "",
              rtb: activeBrain?.rtb ?? "",
              functionalBenefits: toStr(activeBrain?.functionalBenefits),
              emotionalBenefits: toStr(activeBrain?.emotionalBenefits),
              targetAudience: activeBrain?.targetAudience ?? "",
            }}
            onSubmit={(data) => handleEditProduct(selectedProduct, data)}
          />
        );
      })()}

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
