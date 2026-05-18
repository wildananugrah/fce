import { useEffect, useRef } from "react";
import { Save, Brain, Sparkles, Loader2, Upload, X, Globe, FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { api, apiUpload } from "../../services/api";
import { SkillsAppliedStrip } from "../skills/SkillsAppliedStrip";
import { useUnsavedAsync } from "../../hooks/useUnsavedAsync";
import { ScrapeLanguageToggle } from "../ui/ScrapeLanguageToggle";
import { ProductReferences } from "./ProductReferences";
import type { ScrapeLanguage } from "../../types";

// ─── Auto-resizing textarea ────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  style: externalStyle,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      rows={1}
      style={{ resize: "none", overflow: "hidden", ...externalStyle }}
      {...rest}
    />
  );
}

// ─── Shared style constants ────────────────────────────────────────────────

const labelCls =
  "block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5";
const inputCls =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-xs text-black placeholder-gray-400 focus:border-black focus:outline-none";

// ─── Types ────────────────────────────────────────────────────────────────

interface Brand {
  id: string;
  name: string;
  language?: string;
}

interface ProductFormProps {
  brands: Brand[];
  workspaceId: string;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  initial?: Partial<ProductFormData>;
  mode?: "create" | "edit";
  productId?: string;
  brandId?: string;
  onBusyChange?: (busy: boolean) => void;
}

