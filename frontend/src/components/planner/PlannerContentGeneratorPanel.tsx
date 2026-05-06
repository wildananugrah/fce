import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { useSSE } from "../../hooks/useSSE";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { PlannerContentPreviewPane, type PreviewItem } from "./PlannerContentPreviewPane";

interface BrainVersion {
  isActive: boolean;
  tone?: string | null;
  personality?: string | null;
  usp?: string | null;
  targetAudience?: string | null;
}

interface Brand {
  id: string;
  name: string;
  language?: string;
  brainVersions?: BrainVersion[];
}

interface Product {
  id: string;
  name: string;
  brandId: string;
  brainVersions?: BrainVersion[];
}

interface Topic {
  id: string;
  title: string;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  objective?: string | null;
  brandId?: string | null;
  products?: Array<{ id: string; product: { id: string; name: string } }>;
}

type ToastType = "success" | "error" | "info";

interface PlannerContentGeneratorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  brands: Brand[];
  products: Product[];
  topic: Topic | null;
  onSaved: () => void;
  onToast: (msg: string, type: ToastType) => void;
}

const PLATFORMS: Array<{ value: string; label: string }> = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
];

function activeBrandTone(brand: Brand | undefined): string | undefined {
  return brand?.brainVersions?.find((v) => v.isActive)?.tone ?? undefined;
}

function activeProductUsp(product: Product | undefined): string | undefined {
  return product?.brainVersions?.find((v) => v.isActive)?.usp ?? undefined;
}

