import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Globe,
  Building2,
  Mic2,
  Dna,
  Target,
  CircleDot,
  Sparkles,
  Save,
  Loader2,
} from "lucide-react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ScrapeLanguageToggle } from "../components/ui/ScrapeLanguageToggle";
import { useScrapeLanguage } from "../hooks/useScrapeLanguage";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { api, ApiError } from "../services/api";
import {
  BRAND_TABS,
  BRAND_PLATFORM_OPTIONS,
  BRAND_LANGUAGE_OPTIONS,
  INITIAL_BRAND_FORM,
  PillarInput,
  RuleList,
  TagInput,
  generateBrandSlug,
  type BrandFormData,
  type BrandTabKey,
} from "../components/brands/NewBrandBrainDrawer";

/**
 * Full-page create flow for a brand. Replaces the "New Brand" drawer so
 * that creating a brand feels like a primary project action (one brand
 * per project = this is substantial, not a quick-add side panel).
 *
 * Edit still uses the NewBrandBrainDrawer component.
 *
 * Note: this page duplicates the form JSX from the drawer for now. A
 * follow-up will extract a shared BrandBrainForm component so we stop
 * maintaining two copies. See stage-2 in the commit message.
 */
export function NewBrandPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();
  const workspaceId = activeWorkspace?.id;
  const projectId = activeProject?.id;

  const [activeTab, setActiveTab] = useState<BrandTabKey>("overview");
  const [form, setForm] = useState<BrandFormData>({ ...INITIAL_BRAND_FORM });
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [error, setError] = useState("");
  const [scrapeLanguage, setScrapeLanguage] = useScrapeLanguage();

  const update = <K extends keyof BrandFormData>(key: K, value: BrandFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // References tab only applies to existing brands — hide on create.
  const visibleTabs = BRAND_TABS.filter((t) => t.key !== "references");
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
    if (!workspaceId) return;
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
    if (!workspaceId) return;
    if (!form.name.trim()) {
      setError("Brand name is required");
      setActiveTab("overview");
      return;
    }
    setSaving(true);
    setError("");
    try {
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

      navigate("/brands");
    } catch (e) {
      // ApiError exposes the parsed server body — surface it clearly so the
      // 1:1 rule's "project already has a brand" error is readable.
      if (e instanceof ApiError && typeof e.body?.error === "string") {
        setError(e.body.error);
      } else {
        setError(e instanceof Error ? e.message : "Failed to save brand");
      }
    } finally {
      setSaving(false);
    }
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Pick a workspace to create a brand.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/brands")}
            className="mt-1 p-1.5 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="Back to brands"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">New brand</h1>
            <p className="text-sm text-gray-500 mt-1">
              Define the brand's DNA. The AI uses this for every topic and post it
              generates for{" "}
              <span className="font-medium text-gray-700">
                {activeProject?.name ?? "this project"}
              </span>
              .
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" onClick={() => navigate("/brands")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={saving}>
            <Save size={14} className="mr-1.5" />
            Save brand
          </Button>
        </div>
      </div>

      {/* AI scraping banner — same amber style as drawer's headerExtra */}
      {scraping && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2.5 flex items-center gap-2.5">
          <Loader2 size={14} className="text-indigo-600 animate-spin" />
          <span className="text-xs font-medium text-indigo-700">
            AI is analyzing the website and filling in brand details. You can browse tabs while it loads…
          </span>
        </div>
      )}

      {/* Form shell */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex">
          {/* Sidebar tabs */}
          <nav className="w-52 border-r border-gray-200 py-4 shrink-0">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 font-medium border-r-2 border-indigo-600"
                      : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Tab content */}
          <div className="flex-1 min-w-0 px-6 py-5 space-y-5">
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
                              update("platforms", form.platforms.filter((p) => p !== platform));
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

                <PillarInput value={form.contentPillars} onChange={(v) => update("contentPillars", v)} />

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

            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer prev/next nav */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <Button variant="secondary" onClick={goPrev} disabled={isFirst}>
            Previous
          </Button>
          {isLast ? (
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} className="mr-1.5" />
              Save brand
            </Button>
          ) : (
            <Button onClick={goNext}>Next</Button>
          )}
        </div>
      </div>
    </div>
  );
}
