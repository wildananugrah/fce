import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
  type ReactNode,
} from "react";
import {
  Globe,
  Building2,
  Mic2,
  Dna,
  Target,
  CircleDot,
  FileText,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Save,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ScrapeLanguageToggle } from "../ui/ScrapeLanguageToggle";
import { useScrapeLanguage } from "../../hooks/useScrapeLanguage";
import { api, ApiError } from "../../services/api";
import { ProductReferences } from "../products/ProductReferences";

// ─── Types ──────────────────────────────────────────────────────

export interface EditBrand {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  websiteUrl: string | null;
  brainVersions?: {
    id: string;
    version: number;
    personality?: string | null;
    tone?: string | null;
    audiencePersonas?: any;
    values?: any;
    messagingRules?: any;
    vocabulary?: any;
    isActive: boolean;
  }[];
}

export interface BrandFormData {
  websiteUrl: string;
  name: string;
  industry: string;
  summary: string;
  tone: string;
  personality: string;
  contentLanguage: string;
  platforms: string[];
  targetAudience: string;
  brandValues: string[];
  brandPromise: string;
  usp: string;
  contentPillars: string[];
  marketingStrategy: string;
  dos: string[];
  donts: string[];
}

export const INITIAL_BRAND_FORM: BrandFormData = {
  websiteUrl: "",
  name: "",
  industry: "",
  summary: "",
  tone: "",
  personality: "",
  contentLanguage: "English",
  platforms: [],
  targetAudience: "",
  brandValues: [],
  brandPromise: "",
  usp: "",
  contentPillars: [],
  marketingStrategy: "",
  dos: [],
  donts: [],
};

export const BRAND_TABS = [
  { key: "overview", label: "Overview", icon: Globe },
  { key: "voice", label: "Brand Voice", icon: Mic2 },
  { key: "dna", label: "Brand DNA", icon: Dna },
  { key: "strategy", label: "Content Strategy", icon: Target },
  { key: "rules", label: "Do's & Don'ts", icon: CircleDot },
  { key: "references", label: "References", icon: FileText },
] as const;

export type BrandTabKey = (typeof BRAND_TABS)[number]["key"];

export const BRAND_PLATFORM_OPTIONS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Twitter/X",
  "LinkedIn",
  "Facebook",
];

export const BRAND_LANGUAGE_OPTIONS = [
  "English",
  "Bahasa Indonesia",
  "Malay",
  "Chinese",
  "Japanese",
  "Korean",
  "Spanish",
  "French",
];

export function generateBrandSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Sub-components (tag inputs, rule lists, etc.) ─────────────