export interface ProductFormData {
  brandId: string;
  name: string;
  slug: string;
  type: string;
  priceTier: string;
  summary: string;
  imageUrl: string;
  usp: string;
  rtb: string;
  functionalBenefits: string;
  emotionalBenefits: string;
  targetAudience: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Component ────────────────────────────────────────────────────────────

export function ProductForm({
  brands,
  workspaceId,
  onSubmit,
  onCancel,
  initial,
  mode = "create",
  productId,
  onBusyChange,
}: ProductFormProps) {
  const [brandId, setBrandId] = useState(initial?.brandId ?? brands[0]?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [priceTier, setPriceTier] = useState(initial?.priceTier ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [usp, setUsp] = useState(initial?.usp ?? "");
  const [rtb, setRtb] = useState(initial?.rtb ?? "");
  const [functionalBenefits, setFunctionalBenefits] = useState(
    initial?.functionalBenefits ?? "",
  );
  const [emotionalBenefits, setEmotionalBenefits] = useState(
    initial?.emotionalBenefits ?? "",
  );
  const [targetAudience, setTargetAudience] = useState(initial?.targetAudience ?? "");

  const [productUrl, setProductUrl] = useState("");
  const initialLanguage: ScrapeLanguage =
    (brands.find((b) => b.id === brandId)?.language as ScrapeLanguage | undefined) ??
    "indonesian";
  const [language, setLanguage] = useState<ScrapeLanguage>(initialLanguage);

  useEffect(() => {
    const next = brands.find((b) => b.id === brandId)?.language as
      | ScrapeLanguage
      | undefined;
    if (next) setLanguage(next);
  }, [brandId, brands]);

  const [scraping, setScraping] = useState(false);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useUnsavedAsync(
    scraping || generating,
    "AI is generating product details — leave anyway? Your progress will be lost.",
  );

  useEffect(() => {
    onBusyChange?.(scraping || generating);
  }, [scraping, generating, onBusyChange]);

  const handleAutoFill = async () => {
    const hasUrl = productUrl.trim().length > 0;
    const hasNameAndBrand = name.trim().length > 0 && brandId.length > 0;

    if (!hasUrl && !hasNameAndBrand) {
      setError("Provide a product URL, or enter a product name and pick a brand.");
      return;
    }

    if (hasUrl) {
      const hasManualEdits =
        name.trim().length > 0 ||
        type.trim().length > 0 ||
        summary.trim().length > 0 ||
        usp.trim().length > 0 ||
        rtb.trim().length > 0 ||
        functionalBenefits.trim().length > 0 ||
        emotionalBenefits.trim().length > 0 ||
        targetAudience.trim().length > 0;
      if (hasManualEdits) {
        if (!window.confirm("This will overwrite the current fields with AI output. Continue?")) {
          return;
        }
      }
      await runScrapePreview();
    } else {
      await runGenerateBrain();
    }
  };

  const runScrapePreview = async () => {
    setScraping(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await api<{
        name?: string;
        type?: string;
        priceTier?: string;
        summary?: string;
        usp?: string;
        rtb?: string;
        functionalBenefits?: string[];
        emotionalBenefits?: string[];
        targetAudience?: string;
        imageUrl?: string;
      }>(`/api/workspaces/${workspaceId}/products/scrape-preview`, {
        method: "POST",
        body: JSON.stringify({ url: productUrl.trim(), brandId, language }),
        signal: controller.signal,
      });
      if (result.name) {
        setName(result.name);
        setSlug(generateSlug(result.name));
      }
      if (result.type) setType(result.type);
      if (result.priceTier) setPriceTier(result.priceTier);
      if (result.summary) setSummary(result.summary);
      if (result.usp) setUsp(result.usp);
      if (result.rtb) setRtb(result.rtb);
      if (result.functionalBenefits) {
        const fb = Array.isArray(result.functionalBenefits)
          ? result.functionalBenefits.join("\n")
          : String(result.functionalBenefits);
        if (fb) setFunctionalBenefits(fb);
      }
      if (result.emotionalBenefits) {
        const eb = Array.isArray(result.emotionalBenefits)
          ? result.emotionalBenefits.join("\n")
          : String(result.emotionalBenefits);
        if (eb) setEmotionalBenefits(eb);
      }
      if (result.targetAudience) setTargetAudience(result.targetAudience);
      if (result.imageUrl && !imageUrl) setImageUrl(result.imageUrl);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Auto-fill failed");
    } finally {
      abortRef.current = null;
      setScraping(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await apiUpload<{ url: string }>(
        `/api/workspaces/${workspaceId}/products/upload-image`,
        formData,
        (percent) => setUploadProgress(percent),
      );
      setImageUrl(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const runGenerateBrain = async () => {
    const brand = brands.find((b) => b.id === brandId);
    if (!brand) {
      setError("Select a brand first");
      return;
    }
    setGenerating(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await api<{
        usp?: string;
        rtb?: string;
        functionalBenefits?: string[];
        emotionalBenefits?: string[];
        targetAudience?: string;
        summary?: string;
      }>(`/api/workspaces/${workspaceId}/products/generate-brain`, {
        method: "POST",
        body: JSON.stringify({
          productName: name.trim(),
          brandName: brand.name,
          brandId,
          productType: type.trim() || undefined,
          priceTier: priceTier.trim() || undefined,
          summary: summary.trim() || undefined,
          language,
        }),
        signal: controller.signal,
      });
      if (result.summary && !summary.trim()) setSummary(result.summary);
      if (result.usp) setUsp(result.usp);
      if (result.rtb) setRtb(result.rtb);
      if (result.functionalBenefits) {
        const fb = Array.isArray(result.functionalBenefits)
          ? result.functionalBenefits.join("\n")
          : String(result.functionalBenefits);
        if (fb) setFunctionalBenefits(fb);
      }
      if (result.emotionalBenefits) {
        const eb = Array.isArray(result.emotionalBenefits)
          ? result.emotionalBenefits.join("\n")
          : String(result.emotionalBenefits);
        if (eb) setEmotionalBenefits(eb);
      }
      if (result.targetAudience) setTargetAudience(result.targetAudience);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

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
    if (!brandId) {
      setError("Brand is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit({
        brandId,
        name: name.trim(),
        slug: slug || generateSlug(name.trim()),
        type: type.trim(),
        priceTier: priceTier.trim(),
        summary: summary.trim(),
        imageUrl,
        usp: usp.trim(),
        rtb: rtb.trim(),
        functionalBenefits: functionalBenefits.trim(),
        emotionalBenefits: emotionalBenefits.trim(),
        targetAudience: targetAudience.trim(),
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : mode === "edit"
            ? "Failed to update product"
            : "Failed to create product",
      );
    } finally {
      setLoading(false);
    }
  };

  const singleBrand = brands.length === 1 ? brands[0] : null;
  useEffect(() => {
    if (singleBrand && brandId !== singleBrand.id) {
      setBrandId(singleBrand.id);
    }
  }, [singleBrand, brandId]);

  if (brands.length === 0) {
    return (
      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md p-3">
        You need to create a brand before adding products.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-gray-500">
        Define the product's identity and AI content context.
      </p>

      {/* Product URL + Auto-fill — create mode only */}
      {mode === "create" && (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={16} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-black">Product URL</h3>
          </div>
          <p className="text-xs text-gray-500 mb-2">
            Paste a product page URL to fill the whole form, or leave it blank and click
            Auto-fill once you've named the product and picked a brand to generate just the
            Product Brain.
          </p>
          <div className="flex gap-2 items-stretch">
            <input
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              placeholder="https://example.com/product"
              className={`flex-1 ${inputCls}`}
            />
            <ScrapeLanguageToggle
              value={language}
              onChange={setLanguage}
              disabled={scraping || generating}
            />
            <Button
              variant="secondary"
              onClick={handleAutoFill}
              disabled={
                scraping ||
                generating ||
                (!productUrl.trim() && (!name.trim() || !brandId))
              }
            >
              {scraping || generating ? (
                <Loader2 size={14} className="mr-1.5 animate-spin" />
              ) : (
                <Sparkles size={14} className="mr-1.5" />
              )}
              {scraping ? "Analyzing…" : generating ? "Generating…" : "Auto-fill with AI"}
            </Button>
            {(scraping || generating) && (
              <Button variant="secondary" size="sm" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            )}
          </div>
          <SkillsAppliedStrip generator="product-brain" className="mt-2" />
        </div>
      )}

      {/* Product Info */}
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Product Name *</label>
            <input
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Digital Marketing Retainer"
              className={inputCls}
            />
          </div>
          {singleBrand ? (
            <div>
              <label className={labelCls}>Brand</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
                <span className="w-5 h-5 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                  {singleBrand.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs text-gray-700">{singleBrand.name}</span>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Brand *</label>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className={inputCls}
              >
                <option value="">Select a brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Product Type</label>
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Service, SaaS, Physical"
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>Price Tier</label>
            <input
              value={priceTier}
              onChange={(e) => setPriceTier(e.target.value)}
              placeholder="e.g. Premium, Mid-range, Budget"
              className={inputCls}
            />
          </div>
        </div>

        {/* Product Image */}
        <div>
          <label className={labelCls}>Product Image</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          {imageUrl ? (
            <div className="relative inline-block">
              <img
                src={imageUrl}
                alt="Product"
                className="w-32 h-24 object-cover rounded-lg border border-gray-200"
              />
              <button
                type="button"
                onClick={() => {
                  setImageUrl("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="absolute -top-1.5 -right-1.5 p-0.5 bg-white border border-gray-200 rounded-full text-gray-400 hover:text-red-500 shadow-sm"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add("border-indigo-400", "bg-indigo-50/50");
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50");
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove("border-indigo-400", "bg-indigo-50/50");
                const file = e.dataTransfer.files[0];
                if (file && file.type.startsWith("image/")) {
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  if (fileInputRef.current) {
                    fileInputRef.current.files = dt.files;
                    fileInputRef.current.dispatchEvent(
                      new Event("change", { bubbles: true }),
                    );
                  }
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors cursor-pointer"
            >
              {uploading ? (
                <Loader2 size={24} className="animate-spin text-indigo-500" />
              ) : (
                <Upload size={24} />
              )}
              <div className="text-center">
                <p className="text-xs font-medium">
                  {uploading ? "Uploading…" : "Drop image here or click to upload"}
                </p>
                {uploading ? (
                  <div className="w-48 mt-2">
                    <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-indigo-500 mt-1">{uploadProgress}%</p>
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    800x600px recommended. JPG or PNG.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelCls}>Product Summary</label>
          <AutoTextarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Brief description of what this product offers…"
            className={inputCls}
          />
        </div>
      </div>

      {/* Product Brain */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
          <Brain size={16} className="text-gray-500" />
          <h3 className="text-sm font-semibold text-black">Product Brain</h3>
        </div>

        <div>
          <label className={labelCls}>Unique Selling Proposition (USP)</label>
          <AutoTextarea
            value={usp}
            onChange={(e) => setUsp(e.target.value)}
            placeholder="What makes this product uniquely valuable? Why choose it over alternatives?"
            className={inputCls}
          />
        </div>

        <div>
          <label className={labelCls}>Reason to Believe (RTB)</label>
          <AutoTextarea
            value={rtb}
            onChange={(e) => setRtb(e.target.value)}
            placeholder="Evidence or proof points that back up the USP…"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Functional Benefits</label>
            <AutoTextarea
              value={functionalBenefits}
              onChange={(e) => setFunctionalBenefits(e.target.value)}
              placeholder={`e.g. Saves 10 hours/week\nReduces cost by 30%`}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">One benefit per line.</p>
          </div>
          <div>
            <label className={labelCls}>Emotional Benefits</label>
            <AutoTextarea
              value={emotionalBenefits}
              onChange={(e) => setEmotionalBenefits(e.target.value)}
              placeholder={`e.g. Feel confident\nPeace of mind`}
              className={inputCls}
            />
            <p className="text-xs text-gray-400 mt-1">One benefit per line.</p>
          </div>
        </div>

        <div>
          <label className={labelCls}>Target Audience</label>
          <input
            value={targetAudience}
            onChange={(e) => setTargetAudience(e.target.value)}
            placeholder="e.g. SME owners looking to scale digital presence"
            className={inputCls}
          />
        </div>
      </div>

      {/* References — edit mode only (product must exist to attach documents) */}
      {productId && (
        <div className="space-y-4 pt-2 border-t border-gray-200">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-gray-500" />
            <h3 className="text-sm font-semibold text-black">References</h3>
          </div>
          <ProductReferences
            workspaceId={workspaceId}
            productId={productId}
            brandId={brandId}
          />
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} loading={loading}>
          <Save size={14} className="mr-1.5" />
          {mode === "edit" ? "Save Changes" : "Save Product"}
        </Button>
      </div>
    </div>
  );
}
