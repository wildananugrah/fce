import { useCallback, useEffect, useState } from "react";
import { Calendar, Edit2, Sparkles, X } from "lucide-react";
import { useSSE } from "../../hooks/useSSE";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { getPillarColor } from "../../utils/pillar-colors";
import { getFormatStyle } from "../../utils/topic-styles";

interface Brand {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  title: string;
  description?: string | null;
  pillar?: string | null;
  platform?: string | null;
  format?: string | null;
  objective?: string | null;
  publishDate?: string | null;
  status: string;
  brandId?: string | null;
  products?: Array<{ id: string; product: { id: string; name: string } }>;
  brand?: { id: string; name: string } | null;
  createdAt: string;
}

type ToastType = "success" | "error" | "info";

interface PlannerTopicGeneratorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  brands: Brand[];
  initialBrandId: string;
  initialDate?: string | null;
  onSavedTopics: () => void;
  onEditTopic: (topic: Topic) => void;
  onToast: (msg: string, type: ToastType) => void;
}

const PLATFORMS: Array<{ value: string; label: string }> = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "facebook", label: "Facebook" },
];

const OBJECTIVES: Array<{ value: string; label: string }> = [
  { value: "awareness", label: "Awareness" },
  { value: "engagement", label: "Engagement" },
  { value: "education", label: "Education" },
  { value: "conversion", label: "Conversion" },
  { value: "retention", label: "Retention" },
];

const FORMATS: Array<{ value: string; label: string; icon: string }> = [
  { value: "single_image", label: "Single Image", icon: "🖼️" },
  { value: "carousel", label: "Carousel", icon: "🎠" },
  { value: "reels", label: "Reels", icon: "🎬" },
  { value: "story_image", label: "Story – Image", icon: "📱" },
  { value: "story_video", label: "Story – Video", icon: "📹" },
];

function defaultDateFrom(): string {
  return new Date().toISOString().split("T")[0];
}

function defaultDateTo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 2);
  return d.toISOString().split("T")[0];
}

function formatDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function PlannerTopicGeneratorPanel({
  isOpen,
  onClose,
  workspaceId,
  brands,
  initialBrandId,
  initialDate,
  onSavedTopics,
  onEditTopic,
  onToast,
}: PlannerTopicGeneratorPanelProps) {
  const [brandId, setBrandId] = useState(initialBrandId);
  const [platform, setPlatform] = useState("instagram");
  const [objective, setObjective] = useState("awareness");
  const [language, setLanguage] = useState<"indonesian" | "english">("indonesian");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["single_image", "carousel"]);
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [count, setCount] = useState(6);

  const [generating, setGenerating] = useState(false);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [generatedTopics, setGeneratedTopics] = useState<Topic[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset brandId if the initial prop changes (e.g. user changed brand on calendar
  // before opening the panel).
  useEffect(() => {
    if (!isOpen) return;
    setBrandId(initialBrandId);
    if (initialDate) {
      setDateFrom(initialDate);
      setDateTo(initialDate);
    }
  }, [isOpen, initialBrandId, initialDate]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useSSE((event) => {
    if (!isOpen) return;
    if (event.type === "topic_generation_complete" || event.type === "topics_generated") {
      setGenerating(false);
      setPendingRunId(null);
      // Fetch fresh topic list and pick the most recently created drafts for
      // this brand. Backend persists generated topics as drafts during the
      // run, so this lights them up in the right column.
      api<Topic[]>(`/api/workspaces/${workspaceId}/topics`)
        .then((all) => {
          const recent = all
            .filter((t) => t.status === "draft" && (t.brand?.id ?? t.brandId) === brandId)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, count);
          setGeneratedTopics(recent);
          onToast("Topics generated", "success");
        })
        .catch((e) => {
          onToast(e instanceof Error ? e.message : "Failed to load generated topics", "error");
        });
    }
    if (event.type === "topic_generation_failed") {
      setGenerating(false);
      setPendingRunId(null);
      onToast("Topic generation failed", "error");
    }
  });

  const toggleFormat = (value: string) => {
    setSelectedFormats((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleGenerate = useCallback(async () => {
    if (!brandId) {
      onToast("Pick a brand first", "error");
      return;
    }
    if (selectedFormats.length === 0) {
      onToast("Pick at least one content format", "error");
      return;
    }
    setGenerating(true);
    setGeneratedTopics([]);
    try {
      const res = await api<{ runId: string; jobId: string }>(
        `/api/workspaces/${workspaceId}/topics/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            brandId,
            formats: selectedFormats,
            platform,
            objective,
            dateFrom,
            dateTo,
            count,
            language,
          }),
        },
      );
      setPendingRunId(res?.runId ?? null);
      onToast("Generating topics…", "info");
    } catch (e) {
      setGenerating(false);
      onToast(e instanceof Error ? e.message : "Failed to start generation", "error");
    }
  }, [
    brandId,
    selectedFormats,
    platform,
    objective,
    dateFrom,
    dateTo,
    count,
    language,
    workspaceId,
    onToast,
  ]);

  const handleSaveAll = useCallback(() => {
    // Topics are already persisted as drafts by the backend during generation,
    // so "Save All" here is just a UX confirmation that closes the panel and
    // refreshes the calendar. (The deck's "Save All Topics" button has the
    // same effect — slide 3.)
    setSaving(true);
    onSavedTopics();
    onToast(`Saved ${generatedTopics.length} topic${generatedTopics.length === 1 ? "" : "s"}`, "success");
    setSaving(false);
    onClose();
  }, [generatedTopics.length, onSavedTopics, onClose, onToast]);

  if (!isOpen) return null;

  const activeBrandName = brands.find((b) => b.id === brandId)?.name ?? "—";

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-6xl flex-col bg-white shadow-xl animate-slide-in-right">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Topic Generator</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Generate native topics from {activeBrandName}'s brand brain.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — two columns on lg+, stacked below */}
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Form column */}
          <div className="flex w-full flex-col overflow-y-auto border-b border-gray-200 lg:w-[440px] lg:shrink-0 lg:border-b-0 lg:border-r">
            <div className="space-y-6 p-6">
              <FormSection title="Context">
                <Field label="Brand">
                  <select
                    value={brandId}
                    onChange={(e) => setBrandId(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </FormSection>

              <FormSection title="Platform & Objective">
                <Field label="Platform">
                  <ChipGroup
                    value={platform}
                    onChange={setPlatform}
                    options={PLATFORMS}
                  />
                </Field>
                <Field label="Objective">
                  <ChipGroup
                    value={objective}
                    onChange={setObjective}
                    options={OBJECTIVES}
                  />
                </Field>
                <Field label="Language">
                  <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5">
                    {(["indonesian", "english"] as const).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition ${
                          language === lang
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-gray-600 hover:text-gray-900"
                        }`}
                      >
                        {lang === "indonesian" ? "Bahasa Indonesia" : "English"}
                      </button>
                    ))}
                  </div>
                </Field>
              </FormSection>

              <FormSection
                title="Content Formats"
                hint="Pick the formats the AI can assign to topics."
              >
                <div className="grid grid-cols-2 gap-2">
                  {FORMATS.map((f) => {
                    const checked = selectedFormats.includes(f.value);
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => toggleFormat(f.value)}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
                          checked
                            ? "border-violet-300 bg-violet-50 text-violet-900"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <span>{f.icon}</span>
                        <span className="font-medium">{f.label}</span>
                      </button>
                    );
                  })}
                </div>
              </FormSection>

              <FormSection title="Schedule">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="From">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                    />
                  </Field>
                  <Field label="To">
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                    />
                  </Field>
                </div>
                <Field label="Count">
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                    className="w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                  />
                </Field>
              </FormSection>
            </div>

            {/* Footer with Generate */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-white p-4">
              <Button
                onClick={handleGenerate}
                disabled={generating || !brandId || selectedFormats.length === 0}
                loading={generating}
                className="w-full"
              >
                <Sparkles size={14} className="mr-1.5" />
                {generating ? "Generating…" : "Generate Topics"}
              </Button>
            </div>
          </div>

          {/* Results column */}
          <div className="flex flex-1 flex-col overflow-hidden bg-gray-50">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {generatedTopics.length > 0
                    ? `Generated ${generatedTopics.length} topic${generatedTopics.length === 1 ? "" : "s"} for ${activeBrandName} · ${platform}`
                    : "Generated topics will appear here"}
                </p>
                {pendingRunId && (
                  <p className="mt-0.5 text-xs text-gray-500">Run {pendingRunId.slice(0, 8)}…</p>
                )}
              </div>
              {generatedTopics.length > 0 && (
                <Button onClick={handleSaveAll} loading={saving}>
                  Save All Topics
                </Button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {generating && generatedTopics.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Spinner size="lg" />
                  <p className="mt-3 text-sm text-gray-600">
                    Generating {count} topic{count === 1 ? "" : "s"}…
                  </p>
                </div>
              ) : generatedTopics.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div>
                    <Sparkles size={36} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm text-gray-600">
                      Tweak the form and hit Generate Topics.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {generatedTopics.map((t) => (
                    <GeneratedTopicCard key={t.id} topic={t} onEdit={() => onEditTopic(t)} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────── helpers ──────────────────────────

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">{title}</h3>
        {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
      </div>
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

function ChipGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active
                ? "bg-violet-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function GeneratedTopicCard({ topic, onEdit }: { topic: Topic; onEdit: () => void }) {
  const fmt = getFormatStyle(topic.format);
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900">{topic.title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-gray-400 hover:text-gray-700"
          aria-label="Edit topic"
        >
          <Edit2 size={14} />
        </button>
      </div>
      {topic.description && (
        <p className="mt-1 line-clamp-3 text-xs text-gray-600">{topic.description}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {topic.pillar && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${getPillarColor(topic.pillar)}`}
          >
            {topic.pillar}
          </span>
        )}
        {topic.format && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${fmt.className}`}
          >
            {fmt.icon && <span>{fmt.icon}</span>}
            {topic.format}
          </span>
        )}
        {topic.platform && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] capitalize text-gray-700">
            {topic.platform}
          </span>
        )}
        {topic.objective && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] capitalize text-gray-700">
            {topic.objective}
          </span>
        )}
        {topic.publishDate && (
          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700">
            <Calendar size={10} />
            {formatDate(topic.publishDate)}
          </span>
        )}
      </div>
    </div>
  );
}
