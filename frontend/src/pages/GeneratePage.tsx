import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Trash2, X, Sparkles } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Select } from "../components/ui/Select";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { Spinner } from "../components/ui/Spinner";
import { ContentPreviewModal } from "../components/library/ContentPreviewModal";
import { Toast } from "../components/ui/Toast";
import { ActiveSkillsBadges } from "../components/skills/ActiveSkillsBadges";
import { GenerationResultRow } from "../components/generation/GenerationResultRow";
import { ReferenceImageUpload, type ImageRef } from "../components/ui/ReferenceImageUpload";
import { UrlInspirationChips } from "../components/url-inspiration/UrlInspirationChips";

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

// Language defaults to Bahasa Indonesia — most users here write in
// Indonesian, but English is the common override.
const LANGUAGE_OPTIONS = [
  { value: "indonesian", label: "Bahasa Indonesia" },
  { value: "english", label: "English" },
];

const OBJECTIVE_OPTIONS = [
  { value: "", label: "Select Objective" },
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "education", label: "Education" },
  { value: "conversion", label: "Conversion" },
  { value: "launch", label: "Launch" },
];

// ─── Normalizers for values coming from topics (LLM output) ─────

function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePlatform(raw?: string | null): string {
  if (!raw) return "";
  const k = normKey(raw);
  const match = PLATFORMS.find((p) => normKey(p.value) === k || normKey(p.label) === k);
  if (match) return match.value;
  // Fuzzy hints (e.g. "ig" → instagram, "x" → twitter)
  if (k === "ig") return "instagram";
  if (k === "x") return "twitter";
  return "";
}

// Hand-rolled synonym maps for common LLM variations. Topic generation is
// free-form on the LLM side, so we map noun/verb/adjective variants to the
// canonical option values used by this form.
const OBJECTIVE_SYNONYMS: Record<string, string> = {
  // awareness
  awareness: "awareness",
  aware: "awareness",
  brand: "awareness",
  brandawareness: "awareness",
  discovery: "awareness",
  reach: "awareness",
  // engagement
  engagement: "engagement",
  engage: "engagement",
  interact: "engagement",
  interaction: "engagement",
  community: "engagement",
  // education
  education: "education",
  educate: "education",
  educational: "education",
  inform: "education",
  informational: "education",
  teach: "education",
  learn: "education",
  howto: "education",
  tutorial: "education",
  tip: "education",
  tips: "education",
  // conversion
  conversion: "conversion",
  convert: "conversion",
  sales: "conversion",
  sale: "conversion",
  sell: "conversion",
  promote: "conversion",
  promotion: "conversion",
  promotional: "conversion",
  leadgen: "conversion",
  lead: "conversion",
  // launch
  launch: "launch",
  announcement: "launch",
  announce: "launch",
  reveal: "launch",
  release: "launch",
};

// Map common free-form LLM format phrases to canonical contentType values.
// Key is the platform-agnostic substring (normalized); value is the canonical
// PLATFORM_FORMATS value to try first.
const FORMAT_HINTS: Array<{ match: (k: string) => boolean; value: string }> = [
  { match: (k) => k.includes("carousel"), value: "carousel" },
  { match: (k) => k.includes("reel"), value: "reels" },
  { match: (k) => k === "short" || k.includes("shortvideo") || k.includes("shorts"), value: "reels" },
  { match: (k) => k.includes("storyimage") || k === "story" || k.includes("imagestory"), value: "story_image" },
  { match: (k) => k.includes("storyvideo") || k.includes("videostory"), value: "story_video" },
  { match: (k) => k.includes("singleimage") || k.includes("staticimage") || k === "image" || k.includes("imagewithtext") || k.includes("infographic") || k.includes("poster"), value: "single_image" },
  { match: (k) => k.includes("longvideo") || k.includes("fullvideo"), value: "long_video" },
  { match: (k) => k.includes("thread"), value: "thread" },
  { match: (k) => k.includes("article") || k.includes("blog"), value: "article" },
];

