import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Eye } from "lucide-react";
import { Select } from "../components/ui/Select";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Spinner } from "../components/ui/Spinner";
import { ContentPreviewModal } from "../components/library/ContentPreviewModal";
import { Toast } from "../components/ui/Toast";
import { ActiveSkillsBadges } from "../components/skills/ActiveSkillsBadges";

interface Brand {
  id: string;
  name: string;
  brainVersions?: BrandBrainVersion[];
}

interface BrandBrainVersion {
  id: string;
  tone?: string;
  personality?: string;
  isActive: boolean;
}

interface Product {
  id: string;
  name: string;
  brandId: string;
  brainVersions?: ProductBrainVersion[];
}

interface ProductBrainVersion {
  id: string;
  usp?: string;
  targetAudience?: string;
  isActive: boolean;
}

interface ContentTopic {
  id: string;
  title: string;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  brandId?: string | null;
  status: string;
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
  brand?: { id: string; name: string } | null;
  product?: { id: string; name: string } | null;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function getStatusStyle(status: string): string {
  if (status === "completed") return "bg-green-50 text-green-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  if (status === "processing") return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function getStatusDot(status: string): string {
  if (status === "completed") return "bg-green-500";
  if (status === "failed") return "bg-red-500";
  if (status === "processing") return "bg-amber-500";
  return "bg-gray-400";
}

function getPlatformStyle(platform: string): { bg: string; text: string } {
  const map: Record<string, { bg: string; text: string }> = {
    instagram: { bg: "bg-purple-100", text: "text-purple-700" },
    tiktok: { bg: "bg-gray-900", text: "text-white" },
    youtube: { bg: "bg-red-100", text: "text-red-700" },
    twitter: { bg: "bg-blue-100", text: "text-blue-700" },
    linkedin: { bg: "bg-sky-100", text: "text-sky-700" },
    facebook: { bg: "bg-blue-100", text: "text-blue-700" },
  };
  return map[platform] ?? { bg: "bg-gray-100", text: "text-gray-700" };
}

function formatRelativeDate(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

// ─── Platform & Format Configuration ────────────────────────────

interface FormatOption {
  value: string;
  label: string;
  icon: string;
  badge?: "SLIDES" | "VIDEO";
}

const PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
];

const PLATFORM_FORMATS: Record<string, FormatOption[]> = {
  instagram: [
    { value: "single_image", label: "Single Image", icon: "\uD83D\uDDBC\uFE0F" },
    { value: "carousel", label: "Carousel", icon: "\uD83C\uDFA0", badge: "SLIDES" },
    { value: "reels", label: "Reels", icon: "\uD83C\uDFAC", badge: "VIDEO" },
    { value: "story_image", label: "Story \u2013 Image", icon: "\uD83D\uDCF1" },
    { value: "story_video", label: "Story \u2013 Video", icon: "\uD83D\uDCF9", badge: "VIDEO" },
  ],
  tiktok: [
    { value: "tiktok_video", label: "TikTok Video", icon: "\uD83C\uDFB5", badge: "VIDEO" },
    { value: "tiktok_carousel", label: "TikTok Carousel", icon: "\uD83C\uDFA0", badge: "SLIDES" },
  ],
  youtube: [
    { value: "long_video", label: "Long Video", icon: "\uD83D\uDCFA", badge: "VIDEO" },
    { value: "youtube_shorts", label: "YouTube Shorts", icon: "\u26A1", badge: "VIDEO" },
  ],
  twitter: [
    { value: "single_tweet", label: "Single Tweet", icon: "\uD83D\uDCAC" },
    { value: "thread", label: "Thread", icon: "\uD83D\uDCDD", badge: "SLIDES" },
    { value: "video_tweet", label: "Video Tweet", icon: "\uD83C\uDFAC", badge: "VIDEO" },
  ],
  linkedin: [
    { value: "single_post", label: "Single Post", icon: "\uD83D\uDCBC" },
    { value: "carousel_post", label: "Carousel Post", icon: "\uD83C\uDFA0", badge: "SLIDES" },
    { value: "linkedin_video", label: "LinkedIn Video", icon: "\uD83C\uDFAC", badge: "VIDEO" },
    { value: "article", label: "Article", icon: "\uD83D\uDCDD" },
  ],
  facebook: [
    { value: "feed_post", label: "Feed Post", icon: "\uD83D\uDCF0" },
    { value: "carousel_ad", label: "Carousel Ad", icon: "\uD83C\uDFA0", badge: "SLIDES" },
    { value: "reel_short_video", label: "Reel / Short Video", icon: "\uD83C\uDFAC", badge: "VIDEO" },
    { value: "story", label: "Story", icon: "\uD83D\uDCF1" },
  ],
};

const OBJECTIVE_OPTIONS = [
  { value: "", label: "Select Objective" },
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "education", label: "Education" },
  { value: "conversion", label: "Conversion" },
  { value: "launch", label: "Launch" },
];

