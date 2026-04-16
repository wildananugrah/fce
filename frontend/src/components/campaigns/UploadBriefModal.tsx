import { useEffect, useState } from "react";
import { Upload, Sparkles, X, Loader2 } from "lucide-react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { api } from "../../services/api";

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  brandId: string;
}

interface UploadBriefModalProps {
  workspaceId: string;
  onClose: () => void;
  onCreated: (campaignId: string) => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

export function UploadBriefModal({
  workspaceId,
  onClose,
  onCreated,
  onToast,
}: UploadBriefModalProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brandId, setBrandId] = useState("");
  const [productId, setProductId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    api<Brand[]>(`/api/workspaces/${workspaceId}/brands`)
      .then((res) => {
        setBrands(Array.isArray(res) ? res : []);
      })
      .catch(() => setBrands([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!brandId) {
      setProducts([]);
      setProductId("");
      return;
    }
    api<Product[]>(`/api/workspaces/${workspaceId}/products?brandId=${brandId}`)
      .then((res) => {
        const all = Array.isArray(res) ? res : [];
        // Client-side filter as a safety net in case the server ignores brandId
        setProducts(all.filter((p) => !p.brandId || p.brandId === brandId));
      })
      .catch(() => setProducts([]));
    setProductId("");
  }, [brandId, workspaceId]);

  const canSubmit = !!brandId && !!file && !submitting;

  const handleFile = (f: File | null) => {
    setError("");
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".pdf") && f.type !== "application/pdf") {
      setError("Only PDF files are supported");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File must be 10 MB or smaller");
      return;
    }
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("brandId", brandId);
      if (productId) form.append("productId", productId);
      form.append("file", file);

      // api() already returns json.data, so the response is { campaignId: "..." } directly
      const res = await api<{ campaignId: string }>(
        `/api/workspaces/${workspaceId}/campaigns/upload-brief`,
        { method: "POST", body: form },
      );
      const campaignId = res?.campaignId;
      if (!campaignId) throw new Error("No campaignId returned");
      onToast("Campaign generation started", "success");
      onCreated(campaignId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      onToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Upload Campaign Brief">
      <div className="space-y-5">
        <p className="text-sm text-gray-500">
          Upload a PDF brief and our AI will summarize it, build a campaign plan, and generate content topics.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Brand *
          </label>
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
          >
            <option value="">— Select brand —</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            Product (optional)
          </label>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={!brandId || products.length === 0}
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="">— None —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
            PDF File *
          </label>
          {file ? (
            <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
              <span className="text-sm text-gray-800 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <label
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDragActive(false);
                handleFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-10 cursor-pointer transition-colors ${
                dragActive
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
              }`}
            >
              <Upload
                size={28}
                className={dragActive ? "text-indigo-600 mb-2" : "text-gray-400 mb-2"}
              />
              <span
                className={`text-sm font-medium ${dragActive ? "text-indigo-700" : "text-gray-700"}`}
              >
                {dragActive ? "Drop your PDF here" : "Drag & drop a PDF here"}
              </span>
              <span className="text-xs text-gray-400 mt-1">
                or <span className="text-indigo-600 underline">click to browse</span> · up to 10 MB
              </span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 size={14} className="mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Sparkles size={14} className="mr-1.5" />
                Generate from Brief
              </>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