function normalizeContentType(raw: string | null | undefined, platform: string): string {
  if (!raw || !platform) return "";
  const options = PLATFORM_FORMATS[platform] ?? [];
  if (options.length === 0) return "";
  const k = normKey(raw);

  // 1. Exact match on value or label
  const exactVal = options.find((o) => normKey(o.value) === k);
  if (exactVal) return exactVal.value;
  const exactLabel = options.find((o) => normKey(o.label) === k);
  if (exactLabel) return exactLabel.value;

  // 2. Synonym hints — try to resolve against the canonical name, then
  // check if that canonical is actually available on this platform.
  for (const hint of FORMAT_HINTS) {
    if (!hint.match(k)) continue;
    const hinted = options.find((o) => o.value === hint.value);
    if (hinted) return hinted.value;
    // If the exact canonical isn't present, look for any option whose value
    // contains the canonical stem (e.g. "carousel" → "carousel_post" on LinkedIn).
    const hintKey = normKey(hint.value);
    const stemmed = options.find(
      (o) => normKey(o.value).includes(hintKey) || hintKey.includes(normKey(o.value)),
    );
    if (stemmed) return stemmed.value;
  }

  // 3. Bi-directional substring match
  const partial = options.find(
    (o) => normKey(o.value).includes(k) || k.includes(normKey(o.value)),
  );
  return partial?.value ?? "";
}

function normalizeObjective(raw?: string | null): string {
  if (!raw) return "";
  const k = normKey(raw);
  // Direct synonym lookup
  if (OBJECTIVE_SYNONYMS[k]) return OBJECTIVE_SYNONYMS[k];
  // Exact match on canonical value or label
  const match = OBJECTIVE_OPTIONS.find(
    (o) => o.value && (normKey(o.value) === k || normKey(o.label) === k),
  );
  if (match?.value) return match.value;
  // Substring: e.g. "brand awareness campaign" → "awareness"
  for (const [synKey, canonical] of Object.entries(OBJECTIVE_SYNONYMS)) {
    if (k.includes(synKey) || synKey.includes(k)) return canonical;
  }
  return "";
}

const OUTPUT_LENGTH_OPTIONS = [
  { value: "", label: "Select Output Length" },
  { value: "short", label: "Short" },
  { value: "medium", label: "Medium" },
  { value: "long", label: "Long" },
];

