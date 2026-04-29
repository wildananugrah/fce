import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2,
  Globe,
  Palette,
  Sparkles,
  ExternalLink,
  Copy,
  Check,
  Pencil,
  Mic2,
  Dna,
  Target,
  CircleDot,
  FileText,
  X,
  Save,
} from "lucide-react";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { api, ApiError } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { ProductReferences } from "../components/products/ProductReferences";
import {
  BRAND_LANGUAGE_OPTIONS,
  BRAND_PLATFORM_OPTIONS,
  INITIAL_BRAND_FORM,
  PillarInput,
  RuleList,
  TagInput,
  type BrandFormData,
} from "../components/brands/BrandBrainForm";

interface Brand {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  websiteUrl: string | null;
  language?: string;
  status: string;
  brainVersions?: BrainVersion[];
}

// Brand.language is the SSOT — the toggle on /brands/new stores short codes
// ("indonesian" / "english"), but legacy rows may still carry the long label
// ("Bahasa Indonesia" / "English"). Map both shapes to a display label, and
// the inverse direction for save.
function languageStorageToLabel(raw?: string | null): string {
  if (!raw) return "English";
  const v = raw.toLowerCase().trim();
  if (v === "en" || v === "english") return "English";
  if (v === "id" || v === "indonesian" || v === "bahasa indonesia") return "Bahasa Indonesia";
  // Legacy rows may have stored the original label verbatim ("Malay", "Chinese", etc.).
  return raw;
}

function languageLabelToStorage(label: string): string {
  const v = label.trim().toLowerCase();
  if (v === "english") return "english";
  if (v === "bahasa indonesia") return "indonesian";
  return label;
}

