import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brandId: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

const PLATFORM_OPTIONS = [
  { value: "", label: "All platforms (optional)" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
];

// ---- Add Topic Modal (manual) ----
interface AddTopicModalProps {
  workspaceId: string;
  brands: Brand[];
  products: Product[];
  onCreated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function AddTopicModal({ workspaceId, brands, products, onCreated, onClose, onToast }: AddTopicModalProps) {
  const [title, setTitle] = useState("");
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [pillar, setPillar] = useState("");
  const [platform, setPlatform] = useState("");
  const [format, setFormat] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandOptions = [{ value: "", label: "Select brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);
  const productOptions = [{ value: "", label: "No product (optional)" }, ...filteredProducts.map((p) => ({ value: p.id, label: p.name }))];
  const platformOptions = PLATFORM_OPTIONS;

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setLoading(true);
    setError(null);
    try {
      await api(`/api/workspaces/${workspaceId}/topics`, {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          brandId: brandId || undefined,
          productId: productId || undefined,
          pillar: pillar.trim() || undefined,
          platform: platform || undefined,
          format: format.trim() || undefined,
        }),
      });
      onToast("Topic created", "success");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create topic");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Add Topic">
      <div className="space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Topic title..." />
        <Select label="Brand (optional)" options={brandOptions} value={brandId} onChange={(e) => { setBrandId(e.target.value); setProductId(""); }} />
        <Select label="Product (optional)" options={productOptions} value={productId} onChange={(e) => setProductId(e.target.value)} />
        <Input label="Pillar (optional)" value={pillar} onChange={(e) => setPillar(e.target.value)} placeholder="Education, Entertainment..." />
        <Select label="Platform (optional)" options={platformOptions} value={platform} onChange={(e) => setPlatform(e.target.value)} />
        <Input label="Format (optional)" value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Carousel, Reel..." />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>Add Topic</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function TopicsPage() {
  const { activeWorkspace } = useWorkspace();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Generate form
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState("");
  const [count, setCount] = useState("5");

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadData = useCallback(async () => {
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
      ]);
      setBrands(b);
      setProducts(p);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { loadData(); }, [loadData]);

  useSSE((event) => {
    if (event.type === "topics_generated") {
      showToast("Topics generated successfully", "success");
    }
  });

  const handleGenerate = async () => {
    if (!brandId) { showToast("Please select a brand", "error"); return; }
    setGenerating(true);
    try {
      await api(`/api/workspaces/${activeWorkspace!.id}/topics/generate`, {
        method: "POST",
        body: JSON.stringify({
          brandId,
          productId: productId || undefined,
          platform: platform || undefined,
          count: parseInt(count) || 5,
        }),
      });
      showToast("Topics being generated", "info");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to start generation", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to generate topics.</p>
      </div>
    );
  }

  const brandOptions = [{ value: "", label: "Select brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);
  const productOptions = [{ value: "", label: "No product (optional)" }, ...filteredProducts.map((p) => ({ value: p.id, label: p.name }))];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Generate Topics</h1>
        <Button variant="secondary" onClick={() => setShowAdd(true)}>Add Topic</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <p className="text-sm text-gray-600">Generate content topic ideas using AI based on your brand and product.</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Brand"
              options={brandOptions}
              value={brandId}
              onChange={(e) => { setBrandId(e.target.value); setProductId(""); }}
            />
            <Select
              label="Product (optional)"
              options={productOptions}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            />
            <Select
              label="Platform (optional)"
              options={PLATFORM_OPTIONS}
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
            />
            <div className="w-full">
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Count</label>
              <input
                type="number"
                min={1}
                max={20}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={handleGenerate} loading={generating}>
              Generate
            </Button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddTopicModal
          workspaceId={activeWorkspace.id}
          brands={brands}
          products={products}
          onCreated={() => {}}
          onClose={() => setShowAdd(false)}
          onToast={showToast}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
