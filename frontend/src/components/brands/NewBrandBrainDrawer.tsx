import { useState, useEffect } from "react";
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
import { Drawer } from "../ui/Drawer";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { api } from "../../services/api";
import { ProductReferences } from "../products/ProductReferences";

// ── Types ──────────────────────────────────────────────────────

interface EditBrand {
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

interface NewBrandBrainDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onCreated: () => void;
  editBrand?: EditBrand | null;
}

interface BrandFormData {
  // Overview
  websiteUrl: string;
  name: string;
  industry: string;
  summary: string;
  // Brand Voice
  tone: string;
  personality: string;
  contentLanguage: string;
  platforms: string[];
  // Brand DNA
  targetAudience: string;
  brandValues: string[];
  brandPromise: string;
  usp: string;
  // Content Strategy
  contentPillars: string[];
  marketingStrategy: string;
  // Do's & Don'ts
  dos: string[];
  donts: string[];
}

const INITIAL_DATA: BrandFormData = {
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

const TABS = [
  { key: "overview", label: "Overview", icon: Globe },
  { key: "voice", label: "Brand Voice", icon: Mic2 },
  { key: "dna", label: "Brand DNA", icon: Dna },
  { key: "strategy", label: "Content Strategy", icon: Target },
  { key: "rules", label: "Do's & Don'ts", icon: CircleDot },
  { key: "references", label: "References", icon: FileText },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PLATFORM_OPTIONS = ["Instagram", "TikTok", "YouTube", "Twitter/X", "LinkedIn", "Facebook"];

const LANGUAGE_OPTIONS = ["English", "Bahasa Indonesia", "Malay", "Chinese", "Japanese", "Korean", "Spanish", "French"];

// ── Tag Input Helper ───────────────────────────────────────────

function TagInput({
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
          className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
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

// ── Pillar Input ───────────────────────────────────────────────

function PillarInput({
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
          className="text-xs text-black font-medium hover:underline flex items-center gap-0.5"
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
              placeholder={`Pillar ${i + 1} (e.g. Education, Inspiration...)`}
              className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="text-gray-400 hover:text-red-500 px-1"
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

// ── Do/Don't List ──────────────────────────────────────────────

function RuleList({
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
          className="text-xs text-black font-medium hover:underline"
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
            className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="text-gray-400 hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────

export function NewBrandBrainDrawer({
  isOpen,
  onClose,
  workspaceId,
  onCreated,
  editBrand,
}: NewBrandBrainDrawerProps) {
  const isEditMode = !!editBrand;
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [form, setForm] = useState<BrandFormData>({ ...INITIAL_DATA });
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load brand data when opening in edit mode
  useEffect(() => {
    if (!isOpen) {
      // Reset form when drawer closes
      setForm({ ...INITIAL_DATA });
      setActiveTab("overview");
      setError("");
      return;
    }
    if (!editBrand) return;

    const loadBrand = async () => {
      setLoading(true);
      try {
        const brand = await api<EditBrand>(`/api/workspaces/${workspaceId}/brands/${editBrand.id}`);
        const brain = brand.brainVersions?.find((v) => v.isActive) ?? brand.brainVersions?.[0];
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
        setError("Failed to load brand data");
      } finally {
        setLoading(false);
      }
    };
    loadBrand();
  }, [isOpen, editBrand, workspaceId]);

  const update = <K extends keyof BrandFormData>(key: K, value: BrandFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const tabIndex = TABS.findIndex((t) => t.key === activeTab);
  const isFirst = tabIndex === 0;
  const isLast = tabIndex === TABS.length - 1;

  const goNext = () => {
    if (!isLast) setActiveTab(TABS[tabIndex + 1].key);
  };
  const goPrev = () => {
    if (!isFirst) setActiveTab(TABS[tabIndex - 1].key);
  };

  function generateSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

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
        body: JSON.stringify({ url: form.websiteUrl.trim() }),
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
        contentPillars: result.contentPillars?.length ? result.contentPillars : prev.contentPillars,
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
        // Update existing brand
        await api(`/api/workspaces/${workspaceId}/brands/${editBrand.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            category: form.industry.trim() || null,
            websiteUrl: form.websiteUrl.trim() || null,
          }),
        });

        // Create new brain version with updated data
        await api(`/api/workspaces/${workspaceId}/brands/${editBrand.id}/brain-versions`, {
          method: "POST",
          body: JSON.stringify(buildBrainPayload()),
        });
      } else {
        // Create new brand
        const brand = await api<{ id: string }>(`/api/workspaces/${workspaceId}/brands`, {
          method: "POST",
          body: JSON.stringify({
            name: form.name.trim(),
            slug: generateSlug(form.name.trim()),
            category: form.industry.trim() || undefined,
            websiteUrl: form.websiteUrl.trim() || undefined,
          }),
        });

        await api(`/api/workspaces/${workspaceId}/brands/${brand.id}/brain-versions`, {
          method: "POST",
          body: JSON.stringify(buildBrainPayload()),
        });
      }

      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isEditMode ? editBrand!.name : "New Brand Brain"}
      subtitle={isEditMode ? "Edit brand DNA and AI configuration." : "Define your brand's DNA for AI-powered content generation."}
      headerActions={
        <Button onClick={handleSave} loading={saving} size="sm">
          <Save size={14} className="mr-1.5" />
          {isEditMode ? "Save Changes" : "Save Brand"}
        </Button>
      }
      headerExtra={
        scraping ? (
          <div className="px-6 py-2.5 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2.5 shrink-0">
            <Loader2 size={14} className="text-indigo-600 animate-spin" />
            <span className="text-xs font-medium text-indigo-700">
              AI is analyzing the website and filling in brand details. You can browse tabs while it loads...
            </span>
          </div>
        ) : null
      }
    >
      <div className="flex h-full">
        {/* Sidebar tabs */}
        <nav className="w-48 border-r border-gray-200 py-4 shrink-0">
          {TABS.map((tab) => {
            if (tab.key === "references" && !editBrand) return null;
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                  isActive
                    ? "bg-gray-100 text-black font-medium border-r-2 border-black"
                    : "text-gray-500 hover:text-black hover:bg-gray-50"
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Tab content */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-gray-400 animate-spin" />
              </div>
            ) : (<>
            {activeTab === "overview" && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={18} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-black">Website</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Enter the brand website URL to auto-fill brand information using AI.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={form.websiteUrl}
                      onChange={(e) => update("websiteUrl", e.target.value)}
                      placeholder="https://brand.com"
                      className="flex-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
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
                    <h3 className="text-sm font-semibold text-black">Brand Info</h3>
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
                        placeholder="What does this brand do? Who do they serve? What's their mission? This becomes the AI's core understanding of the brand."
                        rows={4}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none resize-y"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Auto-filled from website scan, or write manually.
                      </p>
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
                    <h3 className="text-sm font-semibold text-black">Brand Voice</h3>
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
                    placeholder="e.g. Professional, Friendly, Bold, Empathetic"
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
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black focus:border-black focus:ring-1 focus:ring-black focus:outline-none"
                  >
                    {LANGUAGE_OPTIONS.map((lang) => (
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
                    {PLATFORM_OPTIONS.map((platform) => {
                      const active = form.platforms.includes(platform);
                      return (
                        <button
                          key={platform}
                          type="button"
                          onClick={() => {
                            if (active) {
                              update("platforms", form.platforms.filter((p) => p !== platform));
                            } else {
                              update("platforms", [...form.platforms, platform]);
                            }
                          }}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? "bg-black text-white border-black"
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
                    <h3 className="text-sm font-semibold text-black">Brand DNA</h3>
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
                    placeholder="Who is this brand for? Age, role, pain points, goals, lifestyle..."
                    rows={3}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none resize-y"
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
                    placeholder="What makes this brand stand out? Key differentiators vs. competitors..."
                    rows={3}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none resize-y"
                  />
                </div>
              </>
            )}

            {activeTab === "strategy" && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Target size={18} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-black">Content Strategy</h3>
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
                    placeholder="Describe the overall marketing approach, focus areas, campaign types, funnel strategy..."
                    rows={4}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black placeholder-gray-400 focus:border-black focus:ring-1 focus:ring-black focus:outline-none resize-y"
                  />
                </div>
              </>
            )}

            {activeTab === "rules" && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <CircleDot size={18} className="text-gray-500" />
                    <h3 className="text-sm font-semibold text-black">Content Rules</h3>
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
                    <h3 className="text-sm font-semibold text-black">Brand References</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    Upload files or add links as reference material. These will be used by the AI when generating content for this brand.
                  </p>
                </div>
                <ProductReferences
                  workspaceId={workspaceId}
                  brandId={editBrand.id}
                />
              </>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
            </>)}
          </div>

          {/* Footer navigation */}
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
                Save Brand
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
    </Drawer>
  );
}
