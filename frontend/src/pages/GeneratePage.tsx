import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
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

interface Framework {
  id: string;
  name: string;
}

interface HookType {
  id: string;
  name: string;
}

interface Generation {
  id: string;
  status: string;
  platform: string;
  contentType: string;
  createdAt: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  return "default";
}

const PLATFORM_OPTIONS = [
  { value: "", label: "Select platform" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "linkedin", label: "LinkedIn" },
];

const CONTENT_TYPE_OPTIONS = [
  { value: "", label: "Select content type" },
  { value: "single_image", label: "Single Image" },
  { value: "carousel", label: "Carousel" },
  { value: "video_script", label: "Video Script" },
  { value: "story", label: "Story" },
];

const LANGUAGE_OPTIONS = [
  { value: "indonesian", label: "Indonesian" },
  { value: "english", label: "English" },
];

export function GeneratePage() {
  const { activeWorkspace } = useWorkspace();

  // Form state
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState("");
  const [contentType, setContentType] = useState("");
  const [frameworkId, setFrameworkId] = useState("");
  const [hookTypeId, setHookTypeId] = useState("");
  const [language, setLanguage] = useState("indonesian");
  const [customPrompt, setCustomPrompt] = useState("");

  // Data
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [hookTypes, setHookTypes] = useState<HookType[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadGenerations = useCallback(async () => {
    if (!activeWorkspace) return;
    try {
      const data = await api<Generation[]>(`/api/workspaces/${activeWorkspace.id}/generations`);
      setGenerations(data);
    } catch {
      // silent
    }
  }, [activeWorkspace]);

  const loadInitialData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [b, p, fw, ht, gen] = await Promise.all([
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
        api<Framework[]>(`/api/taxonomy/frameworks`),
        api<HookType[]>(`/api/taxonomy/hook-types`),
        api<Generation[]>(`/api/workspaces/${activeWorkspace.id}/generations`),
      ]);
      setBrands(b);
      setProducts(p);
      setFrameworks(fw);
      setHookTypes(ht);
      setGenerations(gen);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useSSE((event) => {
    if (event.type === "generation_complete" || event.type === "generation_failed") {
      loadGenerations();
    }
  });

  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);

  const handleSubmit = async () => {
    if (!brandId) { showToast("Please select a brand", "error"); return; }
    if (!platform) { showToast("Please select a platform", "error"); return; }
    if (!contentType) { showToast("Please select a content type", "error"); return; }

    setSubmitting(true);
    try {
      await api(`/api/workspaces/${activeWorkspace!.id}/generations`, {
        method: "POST",
        body: JSON.stringify({
          brandId,
          productId: productId || undefined,
          platform,
          contentType,
          frameworkId: frameworkId || undefined,
          hookTypeId: hookTypeId || undefined,
          language,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      showToast("Generation submitted", "success");
      await loadGenerations();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to submit generation", "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to generate content.</p>
      </div>
    );
  }

  const brandOptions = [{ value: "", label: "Select brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const productOptions = [{ value: "", label: "No product (optional)" }, ...filteredProducts.map((p) => ({ value: p.id, label: p.name }))];
  const frameworkOptions = [{ value: "", label: "No framework (optional)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
  const hookTypeOptions = [{ value: "", label: "No hook type (optional)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-lg font-semibold text-black">Generate Content</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
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
            label="Platform"
            options={PLATFORM_OPTIONS}
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          />
          <Select
            label="Content Type"
            options={CONTENT_TYPE_OPTIONS}
            value={contentType}
            onChange={(e) => setContentType(e.target.value)}
          />
          <Select
            label="Framework (optional)"
            options={frameworkOptions}
            value={frameworkId}
            onChange={(e) => setFrameworkId(e.target.value)}
          />
          <Select
            label="Hook Type (optional)"
            options={hookTypeOptions}
            value={hookTypeId}
            onChange={(e) => setHookTypeId(e.target.value)}
          />
          <Select
            label="Language"
            options={LANGUAGE_OPTIONS}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          />
        </div>

        <div className="w-full">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Custom Prompt (optional)
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
            rows={3}
            placeholder="Add any specific instructions or context..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSubmit} loading={submitting}>
            Generate
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-black">Recent Generations</h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : generations.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
            <p className="text-sm text-gray-400">No generations yet.</p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">ID</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Platform</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Content Type</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Date</th>
                </tr>
              </thead>
              <tbody>
                {generations.map((gen) => (
                  <tr key={gen.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-sm text-gray-500 font-mono">{gen.id.slice(0, 8)}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 capitalize">{gen.platform}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-700">{gen.contentType?.replace(/_/g, " ")}</td>
                    <td className="px-4 py-2.5">
                      <Badge variant={statusBadgeVariant(gen.status)}>{gen.status}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">
                      {new Date(gen.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