export function PlannerContentGeneratorPanel({
  isOpen,
  onClose,
  workspaceId,
  brands,
  products,
  topic,
  onSaved,
  onToast,
}: PlannerContentGeneratorPanelProps) {
  const [brandId, setBrandId] = useState<string>(topic?.brandId ?? "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    topic?.products?.map((tp) => tp.product.id) ?? [],
  );
  const [platform, setPlatform] = useState<string>(topic?.platform ?? "instagram");
  const [generating, setGenerating] = useState(false);
  const [previewItem, setPreviewItem] = useState<PreviewItem | null>(null);
  const pendingRequestIdRef = useRef<string | null>(null);

  // Reset state whenever the panel opens with a new topic.
  useEffect(() => {
    if (!isOpen || !topic) return;
    setBrandId(topic.brandId ?? "");
    setSelectedProductIds(topic.products?.map((tp) => tp.product.id) ?? []);
    setPlatform(topic.platform ?? "instagram");
    setPreviewItem(null);
    setGenerating(false);
    pendingRequestIdRef.current = null;
  }, [isOpen, topic]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  const fetchPreviewForRequest = useCallback(
    async (requestId: string) => {
      try {
        const data = await api<{
          platform: string;
          contentType: string;
          brand?: { id: string; name: string } | null;
          product?: { id: string; name: string } | null;
          outputs: Array<{
            id: string;
            contentTitle?: string | null;
            content: Record<string, unknown>;
            status: string;
            sections: Array<{
              id: string;
              sectionType: string;
              sectionOrder: number;
              contentText: string;
            }>;
          }>;
        }>(`/api/workspaces/${workspaceId}/generations/${requestId}`);
        const output = data.outputs?.[0];
        if (!output) {
          onToast("Generation finished but no output was produced", "error");
          return;
        }
        setPreviewItem({
          id: output.id,
          contentTitle: output.contentTitle,
          content: output.content,
          status: output.status,
          sections: output.sections ?? [],
          request: {
            platform: data.platform,
            contentType: data.contentType,
            brand: data.brand ?? null,
            product: data.product ?? null,
          },
        });
      } catch (e) {
        onToast(e instanceof Error ? e.message : "Failed to load generated content", "error");
      }
    },
    [workspaceId, onToast],
  );

  useSSE((event) => {
    if (!isOpen) return;
    const requestId = pendingRequestIdRef.current;
    const eventRequestId = (event.data as { requestId?: string })?.requestId;
    if (!requestId || eventRequestId !== requestId) return;
    if (event.type === "generation_complete") {
      setGenerating(false);
      pendingRequestIdRef.current = null;
      onToast("Content generated", "success");
      void fetchPreviewForRequest(requestId);
    }
    if (event.type === "generation_failed") {
      setGenerating(false);
      pendingRequestIdRef.current = null;
      onToast("Content generation failed", "error");
    }
  });

  const toggleProduct = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handleGenerate = useCallback(async () => {
    if (!topic) {
      onToast("No topic selected", "error");
      return;
    }
    if (!brandId) {
      onToast("Pick a brand", "error");
      return;
    }
    const brand = brands.find((b) => b.id === brandId);
    const contentType = topic.format ?? "single_image";
    setGenerating(true);
    setPreviewItem(null);
    try {
      const res = await api<{ id: string }>(
        `/api/workspaces/${workspaceId}/generations`,
        {
          method: "POST",
          body: JSON.stringify({
            brandId,
            productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
            contentTopicId: topic.id,
            platform,
            contentType,
            framework: "aida",
            hookType: "curiosity-hook",
            pillars: topic.pillar ? [topic.pillar] : undefined,
            objective: topic.objective ?? undefined,
            language: brand?.language ?? undefined,
          }),
        },
      );
      pendingRequestIdRef.current = res.id;
      onToast("Generating content…", "info");
    } catch (e) {
      setGenerating(false);
      onToast(e instanceof Error ? e.message : "Failed to start generation", "error");
    }
  }, [topic, brandId, brands, selectedProductIds, platform, workspaceId, onToast]);

  const handleSave = () => {
    onSaved();
    onClose();
  };

  if (!isOpen || !topic) return null;

  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);
  const brand = brands.find((b) => b.id === brandId);
  const tone = activeBrandTone(brand);
  // Show USP from the first selected product (slide 7 shows one USP block).
  const firstProduct = products.find((p) => p.id === selectedProductIds[0]);
  const usp = activeProductUsp(firstProduct);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-6xl flex-col bg-white shadow-xl animate-slide-in-right">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Content Generator</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Generate platform-native content from Brand Brain and Product Brain.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Form column */}
          <div className="flex w-full flex-col overflow-y-auto border-b border-gray-200 lg:w-[460px] lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="space-y-6 p-6">
              <Section title="Context">
                <Field label="Brand">
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={`Products (${selectedProductIds.length} selected)`}>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredProducts.length === 0 ? (
                      <span className="text-xs text-gray-400">No products under this brand.</span>
                    ) : (
                      filteredProducts.map((p) => {
                        const active = selectedProductIds.includes(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => toggleProduct(p.id)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                              active
                                ? "bg-violet-600 text-white"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {p.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </Field>

                <Field label="Topic">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                    {topic.title}
                  </div>
                  {topic.pillar && (
                    <span className="mt-1.5 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                      {topic.pillar}
                    </span>
                  )}
                </Field>
              </Section>

              {(tone || usp) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-amber-600">
                    Brain Context
                  </p>
                  {tone && (
                    <p className="mb-1 text-sm text-gray-700">
                      <span className="font-semibold text-amber-700">Tone:</span> {tone}
                    </p>
                  )}
                  {usp && (
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold text-amber-700">USP:</span> {usp}
                    </p>
                  )}
                </div>
              )}

              <Section title="Target">
                <Field label="Platform">
                  <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                    {PLATFORMS.map((p) => {
                      const active = platform === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPlatform(p.value)}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                            active
                              ? "bg-violet-600 text-white shadow-sm"
                              : "text-gray-600 hover:text-gray-900"
                          }`}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </Section>
            </div>

            {/* Form footer with Generate */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4">
              <Button
                onClick={handleGenerate}
                disabled={generating || !brandId}
                loading={generating}
                className="w-full"
              >
                <Sparkles size={14} className="mr-1.5" />
                {previewItem ? "Regenerate" : "Generate Content"}
              </Button>
            </div>
          </div>

          {/* Preview column */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            {generating && !previewItem ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <Spinner size="lg" />
                <p className="mt-3 text-sm text-gray-600">Generating content for "{topic.title}"…</p>
              </div>
            ) : previewItem ? (
              <PlannerContentPreviewPane
                item={previewItem}
                onCopied={() => onToast("Copied to clipboard", "success")}
                onError={(msg) => onToast(msg, "error")}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center">
                <div>
                  <Sparkles size={36} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm text-gray-600">
                    Adjust the form and hit Generate Content.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {previewItem && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-white px-6 py-3">
            <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
              <Sparkles size={14} className="mr-1.5" />
              Regenerate
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────── helpers ──────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </label>
      {children}
    </div>
  );
}
