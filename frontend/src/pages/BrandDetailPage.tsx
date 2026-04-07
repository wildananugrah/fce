import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkspace } from "../hooks/useWorkspace";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import { DocumentUpload } from "../components/brands/DocumentUpload";

interface BrainVersion {
  id: string;
  version: number;
  status: string;
  isActive: boolean;
  createdAt: string;
  personality?: string;
  tone?: string;
  audiencePersonas?: unknown;
  values?: unknown;
  messagingRules?: unknown;
  vocabulary?: unknown;
}

interface Brand {
  id: string;
  name: string;
  slug: string;
  category: string | null;
  websiteUrl: string | null;
  status: string;
  activeBrainVersionId: string | null;
  createdAt: string;
  brainVersions?: BrainVersion[];
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

interface AudiencePersona {
  name: string;
  description: string;
}

interface MessagingRules {
  do: string[];
  dont: string[];
}

const SECTIONS = [
  "Overview",
  "Identity",
  "Tone of Voice",
  "Audience Persona",
  "Messaging Rules",
  "Vocabulary",
  "Visual Direction",
  "Cultural Relevance",
  "Documents",
  "Brain Versions",
] as const;

type Section = (typeof SECTIONS)[number];

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "default";
}

export function BrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<Section>("Overview");
  const [toast, setToast] = useState<ToastState>(null);
  const [saving, setSaving] = useState(false);

  // Overview fields
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  // Brain fields
  const [personality, setPersonality] = useState("");
  const [tone, setTone] = useState("");
  const [audiencePersonas, setAudiencePersonas] = useState<AudiencePersona[]>([]);
  const [brandValues, setBrandValues] = useState<string[]>([]);
  const [messagingRules, setMessagingRules] = useState<MessagingRules>({ do: [], dont: [] });
  const [vocabPreferred, setVocabPreferred] = useState<string[]>([]);
  const [vocabAvoided, setVocabAvoided] = useState<string[]>([]);
  const [visualDirection, setVisualDirection] = useState("");
  const [culturalRelevance, setCulturalRelevance] = useState("");

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const workspaceId = activeWorkspace?.id;

  const loadBrand = useCallback(async () => {
    if (!workspaceId || !id) return;
    setLoading(true);
    try {
      const b = await api<Brand>(`/api/workspaces/${workspaceId}/brands/${id}`);
      setBrand(b);
      setName(b.name);
      setCategory(b.category ?? "");
      setWebsiteUrl(b.websiteUrl ?? "");

      // Parse active brain version
      const versions = b.brainVersions ?? [];
      const active = versions.find((v) => v.status === "active") ?? versions[0];
      if (active) {
        setPersonality(active.personality ?? "");
        setTone(active.tone ?? "");

        // audiencePersonas
        const ap = active.audiencePersonas;
        if (Array.isArray(ap)) {
          setAudiencePersonas(
            ap.map((p: unknown) => {
              const obj = p as Record<string, string>;
              return { name: obj.name ?? "", description: obj.description ?? "" };
            })
          );
        } else {
          setAudiencePersonas([]);
        }

        // values
        const vals = active.values;
        if (Array.isArray(vals)) {
          setBrandValues(vals.map(String));
        } else {
          setBrandValues([]);
        }

        // messagingRules
        const mr = active.messagingRules;
        if (mr && typeof mr === "object" && !Array.isArray(mr)) {
          const mrObj = mr as Record<string, unknown>;
          setMessagingRules({
            do: Array.isArray(mrObj.do) ? mrObj.do.map(String) : [],
            dont: Array.isArray(mrObj.dont) ? mrObj.dont.map(String) : [],
          });
        } else {
          setMessagingRules({ do: [], dont: [] });
        }

        // vocabulary
        const vocab = active.vocabulary;
        if (vocab && typeof vocab === "object" && !Array.isArray(vocab)) {
          const vObj = vocab as Record<string, unknown>;
          setVocabPreferred(Array.isArray(vObj.preferred) ? vObj.preferred.map(String) : []);
          setVocabAvoided(Array.isArray(vObj.avoided) ? vObj.avoided.map(String) : []);
        } else {
          setVocabPreferred([]);
          setVocabAvoided([]);
        }

        setVisualDirection("");
        setCulturalRelevance("");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load brand", "error");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, id]);

  useEffect(() => {
    loadBrand();
  }, [loadBrand]);

  const handleSaveOverview = async () => {
    if (!workspaceId || !id) return;
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/brands/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim() || null,
          websiteUrl: websiteUrl.trim() || null,
        }),
      });
      showToast("Brand updated", "success");
      await loadBrand();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to update brand", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBrainSection = async () => {
    if (!workspaceId || !id) return;
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/brands/${id}/brain-versions`, {
        method: "POST",
        body: JSON.stringify({
          personality,
          tone,
          audiencePersonas: audiencePersonas.length > 0 ? audiencePersonas : undefined,
          values: brandValues.length > 0 ? brandValues : undefined,
          messagingRules:
            messagingRules.do.length > 0 || messagingRules.dont.length > 0
              ? messagingRules
              : undefined,
          vocabulary:
            vocabPreferred.length > 0 || vocabAvoided.length > 0
              ? { preferred: vocabPreferred, avoided: vocabAvoided }
              : undefined,
        }),
      });
      showToast("Brain version saved", "success");
      await loadBrand();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to save brain version", "error");
    } finally {
      setSaving(false);
    }
  };

  // Reusable array editor
  function renderArrayEditor(
    label: string,
    items: string[],
    setItems: (items: string[]) => void
  ) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide">
          {label}
        </label>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[i] = e.target.value;
                setItems(next);
              }}
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, ""])}
          className="text-xs text-black underline hover:no-underline"
        >
          + Add {label.toLowerCase()}
        </button>
      </div>
    );
  }

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Select a workspace first.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!brand) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Brand not found.</p>
        <Button variant="secondary" size="sm" onClick={() => navigate("/brands")} className="mt-2">
          Back to Brands
        </Button>
      </div>
    );
  }

  const versions = brand.brainVersions ?? [];
  const activeVersion = versions.find((v) => v.status === "active") ?? versions[0];

  const renderCenterPanel = () => {
    switch (activeSection) {
      case "Overview":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Brand Overview</h2>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input
              label="Category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Technology, Fashion, etc."
            />
            <Input
              label="Website URL"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
            />
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveOverview} loading={saving}>
                Save Changes
              </Button>
            </div>
          </div>
        );

      case "Identity":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Brand Identity</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Personality
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={4}
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                placeholder="Describe the brand's personality..."
              />
            </div>
            {renderArrayEditor("Brand Values", brandValues, setBrandValues)}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Tone of Voice":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Tone of Voice</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Tone
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={4}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="Describe the brand's tone of voice..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Audience Persona":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Audience Personas</h2>
            {audiencePersonas.map((persona, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Persona {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => setAudiencePersonas(audiencePersonas.filter((_, j) => j !== i))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
                <Input
                  label="Name"
                  value={persona.name}
                  onChange={(e) => {
                    const next = [...audiencePersonas];
                    next[i] = { ...next[i], name: e.target.value };
                    setAudiencePersonas(next);
                  }}
                  placeholder="e.g. Tech-savvy Millennials"
                />
                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                    Description
                  </label>
                  <textarea
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                    rows={3}
                    value={persona.description}
                    onChange={(e) => {
                      const next = [...audiencePersonas];
                      next[i] = { ...next[i], description: e.target.value };
                      setAudiencePersonas(next);
                    }}
                    placeholder="Describe this audience segment..."
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAudiencePersonas([...audiencePersonas, { name: "", description: "" }])}
              className="text-xs text-black underline hover:no-underline"
            >
              + Add persona
            </button>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Messaging Rules":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Messaging Rules</h2>
            {renderArrayEditor("Do's", messagingRules.do, (items) =>
              setMessagingRules({ ...messagingRules, do: items })
            )}
            {renderArrayEditor("Don'ts", messagingRules.dont, (items) =>
              setMessagingRules({ ...messagingRules, dont: items })
            )}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Vocabulary":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Vocabulary</h2>
            {renderArrayEditor("Preferred Words", vocabPreferred, setVocabPreferred)}
            {renderArrayEditor("Avoided Words", vocabAvoided, setVocabAvoided)}
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Visual Direction":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Visual Direction</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Visual Guidelines
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={6}
                value={visualDirection}
                onChange={(e) => setVisualDirection(e.target.value)}
                placeholder="Describe the brand's visual direction, color palette, imagery style..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Cultural Relevance":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Cultural Relevance</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">
                Cultural Context
              </label>
              <textarea
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
                rows={6}
                value={culturalRelevance}
                onChange={(e) => setCulturalRelevance(e.target.value)}
                placeholder="Describe the brand's cultural positioning, target markets, local nuances..."
              />
            </div>
            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveBrainSection} loading={saving}>
                Save Brain Version
              </Button>
            </div>
          </div>
        );

      case "Documents":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Documents</h2>
            <DocumentUpload workspaceId={workspaceId!} brandId={id!} onToast={showToast} />
          </div>
        );

      case "Brain Versions":
        return (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-black">Brain Versions</h2>
            {versions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No brain versions yet.</p>
            ) : (
              <div className="space-y-2">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                  >
                    <div>
                      <p className="text-sm font-medium text-black">v{v.version}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(v.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant={statusBadgeVariant(v.status)}>{v.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full">
      {/* Left Panel - Section Navigation */}
      <div className="w-48 border-r border-gray-200 bg-gray-50 p-4 flex-shrink-0 overflow-y-auto">
        <button
          onClick={() => navigate("/brands")}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-black mb-4"
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Brands
        </button>
        <nav className="space-y-1">
          {SECTIONS.map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors ${
                activeSection === section
                  ? "bg-black text-white font-medium"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {section}
            </button>
          ))}
        </nav>
      </div>

      {/* Center Panel - Editor */}
      <div className="flex-1 overflow-y-auto p-6">{renderCenterPanel()}</div>

      {/* Right Panel - Context */}
      <div className="w-64 border-l border-gray-200 bg-gray-50 p-4 flex-shrink-0 overflow-y-auto">
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">
          Brand Info
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <Badge variant={statusBadgeVariant(brand.status)}>{brand.status}</Badge>
          </div>
          <div>
            <p className="text-xs text-gray-500">Active Version</p>
            <p className="text-sm font-medium text-black">
              {activeVersion ? `v${activeVersion.version}` : "None"}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Versions</p>
            <p className="text-sm font-medium text-black">{versions.length}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Created</p>
            <p className="text-sm text-black">
              {new Date(brand.createdAt).toLocaleDateString()}
            </p>
          </div>
          {brand.category && (
            <div>
              <p className="text-xs text-gray-500">Category</p>
              <p className="text-sm text-black">{brand.category}</p>
            </div>
          )}
          {brand.websiteUrl && (
            <div>
              <p className="text-xs text-gray-500">Website</p>
              <a
                href={brand.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline break-all"
              >
                {brand.websiteUrl}
              </a>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