// Pastel chip colors for brand-pillar multi-select. Declared locally rather
// than shared with TopicsPage because the two surfaces may drift visually.
const PILLAR_COLORS = [
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-teal-50 text-teal-700 border-teal-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-orange-50 text-orange-700 border-orange-200",
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
  const { activeProject } = useProject();
  const [searchParams, setSearchParams] = useSearchParams();
  const researchContext = searchParams.get("researchContext") || "";
  const researchTitle = searchParams.get("researchTitle") || "";

  // Form state — pre-fill from URL params (e.g., from Topic Library)
  const initialPlatform = normalizePlatform(searchParams.get("platform")) || "instagram";
  const initialContentType = normalizeContentType(searchParams.get("format"), initialPlatform);
  const initialObjective = normalizeObjective(searchParams.get("objective"));

  const [brandId, setBrandId] = useState(searchParams.get("brandId") ?? "");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(() => {
    const ids = searchParams.getAll("productId");
    return ids.length > 0 ? ids : [];
  });
  const [platform, setPlatform] = useState(initialPlatform);
  const [contentType, setContentType] = useState(initialContentType);
  const [frameworkId, setFrameworkId] = useState("");
  const [hookTypeId, setHookTypeId] = useState("");
  const [language, setLanguage] = useState("indonesian");
  const [contentTopicId, setContentTopicId] = useState(searchParams.get("topicId") ?? "");
  const [customPrompt, setCustomPrompt] = useState("");
  const [referenceImages, setReferenceImages] = useState<ImageRef[]>([]);
  const [tonePresetId, setTonePresetId] = useState("");
  const [visualStyleId, setVisualStyleId] = useState("");
  const [objective, setObjective] = useState(initialObjective);
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
  const [brandContentPillars, setBrandContentPillars] = useState<string[]>([]);
  const [selectedPillars, setSelectedPillars] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [selectedGenIds, setSelectedGenIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

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

  const handleGenerationApproved = (genId: string) => {
    setGenerations((prev) => prev.filter((g) => g.id !== genId));
    setSelectedGenIds((prev) => { const next = new Set(prev); next.delete(genId); return next; });
    showToast("Sent to Library as Draft — review it there to approve or reject.", "success");
  };

  const handleGenerationRejected = (genId: string) => {
    setGenerations((prev) => prev.filter((g) => g.id !== genId));
    setSelectedGenIds((prev) => { const next = new Set(prev); next.delete(genId); return next; });
    showToast("Content rejected", "info");
  };

  const toggleSelectGen = (id: string) => {
    setSelectedGenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selectedGenIds.size === 0 || !activeWorkspace) return;
    setBulkDeleting(true);
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/generations/bulk`, {
        method: "DELETE",
        body: JSON.stringify({ ids: Array.from(selectedGenIds) }),
      });
      setGenerations((prev) => prev.filter((g) => !selectedGenIds.has(g.id)));
      showToast(`${selectedGenIds.size} generation${selectedGenIds.size > 1 ? "s" : ""} deleted`, "info");
      setSelectedGenIds(new Set());
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete", "error");
    } finally {
      setBulkDeleting(false);
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
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const [b, p, fw, ht, gen, tp] = await Promise.all([
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`),
        api<Product[]>(`/api/workspaces/${activeWorkspace.id}/products${qs}`),
        api<Framework[]>(`/api/taxonomy/frameworks`),
        api<HookType[]>(`/api/taxonomy/hook-types`),
        api<Generation[]>(`/api/workspaces/${activeWorkspace.id}/generations`),
        api<ContentTopic[]>(`/api/workspaces/${activeWorkspace.id}/topics${qs}`),
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
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Fetch brain context when brand/product changes
  useEffect(() => {
    if (!activeWorkspace || !brandId) {
      setBrainTone(undefined);
      setBrainUsp(undefined);
      setBrandContentPillars([]);
      setSelectedPillars([]);
      return;
    }

    (async () => {
      // Reset on every brand switch so stale Brand-A selections never get
      // submitted against Brand-B's pillar list. Matches the pattern in
      // TopicsPage.tsx.
      setSelectedPillars([]);
      try {
        // Get brand brain for tone
        const brandRes = await api<{ data: Brand }>(`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`);
        const brand = (brandRes as any).data ?? brandRes;
        const activeBrandBrain = brand.brainVersions?.find((v: BrandBrainVersion) => v.isActive);
        setBrainTone(activeBrandBrain?.tone);
        setBrandContentPillars(
          (activeBrandBrain as any)?.vocabulary?.contentPillars ?? [],
        );

        // Get product brain for USP (use first selected product)
        if (selectedProductIds.length > 0) {
          const productRes = await api<{ data: Product }>(`/api/workspaces/${activeWorkspace.id}/products/${selectedProductIds[0]}`);
          const product = (productRes as any).data ?? productRes;
          const activeProductBrain = product.brainVersions?.find((v: ProductBrainVersion) => v.isActive);
          setBrainUsp(activeProductBrain?.usp);
        } else {
          setBrainUsp(undefined);
        }
      } catch {
        setBrainTone(undefined);
        setBrainUsp(undefined);
        setBrandContentPillars([]);
        setSelectedPillars([]);
      }
    })();
  }, [activeWorkspace, brandId, selectedProductIds]);

  useSSE((event) => {
    if (event.type === "generation_complete" || event.type === "generation_failed") {
      loadGenerations();
    }
  });

  const filteredProducts = products.filter((p) => !brandId || p.brandId === brandId);
  const currentFormats = PLATFORM_FORMATS[platform] ?? [];

  const canGenerate = brandId && platform && contentType && objective;

  const handleSubmit = async () => {
    if (!brandId) { showToast("Please select a brand", "error"); return; }
    if (!platform) { showToast("Please select a platform", "error"); return; }
    if (!contentType) { showToast("Please select an output format", "error"); return; }
    if (!objective) { showToast("Please select an objective", "error"); return; }

    setSubmitting(true);
    try {
      const selectedTopic = topics.find((t) => t.id === contentTopicId);
      const resolvedPillars = contentTopicId
        ? selectedTopic?.pillar
          ? [selectedTopic.pillar]
          : []
        : selectedPillars.length > 0
          ? selectedPillars
          : brandContentPillars;

      await api(`/api/workspaces/${activeWorkspace!.id}/generations`, {
        method: "POST",
        body: JSON.stringify({
          brandId,
          productIds: selectedProductIds.length > 0 ? selectedProductIds : undefined,
          contentTopicId: contentTopicId || undefined,
          platform,
          contentType,
          framework: frameworkId || "PAS",
          hookType: hookTypeId || "curiosity",
          language,
          customPrompt: customPrompt.trim() || undefined,
          referenceImages: referenceImages.filter((i) => !i.uploading).map((i) => i.url).length > 0
            ? referenceImages.filter((i) => !i.uploading).map((i) => i.url)
            : undefined,
          tonePresetId: tonePresetId || undefined,
          visualStyleId: visualStyleId || undefined,
          objective: objective || undefined,
          outputLength: outputLength || undefined,
          researchContext: researchContext || undefined,
          pillars: resolvedPillars.length > 0 ? resolvedPillars : undefined,
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

      {researchContext && (
        <div className="flex items-center justify-between rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <Sparkles size={16} />
            <span>Using research as inspiration: {researchTitle || "Research result"}</span>
          </div>
          <button
            onClick={() => {
              searchParams.delete("researchContext");
              searchParams.delete("researchTitle");
              setSearchParams(searchParams);
            }}
            className="text-xs text-violet-400 hover:text-violet-200"
          >
            Dismiss
          </button>
        </div>
      )}

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
                onChange={(e) => { setBrandId(e.target.value); setSelectedProductIds([]); setContentTopicId(""); }}
              />

              {brandId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">
                      Products
                    </label>
                    <p className="text-[11px] text-gray-400 mb-2">
                      Select one or more products (optional)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() =>
                            setSelectedProductIds((prev) =>
                              prev.includes(p.id)
                                ? prev.filter((id) => id !== p.id)
                                : [...prev, p.id]
                            )
                          }
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            selectedProductIds.includes(p.id)
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                              : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                          }`}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            {selectedProductIds.includes(p.id) ? (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            )}
                          </svg>
                          {p.name}
                        </button>
                      ))}
                    </div>
                    {selectedProductIds.length > 0 && (
                      <p className="text-[11px] text-indigo-500 mt-1.5">
                        {selectedProductIds.length} product{selectedProductIds.length > 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>

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
                  {/* Mirror the pillar from the picked topic so the writer can
                      see what angle it was planned under. Blank pillar means
                      the topic was generated from the "mix all pillars" path
                      in Topic Generator — surface that explicitly rather than
                      leaving it empty. */}
                  {contentTopicId ? (() => {
                    const selectedTopic = topics.find((t) => t.id === contentTopicId);
                    if (!selectedTopic) return null;
                    return (
                      <div className="flex items-center gap-2 -mt-1">
                        <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                          Pillar
                        </span>
                        {selectedTopic.pillar ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {selectedTopic.pillar}
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-400 italic">
                            Mixed (no pillar set)
                          </span>
                        )}
                      </div>
                    );
                  })() : (
                    brandId && brandContentPillars.length > 0 && (
                      <div className="pt-2">
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                            Brand Content Pillars
                          </label>
                          <span className="text-[10px] text-gray-400">
                            {selectedPillars.length === 0
                              ? "Mixed (all pillars)"
                              : `Selected: ${selectedPillars.join(", ")}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {brandContentPillars.map((p, i) => {
                            const isSelected = selectedPillars.includes(p);
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() =>
                                  setSelectedPillars((prev) =>
                                    prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
                                  )
                                }
                                className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                    : `${PILLAR_COLORS[i % PILLAR_COLORS.length]} border-transparent hover:border-gray-300`
                                }`}
                              >
                                {p}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5">
                          Pick one or more pillars, or leave blank to mix across all.
                        </p>
                      </div>
                    )
                  )}
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
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                  Objective
                </label>
                <div className="flex flex-wrap gap-2">
                  {OBJECTIVE_OPTIONS.filter((o) => o.value).map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() =>
                        setObjective(objective === o.value ? "" : o.value)
                      }
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        objective === o.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                  Language
                </label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((l) => (
                    <button
                      key={l.value}
                      type="button"
                      onClick={() => setLanguage(l.value)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        language === l.value
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
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

              </div>
            )}

            {/* Additional Direction Section — always visible */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Additional Direction
              </div>

              <div>
                <textarea
                  className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 resize-y min-h-[140px] leading-relaxed"
                  rows={6}
                  placeholder="Add any specific instructions, direction, or context...&#10;&#10;Tip: Paste URLs here — they'll be scraped and used as reference material."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                />
                <p className="text-[10px] text-gray-400 mt-1.5">
                  You can paste URLs — the system will scrape the pages and include the extracted text as AI context.
                </p>
                {activeWorkspace && (
                  <UrlInspirationChips
                    workspaceId={activeWorkspace.id}
                    prompt={customPrompt}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-2">
                  Reference Images (optional)
                </label>
                <ReferenceImageUpload
                  workspaceId={activeWorkspace!.id}
                  images={referenceImages}
                  onChange={setReferenceImages}
                />
              </div>
            </div>

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
                Select brand, platform, format and objective to continue
              </p>
            )}
          </div>

          {/* Right Panel — Results / Empty State */}
          <div className="flex-1 min-w-0">
            {generations.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-800">Recent Generations</h2>
                <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="w-10 px-4 py-2.5">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={generations.length > 0 && generations.every((g) => selectedGenIds.has(g.id))}
                            ref={(el) => {
                              if (!el) return;
                              const count = generations.filter((g) => selectedGenIds.has(g.id)).length;
                              el.indeterminate = count > 0 && count < generations.length;
                            }}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedGenIds(new Set(generations.map((g) => g.id)));
                              } else {
                                setSelectedGenIds(new Set());
                              }
                            }}
                          />
                        </th>
                        <th className="px-4 py-2.5 w-8" />
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Platform</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Format</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="px-4 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {generations.map((gen) => (
                        <GenerationResultRow
                          key={gen.id}
                          generation={gen}
                          workspaceId={activeWorkspace!.id}
                          selected={selectedGenIds.has(gen.id)}
                          onSelect={toggleSelectGen}
                          onApproved={handleGenerationApproved}
                          onRejected={handleGenerationRejected}
                          onDeleted={(genId) => {
                            setGenerations((prev) => prev.filter((g) => g.id !== genId));
                            showToast("Generation deleted", "info");
                          }}
                          onViewFull={handleViewGeneration}
                          getPlatformStyle={getPlatformStyle}
                          getStatusStyle={getStatusStyle}
                          getStatusDot={getStatusDot}
                          formatRelativeDate={formatRelativeDate}
                        />
                      ))}
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
          onSent={() => {
            // The modal just flipped the output's status to "draft". The
            // backend's list filter (findByWorkspace) only returns requests
            // with no outputs OR outputs still in "generated" state — so
            // this request will disappear from the list on reload.
            // Reload instead of doing id correlation gymnastics:
            // previewItem carries the output id, not the generation id.
            setPreviewItem(null);
            loadGenerations();
            showToast(
              "Sent to Library as Draft — review it there to approve or reject.",
              "success",
            );
          }}
        />
      )}

      {/* Bulk Action Bar */}
      {selectedGenIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 bg-gray-900 text-white rounded-xl shadow-2xl border border-gray-800 px-4 py-3 flex items-center gap-3">
          <span className="text-sm font-medium">
            {selectedGenIds.size} item{selectedGenIds.size > 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-5 bg-gray-700" />
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
          >
            <Trash2 size={13} />
            {bulkDeleting ? "Deleting..." : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedGenIds(new Set())}
            disabled={bulkDeleting}
            className="p-1.5 text-gray-400 hover:text-white rounded disabled:opacity-50 transition-colors"
            title="Clear selection"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