const OUTPUT_LENGTH_OPTIONS = [
  { value: "", label: "Select Output Length" },
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

// ─── Badge Component for Format Tags ────────────────────────────

function FormatBadge({ type }: { type: "SLIDES" | "VIDEO" }) {
  const colors =
    type === "VIDEO"
      ? "bg-red-50 text-red-600 border-red-200"
      : "bg-blue-50 text-blue-600 border-blue-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colors}`}>
      {type}
    </span>
  );
}

// ─── Brain Context Card ─────────────────────────────────────────

function BrainContextCard({ tone, usp }: { tone?: string; usp?: string }) {
  if (!tone && !usp) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2">
        Brain Context
      </p>
      {tone && (
        <p className="text-sm text-gray-700 mb-1">
          <span className="font-semibold text-amber-600">Tone:</span> {tone}
        </p>
      )}
      {usp && (
        <p className="text-sm text-gray-700">
          <span className="font-semibold text-amber-600">USP:</span> {usp}
        </p>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export function GeneratePage() {
  const { activeWorkspace } = useWorkspace();
  const [searchParams] = useSearchParams();

  // Form state — pre-fill from URL params (e.g., from Topic Library)
  const [brandId, setBrandId] = useState(searchParams.get("brandId") ?? "");
  const [productId, setProductId] = useState("");
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "instagram");
  const [contentType, setContentType] = useState("");
  const [frameworkId, setFrameworkId] = useState("");
  const [hookTypeId, setHookTypeId] = useState("");
  const [language] = useState("indonesian");
  const [contentTopicId, setContentTopicId] = useState(searchParams.get("topicId") ?? "");
  const [customPrompt, setCustomPrompt] = useState("");
  const [tonePresetId, setTonePresetId] = useState("");
  const [visualStyleId, setVisualStyleId] = useState("");
  const [objective, setObjective] = useState("");
  const [outputLength, setOutputLength] = useState("");

  // Data
  const [brands, setBrands] = useState<Brand[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [hookTypes, setHookTypes] = useState<HookType[]>([]);
  const [topics, setTopics] = useState<ContentTopic[]>([]);
  const [tonePresets, setTonePresets] = useState<{ id: string; name: string }[]>([]);
  const [visualStyles, setVisualStyles] = useState<{ id: string; name: string }[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [previewItem, setPreviewItem] = useState<{
    id: string;
    contentTitle?: string | null;
    content: Record<string, unknown>;
    status: string;
    createdAt: string;
    request: {
      platform: string;
      contentType: string;
      brand?: { id: string; name: string } | null;
      product?: { id: string; name: string } | null;
    };
    sections: { id: string; sectionType: string; sectionOrder: number; contentText: string }[];
  } | null>(null);

  // Brain context
  const [brainTone, setBrainTone] = useState<string | undefined>();
  const [brainUsp, setBrainUsp] = useState<string | undefined>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [advancedMode, setAdvancedMode] = useState(false);

  const handleViewGeneration = async (gen: Generation) => {
    if (!activeWorkspace) return;
    try {
      const data = await api<{
        data: {
          id: string;
          platform: string;
          contentType: string;
          brand?: { id: string; name: string } | null;
          product?: { id: string; name: string } | null;
          outputs: {
            id: string;
            contentTitle?: string | null;
            content: Record<string, unknown>;
            status: string;
            createdAt: string;
            sections: { id: string; sectionType: string; sectionOrder: number; contentText: string }[];
          }[];
        };
      }>(`/api/workspaces/${activeWorkspace.id}/generations/${gen.id}`);
      const req = (data as any).data ?? data;
      const output = req.outputs?.[0];
      if (!output) {
        showToast("No output available yet", "info");
        return;
      }
      setPreviewItem({
        id: output.id,
        contentTitle: output.contentTitle,
        content: output.content as Record<string, unknown>,
        status: output.status,
        createdAt: output.createdAt,
        request: {
          platform: req.platform ?? gen.platform,
          contentType: req.contentType ?? gen.contentType,
          brand: req.brand ?? gen.brand,
          product: req.product ?? gen.product,
        },
        sections: output.sections ?? [],
      });
    } catch {
      showToast("Failed to load generation details", "error");
    }
  };

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
    if (!activeWorkspace) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [b, p, fw, ht, gen, tp] = await Promise.all([
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products`),
        api<Framework[]>(`/api/taxonomy/frameworks`),
        api<HookType[]>(`/api/taxonomy/hook-types`),
        api<Generation[]>(`/api/workspaces/${activeWorkspace.id}/generations`),
        api<ContentTopic[]>(`/api/workspaces/${activeWorkspace.id}/topics`),
      ]);
      setBrands(b);
      setProducts(p);
      setFrameworks(fw);
      setHookTypes(ht);
      setGenerations(gen);
      setTopics(tp);
      api<{ id: string; name: string }[]>(`/api/taxonomy/tone-presets`).then(setTonePresets).catch(() => {});
      api<{ id: string; name: string }[]>(`/api/taxonomy/visual-styles`).then(setVisualStyles).catch(() => {});
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch brain context when brand/product changes
  useEffect(() => {
    if (!activeWorkspace || !brandId) {
      setBrainTone(undefined);
      setBrainUsp(undefined);
      return;
    }

    (async () => {
      try {
        // Get brand brain for tone
        const brandRes = await api<{ data: Brand }>(`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`);
        const brand = (brandRes as any).data ?? brandRes;
        const activeBrandBrain = brand.brainVersions?.find((v: BrandBrainVersion) => v.isActive);
        setBrainTone(activeBrandBrain?.tone);

        // Get product brain for USP
        if (productId) {
          const productRes = await api<{ data: Product }>(`/api/workspaces/${activeWorkspace.id}/products/${productId}`);
          const product = (productRes as any).data ?? productRes;
          const activeProductBrain = product.brainVersions?.find((v: ProductBrainVersion) => v.isActive);
          setBrainUsp(activeProductBrain?.usp);
        } else {
          setBrainUsp(undefined);
        }
      } catch {
        setBrainTone(undefined);
        setBrainUsp(undefined);
      }
    })();
  }, [activeWorkspace, brandId, productId]);

  useSSE((event) => {
    if (event.type === "generation_complete" || event.type === "generation_failed") {
      loadGenerations();
    }
  });

  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);
  const currentFormats = PLATFORM_FORMATS[platform] ?? [];

  const canGenerate = brandId && productId && platform && contentType && objective;

  const handleSubmit = async () => {
    if (!brandId) { showToast("Please select a brand", "error"); return; }
    if (!productId) { showToast("Please select a product", "error"); return; }
    if (!platform) { showToast("Please select a platform", "error"); return; }
    if (!contentType) { showToast("Please select an output format", "error"); return; }
    if (!objective) { showToast("Please select an objective", "error"); return; }

    setSubmitting(true);
    try {
      await api(`/api/workspaces/${activeWorkspace!.id}/generations`, {
        method: "POST",
        body: JSON.stringify({
          brandId,
          productId: productId || undefined,
          contentTopicId: contentTopicId || undefined,
          platform,
          contentType,
          framework: frameworkId || "PAS",
          hookType: hookTypeId || "curiosity",
          language,
          customPrompt: customPrompt.trim() || undefined,
          tonePresetId: tonePresetId || undefined,
          visualStyleId: visualStyleId || undefined,
          objective: objective || undefined,
          outputLength: outputLength || undefined,
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

  const brandOptions = [
    { value: "", label: "Select brand" },
    ...brands.map((b) => ({ value: b.id, label: b.name })),
  ];
  const productOptions = [
    { value: "", label: "Select product" },
    ...filteredProducts.map((p) => ({ value: p.id, label: `${brands.find((b) => b.id === p.brandId)?.name ?? ""} ${p.name}` })),
  ];
  const frameworkOptions = [{ value: "", label: "PAS (recommended)" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))];
  const hookTypeOptions = [{ value: "", label: "Curiosity (recommended)" }, ...hookTypes.map((h) => ({ value: h.id, label: h.name }))];
  const tonePresetOptions = [{ value: "", label: "Select Tone Variation" }, ...tonePresets.map((t) => ({ value: t.id, label: t.name }))];
  const visualStyleOptions = [{ value: "", label: "Select Visual Style" }, ...visualStyles.map((v) => ({ value: v.id, label: v.name }))];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-black">Content Generator</h1>
          <p className="text-sm text-gray-500 mt-1">
            Generate platform-native content from Brand Brain and Product Brain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">{advancedMode ? "Advanced mode" : "Basic mode"}</span>
          <button
            type="button"
            onClick={() => setAdvancedMode(!advancedMode)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              advancedMode ? "bg-indigo-600" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                advancedMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>
      <ActiveSkillsBadges generator="content" />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="flex gap-6">
          {/* Left Panel — Form */}
          <div className="w-[440px] shrink-0 space-y-5">
            {/* Context Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Context
              </div>

              <Select
                label="Brand"
                options={brandOptions}
                value={brandId}
                onChange={(e) => { setBrandId(e.target.value); setProductId(""); setContentTopicId(""); }}
              />

              {brandId && (
                <>
                  <Select
                    label="Product"
                    options={productOptions}
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  />

                  <SearchableSelect
                    label="Topic (optional)"
                    options={topics
                      .filter((t) => t.brandId === brandId)
                      .map((t) => ({
                        value: t.id,
                        label: t.title,
                        sublabel: [t.pillar, t.platform, t.format].filter(Boolean).join(" \u00B7 "),
                      }))}
                    value={contentTopicId}
                    onChange={setContentTopicId}
                    placeholder="Search topics..."
                  />
                </>
              )}

              <BrainContextCard tone={brainTone} usp={brainUsp} />
            </div>

            {/* Target Section */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Target
              </div>

              {/* Platform */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Platform</label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => {
                        setPlatform(platform === p.value ? "" : p.value);
                        setContentType("");
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        platform === p.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Output Format */}
              {platform && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Output Format <span className="text-red-500">*required</span>
                  </label>
                  <div className="space-y-1">
                    {currentFormats.map((fmt) => (
                      <button
                        key={fmt.value}
                        type="button"
                        onClick={() => setContentType(fmt.value)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-sm transition-colors border ${
                          contentType === fmt.value
                            ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-base">{fmt.icon}</span>
                          <span className="font-medium">{fmt.label}</span>
                        </div>
                        {fmt.badge && <FormatBadge type={fmt.badge} />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Objective */}
              <Select
                label="Objective"
                options={OBJECTIVE_OPTIONS}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
              />
            </div>

            {/* Advanced Mode — Strategy Controls */}
            {advancedMode && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Strategy Controls
                </div>

                <Select
                  label="Framework"
                  options={frameworkOptions}
                  value={frameworkId}
                  onChange={(e) => setFrameworkId(e.target.value)}
                />
                <Select
                  label="Hook Type"
                  options={hookTypeOptions}
                  value={hookTypeId}
                  onChange={(e) => setHookTypeId(e.target.value)}
                />
                <Select
                  label="Tone Variation"
                  options={tonePresetOptions}
                  value={tonePresetId}
                  onChange={(e) => setTonePresetId(e.target.value)}
                />
                <Select
                  label="Visual Style"
                  options={visualStyleOptions}
                  value={visualStyleId}
                  onChange={(e) => setVisualStyleId(e.target.value)}
                />
                <Select
                  label="Output Length"
                  options={OUTPUT_LENGTH_OPTIONS}
                  value={outputLength}
                  onChange={(e) => setOutputLength(e.target.value)}
                />

                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                    Additional Context
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
                    rows={3}
                    placeholder="Add any specific instructions or context..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canGenerate || submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-semibold transition-colors bg-amber-400 text-black hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              Generate Content
            </button>

            {!canGenerate && (
              <p className="text-xs text-gray-400 text-center -mt-2">
                Select brand, product, platform, format and objective to continue
              </p>
            )}
          </div>

          {/* Right Panel — Results / Empty State */}
          <div className="flex-1 min-w-0">
            {generations.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-800">Recent Generations</h2>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Platform</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Format</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {generations.map((gen) => {
                        const ps = getPlatformStyle(gen.platform);
                        return (
                          <tr key={gen.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              <p className="text-sm text-gray-800">{gen.brand?.name ?? "—"}</p>
                              {gen.product?.name && (
                                <p className="text-xs text-gray-400">{gen.product.name}</p>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${ps.bg} ${ps.text}`}>
                                {gen.platform}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-gray-700 capitalize">
                              {gen.contentType?.replace(/_/g, " ")}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusStyle(gen.status)}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(gen.status)}`} />
                                {gen.status}
                              </span>
                              <p className="text-[10px] text-gray-400 mt-0.5">{formatRelativeDate(gen.createdAt)}</p>
                            </td>
                            <td className="px-4 py-2.5">
                              {gen.status === "completed" && (
                                <button
                                  type="button"
                                  onClick={() => handleViewGeneration(gen)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                  <Eye size={14} />
                                  View
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[500px] bg-white border border-gray-200 rounded-xl">
                <svg className="w-16 h-16 text-indigo-200 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                </svg>
                <p className="text-lg font-semibold text-gray-700">Ready to generate</p>
                <p className="text-sm text-gray-400 mt-2 text-center max-w-xs">
                  Configure the left panel and click Generate. FCE will build
                  content tailored to your chosen format — slides, scenes,
                  or single-post copy.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {previewItem && activeWorkspace && (
        <ContentPreviewModal
          item={previewItem}
          workspaceId={activeWorkspace.id}
          onClose={() => setPreviewItem(null)}
          onStatusChange={(id, status) => {
            setPreviewItem((prev) => prev && prev.id === id ? { ...prev, status } : prev);
          }}
          onToast={showToast}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