interface BrainVersion {
  id: string;
  version: number;
  status: string;
  createdAt: string;
  isActive: boolean;
  personality?: string | null;
  tone?: string | null;
  audiencePersonas?: unknown;
  values?: string[];
  messagingRules?: { do?: string[]; dont?: string[] };
  vocabulary?: {
    preferred?: string[];
    avoided?: string[];
    contentLanguage?: string;
    summary?: string;
    brandPromise?: string;
    usp?: string;
    contentPillars?: string[];
    marketingStrategy?: string;
  };
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

// ─── Helpers ─────────────────────────────────────────────────────

function brandToFormData(brand: Brand): BrandFormData {
  const brain = brand.brainVersions?.find((v) => v.isActive) ?? brand.brainVersions?.[0];
  const vocab = brain?.vocabulary ?? {};
  const rules = brain?.messagingRules ?? {};
  const audience = brain?.audiencePersonas as
    | Array<{ name?: string; traits?: string[] }>
    | undefined;
  const audienceText = Array.isArray(audience)
    ? audience.map((a) => a.traits?.join(", ") ?? a.name ?? "").join("; ")
    : "";
  return {
    ...INITIAL_BRAND_FORM,
    websiteUrl: brand.websiteUrl ?? "",
    name: brand.name,
    industry: brand.category ?? "",
    summary: vocab.summary ?? "",
    tone: brain?.tone ?? "",
    personality: brain?.personality ?? "",
    contentLanguage: languageStorageToLabel(brand.language ?? vocab.contentLanguage),
    platforms: vocab.preferred ?? [],
    targetAudience: audienceText,
    brandValues: Array.isArray(brain?.values) ? brain.values : [],
    brandPromise: vocab.brandPromise ?? "",
    usp: vocab.usp ?? "",
    contentPillars: vocab.contentPillars ?? [],
    marketingStrategy: vocab.marketingStrategy ?? "",
    dos: Array.isArray(rules.do) ? rules.do : [],
    donts: Array.isArray(rules.dont) ? rules.dont : [],
  };
}

function buildBrainPayload(form: BrandFormData) {
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
}

// ─── Page ────────────────────────────────────────────────────────

export function BrandsPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Edit-mode state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BrandFormData | null>(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleDelete = async (brandId: string, brandName: string) => {
    if (!activeWorkspace) return;
    if (
      !window.confirm(
        `Move "${brandName}" to Trash? Its products, topics, and content will be hidden too. You can restore it within 30 days from Workspace Settings → Trash.`,
      )
    )
      return;
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/brands/${brandId}`, {
        method: "DELETE",
      });
      showToast("Brand moved to Trash", "success");
      loadBrands();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to delete brand", "error");
    }
  };

  const loadBrands = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const qs = activeProject ? `?projectId=${activeProject.id}` : "";
      const data = await api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands${qs}`);
      setBrands(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load brands", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, activeProject]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  // If the active project/workspace changes mid-edit, drop the draft so we
  // don't accidentally save against the wrong brand.
  useEffect(() => {
    setEditing(false);
    setDraft(null);
    setEditError("");
  }, [activeProject?.id, activeWorkspace?.id]);

  const startEdit = () => {
    const brand = brands[0];
    if (!brand) return;
    setDraft(brandToFormData(brand));
    setEditError("");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
    setEditError("");
  };

  const saveEdit = async () => {
    if (!activeWorkspace || !draft) return;
    const brand = brands[0];
    if (!brand) return;
    if (!draft.name.trim()) {
      setEditError("Brand name is required.");
      return;
    }
    setSaving(true);
    setEditError("");
    try {
      await api(`/api/workspaces/${activeWorkspace.id}/brands/${brand.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.name.trim(),
          category: draft.industry.trim() || null,
          websiteUrl: draft.websiteUrl.trim() || null,
          language: languageLabelToStorage(draft.contentLanguage),
        }),
      });
      await api(`/api/workspaces/${activeWorkspace.id}/brands/${brand.id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify(buildBrainPayload(draft)),
      });
      await loadBrands();
      setEditing(false);
      setDraft(null);
      showToast("Brand updated", "success");
    } catch (e) {
      if (e instanceof ApiError && typeof e.body?.error === "string") {
        setEditError(e.body.error);
      } else {
        setEditError(e instanceof Error ? e.message : "Failed to save brand");
      }
    } finally {
      setSaving(false);
    }
  };

  const updateDraft = <K extends keyof BrandFormData>(key: K, value: BrandFormData[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to manage brands.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Single CoachMark above both render branches — avoids mounting two instances
  // and prevents state desync when the user creates a brand (branch switches).
  const brandsCoachMark = (
    <CoachMark pageKey="brands" title="Brands" body="Brands hold the voice, audience, and messaging rules that all your content follows. Create one brand per business or sub-brand you manage." />
  );

  // ── Empty state ───────────────────────────────────────────────
  if (brands.length === 0) {
    return (
      <div className="p-6">
        {brandsCoachMark}
        <div className="max-w-xl mx-auto bg-white border border-gray-200 rounded-xl p-10 text-center mt-12">
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <Palette size={24} />
          </div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              {activeProject ? "Set up this project's brand" : "Pick a project first"}
            </h1>
            <HelpButton pageKey="brands" />
          </div>
          <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
            {activeProject
              ? <>Your brand brain powers every generated topic and post. <span className="text-gray-700">{activeProject.name}</span> doesn't have a brand yet — create one to get started.</>
              : "Pick a project from the sidebar (or create a new one) to add a brand."}
          </p>
          <Button
            onClick={() => navigate("/brands/new")}
            disabled={!activeProject}
            title={!activeProject ? "Select or create a project from the sidebar first" : undefined}
          >
            <Sparkles size={14} className="mr-1.5" />
            Create Brand
          </Button>
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    );
  }

  // ── Has-brand state ───────────────────────────────────────────
  const brand = brands[0];
  const brain = brand.brainVersions?.[0];
  const vocab = brain?.vocabulary ?? {};
  const rules = brain?.messagingRules ?? {};
  const audience = Array.isArray(brain?.audiencePersonas)
    ? (brain.audiencePersonas as Array<{ name?: string; traits?: string[] }>)
    : [];
  const values = Array.isArray(brain?.values) ? brain.values : [];
  const pillars = vocab.contentPillars ?? [];
  const platforms = vocab.preferred ?? [];
  const dos = rules.do ?? [];
  const donts = rules.dont ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Brands</h1>
        <HelpButton pageKey="brands" />
      </div>
      {brandsCoachMark}
      {/* ── Hero ─────────────────────────────────────────────── */}
      {editing && draft ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shrink-0">
              {(draft.name || brand.name).charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-4">
              <Input
                label="Brand Name *"
                value={draft.name}
                onChange={(e) => updateDraft("name", e.target.value)}
              />
              <Input
                label="Industry"
                value={draft.industry}
                onChange={(e) => updateDraft("industry", e.target.value)}
                placeholder="e.g. SaaS, F&B, Fashion"
              />
              <div className="col-span-2">
                <Input
                  label="Website URL"
                  value={draft.websiteUrl}
                  onChange={(e) => updateDraft("websiteUrl", e.target.value)}
                  placeholder="https://brand.com"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Summary
                </label>
                <textarea
                  value={draft.summary}
                  onChange={(e) => updateDraft("summary", e.target.value)}
                  placeholder="What does this brand do? Who do they serve? What's their mission?"
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="secondary" onClick={cancelEdit} disabled={saving}>
                <X size={14} className="mr-1.5" />
                Cancel
              </Button>
              <Button onClick={saveEdit} loading={saving}>
                <Save size={14} className="mr-1.5" />
                Save changes
              </Button>
            </div>
          </div>
          {editError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-700 rounded-md px-3 py-2 text-sm"
            >
              {editError}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-start gap-5">
          <div className="w-16 h-16 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl font-bold shrink-0">
            {brand.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900 truncate">{brand.name}</h1>
              {brand.category && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {brand.category}
                </span>
              )}
            </div>
            {brand.websiteUrl && (
              <div className="flex items-center gap-1.5 group/url">
                <Globe size={12} className="text-gray-400 shrink-0" />
                <a
                  href={brand.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-indigo-600 truncate hover:underline"
                >
                  {brand.websiteUrl}
                </a>
                <button
                  type="button"
                  onClick={() => handleCopyUrl(brand.websiteUrl!)}
                  className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                  title="Copy URL"
                  aria-label="Copy website URL"
                >
                  {copiedUrl === brand.websiteUrl ? (
                    <Check size={12} className="text-green-500" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
                <a
                  href={brand.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-gray-300 hover:text-indigo-600 opacity-0 group-hover/url:opacity-100 transition-opacity rounded"
                  title="Open in new tab"
                  aria-label="Open website in new tab"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            )}
            {vocab.summary && (
              <p className="text-sm text-gray-700 leading-relaxed max-w-2xl">{vocab.summary}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={startEdit}>
              <Pencil size={14} className="mr-1.5" />
              Edit
            </Button>
            <button
              onClick={() => handleDelete(brand.id, brand.name)}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-md hover:bg-red-50"
              title="Delete brand"
              aria-label="Delete brand"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Section cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personality & Tone */}
        <SectionCard icon={<Mic2 size={16} className="text-gray-400" />} title="Personality & Tone">
          {editing && draft ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Personality"
                  value={draft.personality}
                  onChange={(e) => updateDraft("personality", e.target.value)}
                  placeholder="e.g. The Trusted Expert"
                />
                <Input
                  label="Tone"
                  value={draft.tone}
                  onChange={(e) => updateDraft("tone", e.target.value)}
                  placeholder="e.g. Friendly, Bold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Language
                </label>
                <select
                  value={draft.contentLanguage}
                  onChange={(e) => updateDraft("contentLanguage", e.target.value)}
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
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Platforms</p>
                <div className="flex flex-wrap gap-2">
                  {BRAND_PLATFORM_OPTIONS.map((p) => {
                    const active = draft.platforms.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          updateDraft(
                            "platforms",
                            active
                              ? draft.platforms.filter((x) => x !== p)
                              : [...draft.platforms, p],
                          )
                        }
                        className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                          active
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <ReadOnlySectionBody
              empty={!brain?.personality && !brain?.tone && !brand.language && !vocab.contentLanguage && platforms.length === 0}
              emptyLabel="No voice set"
            >
              <DefinitionRow label="Personality" value={brain?.personality} />
              <DefinitionRow label="Tone" value={brain?.tone} />
              <DefinitionRow
                label="Language"
                value={languageStorageToLabel(brand.language ?? vocab.contentLanguage)}
              />

              {platforms.length > 0 && (
                <ChipList label="Platforms" items={platforms} />
              )}
            </ReadOnlySectionBody>
          )}
        </SectionCard>

        {/* Audience & Values */}
        <SectionCard icon={<Dna size={16} className="text-gray-400" />} title="Audience & Values">
          {editing && draft ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Target Audience
                </label>
                <textarea
                  value={draft.targetAudience}
                  onChange={(e) => updateDraft("targetAudience", e.target.value)}
                  placeholder="Who is this brand for? Age, role, goals…"
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Values
                </label>
                <TagInput
                  value={draft.brandValues}
                  onChange={(v) => updateDraft("brandValues", v)}
                  placeholder="Type a value and press Enter"
                />
              </div>
              <Input
                label="Brand Promise"
                value={draft.brandPromise}
                onChange={(e) => updateDraft("brandPromise", e.target.value)}
                placeholder="e.g. We help restaurants delight their guests."
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Unique Selling Point
                </label>
                <textarea
                  value={draft.usp}
                  onChange={(e) => updateDraft("usp", e.target.value)}
                  placeholder="What makes this brand stand out?"
                  rows={2}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                />
              </div>
            </>
          ) : (
            <ReadOnlySectionBody
              empty={audience.length === 0 && values.length === 0 && !vocab.brandPromise && !vocab.usp}
              emptyLabel="No brand DNA set"
            >
              {audience.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Audience</p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {audience[0]?.traits?.join(", ") ?? audience[0]?.name ?? ""}
                  </p>
                </div>
              )}
              {values.length > 0 && <ChipList label="Values" items={values} variant="neutral" />}
              <DefinitionRow label="Brand Promise" value={vocab.brandPromise} />
              <DefinitionRow label="Unique Selling Point" value={vocab.usp} multiline />
            </ReadOnlySectionBody>
          )}
        </SectionCard>

        {/* Content Strategy */}
        <SectionCard icon={<Target size={16} className="text-gray-400" />} title="Content Strategy">
          {editing && draft ? (
            <>
              <PillarInput
                value={draft.contentPillars}
                onChange={(v) => updateDraft("contentPillars", v)}
              />
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                  Marketing Strategy
                </label>
                <textarea
                  value={draft.marketingStrategy}
                  onChange={(e) => updateDraft("marketingStrategy", e.target.value)}
                  placeholder="Describe the overall approach, focus areas, funnel strategy…"
                  rows={3}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
                />
              </div>
            </>
          ) : (
            <ReadOnlySectionBody
              empty={pillars.length === 0 && !vocab.marketingStrategy}
              emptyLabel="No strategy set"
            >
              {pillars.length > 0 && (
                <ChipList label={`Pillars (${pillars.length})`} items={pillars} />
              )}
              <DefinitionRow label="Marketing Strategy" value={vocab.marketingStrategy} multiline />
            </ReadOnlySectionBody>
          )}
        </SectionCard>

        {/* Messaging Rules */}
        <SectionCard icon={<CircleDot size={16} className="text-gray-400" />} title="Messaging Rules">
          {editing && draft ? (
            <div className="flex gap-6">
              <RuleList
                label="Do's"
                color="green"
                items={draft.dos}
                onChange={(v) => updateDraft("dos", v)}
                placeholder="e.g. Always lead with a benefit"
              />
              <RuleList
                label="Don'ts"
                color="red"
                items={draft.donts}
                onChange={(v) => updateDraft("donts", v)}
                placeholder="e.g. Never use aggressive sales language"
              />
            </div>
          ) : (
            <ReadOnlySectionBody empty={dos.length === 0 && donts.length === 0} emptyLabel="No rules set">
              {dos.length > 0 && (
                <RuleListReadOnly label={`Do's (${dos.length})`} items={dos} color="green" />
              )}
              {donts.length > 0 && (
                <RuleListReadOnly label={`Don'ts (${donts.length})`} items={donts} color="red" />
              )}
            </ReadOnlySectionBody>
          )}
        </SectionCard>
      </div>

      {/* ── References (always interactive, not tied to edit mode) ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">References</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Files and links the AI uses as reference material when generating content.
          Changes save instantly — no need to enter edit mode.
        </p>
        <ProductReferences workspaceId={activeWorkspace.id} brandId={brand.id} />
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}

// ─── Presentational helpers ──────────────────────────────────────

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function ReadOnlySectionBody({
  empty,
  emptyLabel,
  children,
}: {
  empty?: boolean;
  emptyLabel?: string;
  children: React.ReactNode;
}) {
  if (empty) {
    return <p className="text-xs text-gray-400 italic">{emptyLabel ?? "Not yet configured."}</p>;
  }
  return <>{children}</>;
}

function DefinitionRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-700 ${multiline ? "leading-relaxed" : "truncate"}`}>{value}</p>
    </div>
  );
}

function ChipList({
  label,
  items,
  variant = "indigo",
}: {
  label: string;
  items: string[];
  variant?: "indigo" | "neutral";
}) {
  const chipClass =
    variant === "indigo"
      ? "bg-indigo-50 text-indigo-600"
      : "bg-gray-100 text-gray-700";
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <span key={item} className={`px-2 py-0.5 text-[10px] font-medium rounded ${chipClass}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function RuleListReadOnly({
  label,
  items,
  color,
}: {
  label: string;
  items: string[];
  color: "green" | "red";
}) {
  const labelClass = color === "green" ? "text-green-700" : "text-red-600";
  const dotClass = color === "green" ? "bg-green-500" : "bg-red-500";
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider mb-1 ${labelClass}`}>{label}</p>
      <ul className="text-xs text-gray-700 space-y-0.5">
        {items.slice(0, 3).map((d) => (
          <li key={d} className="flex items-start gap-1.5">
            <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${dotClass}`} />
            <span>{d}</span>
          </li>
        ))}
        {items.length > 3 && <li className="text-gray-400">+{items.length - 3} more</li>}
      </ul>
    </div>
  );
}