export function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
      setInput("");
    }
  };
  return (
    <div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        />
        <Button variant="secondary" size="sm" onClick={add}>
          Add
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-gray-400 mt-2">No values added yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-xs text-gray-700 rounded-md"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== tag))}
                className="text-gray-400 hover:text-red-500"
                aria-label={`Remove ${tag}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PillarInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">Content Pillars</p>
        <button
          type="button"
          onClick={() => onChange([...value, ""])}
          className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-0.5"
        >
          + Add Pillar
        </button>
      </div>
      {value.length === 0 ? (
        <button
          type="button"
          onClick={() => onChange([""])}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg py-4 text-sm text-gray-400 hover:border-gray-400 transition-colors flex items-center justify-center gap-1"
        >
          <Plus size={14} />
          Add First Pillar
        </button>
      ) : (
        value.map((pillar, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={pillar}
              onChange={(e) => {
                const next = [...value];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder={`Pillar ${i + 1} (e.g. Education, Inspiration…)`}
              className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 px-1"
              aria-label={`Remove pillar ${i + 1}`}
            >
              <X size={14} />
            </button>
          </div>
        ))
      )}
      <p className="text-xs text-gray-400">
        Content pillars define the recurring themes the brand consistently communicates about.
      </p>
    </div>
  );
}

export function RuleList({
  label,
  color,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  color: "green" | "red";
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const dotColor = color === "green" ? "bg-green-500" : "bg-red-500";
  const labelColor = color === "green" ? "text-green-700" : "text-red-600";
  return (
    <div className="flex-1 space-y-2">
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}>
          {color === "green" ? "✓" : "✗"} {label}
        </span>
        <button
          type="button"
          onClick={() => onChange([...items, ""])}
          className="text-xs text-indigo-600 font-medium hover:underline"
        >
          + Add
        </button>
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} />
          <input
            value={item}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={placeholder}
            className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-gray-400 hover:text-red-500"
            aria-label={`Remove ${label} item`}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Main form ──────────────────────────────────────────────────

export interface BrandBrainFormHandle {
  /** Trigger a save from outside the form (e.g. a parent's header button). */
  save: () => Promise<void>;
}

interface BrandBrainFormProps {
  workspaceId: string;
  /** Required for create; ignored for edit. */
  projectId?: string;
  /** If set, form loads this brand's data and saves as edit. */
  editBrand?: EditBrand | null;
  /** Called after a successful save. Parent decides what to do (close drawer, redirect). */
  onSaved: () => void;
  /** Parent can mirror saving state (e.g. disable a header button). */
  onSavingChange?: (saving: boolean) => void;
  /**
   * If provided, the "scraping" banner renders via this callback instead
   * of at the top of the form — lets the drawer show it in its
   * `headerExtra` slot to match the existing layout.
   */
  renderScrapingBanner?: (banner: ReactNode) => void;
}

export const BrandBrainForm = forwardRef<BrandBrainFormHandle, BrandBrainFormProps>(
  function BrandBrainForm(props, ref) {
    const { workspaceId, projectId, editBrand, onSaved, onSavingChange, renderScrapingBanner } =
      props;
    const isEditMode = !!editBrand;

    const [activeTab, setActiveTab] = useState<BrandTabKey>("overview");
    const [form, setForm] = useState<BrandFormData>({ ...INITIAL_BRAND_FORM });
    const [saving, setSaving] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [scrapeLanguage, setScrapeLanguage] = useScrapeLanguage();

    // Mirror saving state to parent so a header Save button can show "Saving…"
    useEffect(() => {
      onSavingChange?.(saving);
    }, [saving, onSavingChange]);

    // Load brand data when mounting in edit mode (or when editBrand.id changes).
    useEffect(() => {
      if (!editBrand) {
        setForm({ ...INITIAL_BRAND_FORM });
        setActiveTab("overview");
        setError("");
        return;
      }
      let cancelled = false;
      (async () => {
        setLoading(true);
        try {
          const brand = await api<EditBrand>(
            `/api/workspaces/${workspaceId}/brands/${editBrand.id}`,
          );
          if (cancelled) return;
          const brain =
            brand.brainVersions?.find((v) => v.isActive) ?? brand.brainVersions?.[0];
          const vocab = brain?.vocabulary ?? {};
          const rules = brain?.messagingRules ?? {};
          const audience = brain?.audiencePersonas;
          const audienceText = Array.isArray(audience)
            ? audience.map((a: any) => a.traits?.join(", ") ?? a.name).join("; ")
            : "";

          setForm({
            websiteUrl: brand.websiteUrl ?? "",
            name: brand.name,
            industry: brand.category ?? "",
            summary: vocab.summary ?? "",
            tone: brain?.tone ?? "",
            personality: brain?.personality ?? "",
            contentLanguage: vocab.contentLanguage ?? "English",
            platforms: vocab.preferred ?? [],
            targetAudience: audienceText,
            brandValues: Array.isArray(brain?.values) ? brain.values : [],
            brandPromise: vocab.brandPromise ?? "",
            usp: vocab.usp ?? "",
            contentPillars: vocab.contentPillars ?? [],
            marketingStrategy: vocab.marketingStrategy ?? "",
            dos: Array.isArray(rules.do) ? rules.do : [],
            donts: Array.isArray(rules.dont) ? rules.dont : [],
          });
        } catch {
          if (!cancelled) setError("Failed to load brand data");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [editBrand?.id, workspaceId]);

    const update = <K extends keyof BrandFormData>(key: K, value: BrandFormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    };

    // References tab only makes sense for an existing brand.
    const visibleTabs = BRAND_TABS.filter((t) => (t.key === "references" ? isEditMode : true));
    const tabIndex = visibleTabs.findIndex((t) => t.key === activeTab);
    const isFirst = tabIndex === 0;
    const isLast = tabIndex === visibleTabs.length - 1;

    const goNext = () => {
      if (!isLast) setActiveTab(visibleTabs[tabIndex + 1].key);
    };
    const goPrev = () => {
      if (!isFirst) setActiveTab(visibleTabs[tabIndex - 1].key);
    };

    const handleAutoFill = async () => {
      if (!form.websiteUrl.trim()) return;
      setScraping(true);
      setError("");
      try {
        const result = await api<{
          name: string;
          category?: string;
          summary?: string;
          personality?: string;
          tone?: string;
          targetAudience?: string;
          brandPromise?: string;
          usp?: string;
          values?: string[];
          contentPillars?: string[];
          marketingStrategy?: string;
          dos?: string[];
          donts?: string[];
        }>(`/api/workspaces/${workspaceId}/brands/scrape-preview`, {
          method: "POST",
          body: JSON.stringify({ url: form.websiteUrl.trim(), language: scrapeLanguage }),
        });
        setForm((prev) => ({
          ...prev,
          name: result.name || prev.name,
          industry: result.category || prev.industry,
          summary: result.summary || prev.summary,
          personality: result.personality || prev.personality,
          tone: result.tone || prev.tone,
          targetAudience: result.targetAudience || prev.targetAudience,
          brandPromise: result.brandPromise || prev.brandPromise,
          usp: result.usp || prev.usp,
          brandValues: result.values?.length ? result.values : prev.brandValues,
          contentPillars: result.contentPillars?.length
            ? result.contentPillars
            : prev.contentPillars,
          marketingStrategy: result.marketingStrategy || prev.marketingStrategy,
          dos: result.dos?.length ? result.dos : prev.dos,
          donts: result.donts?.length ? result.donts : prev.donts,
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Auto-fill failed");
      } finally {
        setScraping(false);
      }
    };

    const buildBrainPayload = () => {
      const messagingRules: Record<string, string[]> = {};
      if (form.dos.filter(Boolean).length > 0) messagingRules.do = form.dos.filter(Boolean);
      if (form.donts.filter(Boolean).length > 0) messagingRules.dont = form.donts.filter(Boolean);
      return {
        personality: form.personality.trim() || undefined,
        tone: form.tone.trim() || undefined,
        audiencePersonas: form.targetAudience.trim()
          ? [{ name: "Primary", traits: [form.targetAudience.trim()] }]
          : undefined,
        values: form.brandValues.length > 0 ? form.brandValues : undefined,
        messagingRules: Object.keys(messagingRules).length > 0 ? messagingRules : undefined,
        vocabulary: {
          preferred: form.platforms,
          contentLanguage: form.contentLanguage,
          brandPromise: form.brandPromise.trim() || undefined,
          usp: form.usp.trim() || undefined,
          summary: form.summary.trim() || undefined,
          contentPillars: form.contentPillars.filter(Boolean),
          marketingStrategy: form.marketingStrategy.trim() || undefined,
        },
      };
    };

    const handleSave = async () => {
      if (!form.name.trim()) {
        setError("Brand name is required");
        setActiveTab("overview");
        return;
      }
      setSaving(true);
      setError("");
      try {
        if (isEditMode && editBrand) {
          await api(`/api/workspaces/${workspaceId}/brands/${editBrand.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              name: form.name.trim(),
              category: form.industry.trim() || null,
              websiteUrl: form.websiteUrl.trim() || null,
            }),
          });
          await api(`/api/workspaces/${workspaceId}/brands/${editBrand.id}/brain-versions`, {
            method: "POST",
            body: JSON.stringify(buildBrainPayload()),
          });
        } else {
          const brand = await api<{ id: string }>(`/api/workspaces/${workspaceId}/brands`, {
            method: "POST",
            body: JSON.stringify({
              name: form.name.trim(),
              slug: generateBrandSlug(form.name.trim()),
              category: form.industry.trim() || undefined,
              websiteUrl: form.websiteUrl.trim() || undefined,
              projectId,
            }),
          });
          await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/brain-versions`, {
            method: "POST",
            body: JSON.stringify(buildBrainPayload()),
          });
        }
        onSaved();
      } catch (e) {
        if (e instanceof ApiError && typeof e.body?.error === "string") {
          setError(e.body.error);
        } else {
          setError(e instanceof Error ? e.message : "Failed to save brand");
        }
      } finally {
        setSaving(false);
      }
    };

    useImperativeHandle(ref, () => ({ save: handleSave }), [handleSave]);

    // Scraping banner — either rendered inline by the form (default) or passed
    // up to the parent for placement (used by the drawer).
    const scrapingBanner = scraping ? (
      <div className="bg-indigo-50 border border-indigo-100 rounded-md px-4 py-2.5 flex items-center gap-2.5">
        <Loader2 size={14} className="text-indigo-600 animate-spin" />
        <span className="text-xs font-medium text-indigo-700">
          AI is analyzing the website and filling in brand details. You can browse tabs while it loads…
        </span>
      </div>
    ) : null;

    useEffect(() => {
      renderScrapingBanner?.(scrapingBanner);
      // scrapingBanner is a plain JSX literal so identity changes every render;
      // only fire the callback when the underlying `scraping` flag flips.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scraping, renderScrapingBanner]);

    return (
      <div className="flex h-full min-h-0">
        {/* Sidebar tabs */}
        <nav className="w-52 border-r border-gray-200 py-4 shrink-0" aria-label="Brand brain sections">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-current={isActive ? "page" : undefined}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-600"
                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content + footer */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Inline scraping banner when the parent isn't rendering it for us. */}
            {!renderScrapingBanner && scrapingBanner}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-gray-400 animate-spin" />
              </div>
            ) : (
              <>
                {activeTab === "overview" && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Globe size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Website</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Enter the brand website URL to auto-fill brand information using AI.
                      </p>
                      <div className="flex gap-2 items-stretch">
                        <input
                          value={form.websiteUrl}
                          onChange={(e) => update("websiteUrl", e.target.value)}
                          placeholder="https://brand.com"
                          className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        />
                        <ScrapeLanguageToggle
                          value={scrapeLanguage}
                          onChange={setScrapeLanguage}
                          disabled={scraping}
                        />
                        <Button
                          variant="secondary"
                          onClick={handleAutoFill}
                          loading={scraping}
                          disabled={!form.websiteUrl.trim()}
                        >
                          <Sparkles size={14} className="mr-1.5" />
                          Auto-fill from Website
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Brand Info</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">Core identity of this brand.</p>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Brand Name *"
                            value={form.name}
                            onChange={(e) => update("name", e.target.value)}
                            placeholder="e.g. TableCheck"
                          />
                          <Input
                            label="Industry"
                            value={form.industry}
                            onChange={(e) => update("industry", e.target.value)}
                            placeholder="e.g. SaaS, F&B, Fashion, Healthcare"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                            Brand Summary
                          </label>
                          <textarea
                            value={form.summary}
                            onChange={(e) => update("summary", e.target.value)}
                            placeholder="What does this brand do? Who do they serve? What's their mission?"
                            rows={4}
                            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "voice" && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Mic2 size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Brand Voice</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        How this brand communicates — guides tone in every generated piece.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Tone of Voice"
                        value={form.tone}
                        onChange={(e) => update("tone", e.target.value)}
                        placeholder="e.g. Professional, Friendly, Bold"
                      />
                      <Input
                        label="Brand Personality"
                        value={form.personality}
                        onChange={(e) => update("personality", e.target.value)}
                        placeholder="e.g. The Trusted Expert, The Bold Disruptor"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Content Language
                      </label>
                      <select
                        value={form.contentLanguage}
                        onChange={(e) => update("contentLanguage", e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      >
                        {BRAND_LANGUAGE_OPTIONS.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Social Media Platforms
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {BRAND_PLATFORM_OPTIONS.map((platform) => {
                          const active = form.platforms.includes(platform);
                          return (
                            <button
                              key={platform}
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                if (active) {
                                  update(
                                    "platforms",
                                    form.platforms.filter((p) => p !== platform),
                                  );
                                } else {
                                  update("platforms", [...form.platforms, platform]);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                active
                                  ? "bg-indigo-600 text-white border-indigo-600"
                                  : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                              }`}
                            >
                              {platform}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {activeTab === "dna" && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Dna size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Brand DNA</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        The core beliefs, audience, and unique position of this brand.
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Target Audience
                      </label>
                      <textarea
                        value={form.targetAudience}
                        onChange={(e) => update("targetAudience", e.target.value)}
                        placeholder="Who is this brand for? Age, role, pain points, goals, lifestyle…"
                        rows={3}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Brand Values
                      </label>
                      <TagInput
                        value={form.brandValues}
                        onChange={(v) => update("brandValues", v)}
                        placeholder="Type a value and press Enter (e.g. Innovation)"
                      />
                    </div>
                    <Input
                      label="Brand Promise"
                      value={form.brandPromise}
                      onChange={(e) => update("brandPromise", e.target.value)}
                      placeholder="e.g. We help restaurants fill seats and delight guests."
                    />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Unique Selling Points
                      </label>
                      <textarea
                        value={form.usp}
                        onChange={(e) => update("usp", e.target.value)}
                        placeholder="What makes this brand stand out? Key differentiators vs. competitors…"
                        rows={3}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                      />
                    </div>
                  </>
                )}

                {activeTab === "strategy" && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Target size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Content Strategy</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        The recurring themes and approach that shape all content.
                      </p>
                    </div>
                    <PillarInput
                      value={form.contentPillars}
                      onChange={(v) => update("contentPillars", v)}
                    />
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                        Marketing Strategy
                      </label>
                      <textarea
                        value={form.marketingStrategy}
                        onChange={(e) => update("marketingStrategy", e.target.value)}
                        placeholder="Describe the overall marketing approach, focus areas, campaign types, funnel strategy…"
                        rows={4}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                      />
                    </div>
                  </>
                )}

                {activeTab === "rules" && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <CircleDot size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Content Rules</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">
                        Hard rules the AI will always follow when generating content for this brand.
                      </p>
                    </div>
                    <div className="flex gap-6">
                      <RuleList
                        label="Do's"
                        color="green"
                        items={form.dos}
                        onChange={(v) => update("dos", v)}
                        placeholder="e.g. Always lead with a benefit"
                      />
                      <RuleList
                        label="Don'ts"
                        color="red"
                        items={form.donts}
                        onChange={(v) => update("donts", v)}
                        placeholder="e.g. Never use aggressive sales language"
                      />
                    </div>
                  </>
                )}

                {activeTab === "references" && editBrand && (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={18} className="text-gray-500" />
                        <h3 className="text-sm font-semibold text-gray-900">Brand References</h3>
                      </div>
                      <p className="text-xs text-gray-500 mb-4">
                        Upload files or add links as reference material. These will be used by the AI
                        when generating content for this brand.
                      </p>
                    </div>
                    <ProductReferences workspaceId={workspaceId} brandId={editBrand.id} />
                  </>
                )}

                {error && (
                  <div
                    role="alert"
                    className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm"
                  >
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Prev / Next / Save footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-between shrink-0">
            {!isFirst ? (
              <Button variant="secondary" onClick={goPrev}>
                <ChevronLeft size={14} className="mr-1" />
                Previous
              </Button>
            ) : (
              <div />
            )}
            {isLast ? (
              <Button onClick={handleSave} loading={saving}>
                <Save size={14} className="mr-1.5" />
                {isEditMode ? "Save changes" : "Save brand"}
              </Button>
            ) : (
              <Button onClick={goNext}>
                Next
                <ChevronRight size={14} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  },
);
