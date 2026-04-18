import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { UploadBriefModal } from "../components/campaigns/UploadBriefModal";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";
import type { CampaignBrief, CampaignChannelRole, CampaignDeliverable } from "../types";

interface Brand {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
}

interface CampaignOutput {
  bigIdea?: string;
  messagingPillars?: string[];
  funnelJourney?: Record<string, unknown>;
  channelRoles?: CampaignChannelRole[];
  deliverables?: CampaignDeliverable[];
  [key: string]: unknown;
}

interface Campaign {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  objective?: string | null;
  budget?: number | null;
  channelMix?: string[] | null;
  culturalContext?: string | null;
  brandId: string;
  productId?: string | null;
  audienceSegment?: string | null;
  durationStart?: string | null;
  durationEnd?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  keyMessage?: string | null;
  brand?: Brand;
  outputs?: CampaignOutput[];
  createdAt: string;
}

type ToastState = { message: string; type: "success" | "error" | "info" } | null;

function statusBadgeVariant(status: string): "success" | "default" | "danger" {
  if (status === "active") return "success";
  if (status === "archived") return "danger";
  return "default";
}

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const CHANNEL_OPTIONS = ["Instagram", "Facebook", "X", "YouTube", "TikTok"];

// ---- Create Campaign Modal ----
interface CreateCampaignModalProps {
  workspaceId: string;
  brands: Brand[];
  onCreated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function CreateCampaignModal({ workspaceId, brands, onCreated, onClose, onToast }: CreateCampaignModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState("");
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [channelMix, setChannelMix] = useState("");
  const [culturalContext, setCulturalContext] = useState("");
  const [generateStrategy, setGenerateStrategy] = useState(false);
  const [productId, setProductId] = useState("");
  const [audienceSegment, setAudienceSegment] = useState("");
  const [durationStart, setDurationStart] = useState("");
  const [durationEnd, setDurationEnd] = useState("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [keyMessage, setKeyMessage] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Product[]>(`/api/workspaces/${workspaceId}/products`)
      .then(setProducts)
      .catch(() => {});
  }, [workspaceId]);

  const brandOptions = [{ value: "", label: "Select brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];
  const productOptions = [{ value: "", label: "No product (optional)" }, ...products.map((p) => ({ value: p.id, label: p.name }))];

  const handleSubmit = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!brandId) { setError("Please select a brand"); return; }
    setLoading(true);
    setError(null);
    try {
      await api(`/api/workspaces/${workspaceId}/campaigns`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          brandId,
          objective: objective.trim() || undefined,
          budget: budget ? parseFloat(budget) : undefined,
          channelMix: channelMix ? channelMix.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
          culturalContext: culturalContext.trim() || undefined,
          generate: generateStrategy,
          productId: productId || undefined,
          audienceSegment: audienceSegment.trim() || undefined,
          durationStart: durationStart || undefined,
          durationEnd: durationEnd || undefined,
          budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
          budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
          keyMessage: keyMessage.trim() || undefined,
        }),
      });
      onToast("Campaign created", "success");
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Campaign">
      <div className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 Brand Awareness" />
        <div className="w-full">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
          <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
            rows={2}
            placeholder="Campaign description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <Select label="Brand" options={brandOptions} value={brandId} onChange={(e) => setBrandId(e.target.value)} />
        <Select label="Product (optional)" options={productOptions} value={productId} onChange={(e) => setProductId(e.target.value)} />
        <Input label="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Increase brand awareness" />
        <Input label="Audience Segment" value={audienceSegment} onChange={(e) => setAudienceSegment(e.target.value)} placeholder="Gen Z, urban millennials..." />
        <div className="w-full">
          <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Key Message</label>
          <textarea
            className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
            rows={2}
            placeholder="Core message for this campaign..."
            value={keyMessage}
            onChange={(e) => setKeyMessage(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Duration Start" type="date" value={durationStart} onChange={(e) => setDurationStart(e.target.value)} />
          <Input label="Duration End" type="date" value={durationEnd} onChange={(e) => setDurationEnd(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Budget Min" type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="5000" />
          <Input label="Budget Max" type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="20000" />
        </div>
        <Input label="Budget (legacy)" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="10000" type="number" />
        <Input
          label="Channel Mix (comma-separated)"
          value={channelMix}
          onChange={(e) => setChannelMix(e.target.value)}
          placeholder="instagram, tiktok, facebook"
        />
        <Input
          label="Cultural Context"
          value={culturalContext}
          onChange={(e) => setCulturalContext(e.target.value)}
          placeholder="Ramadan, local traditions..."
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={generateStrategy}
            onChange={(e) => setGenerateStrategy(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Generate AI strategy</span>
        </label>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={loading}>Create Campaign</Button>
        </div>
      </div>
    </Modal>
  );
}

// ---- Brief Tab ----
interface BriefTabProps {
  campaignId: string;
  workspaceId: string;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
  onUpdated: () => void;
}

function BriefTab({ campaignId, workspaceId, onToast, onUpdated }: BriefTabProps) {
  const [brief, setBrief] = useState<CampaignBrief | null>(null);
  const [loadingBrief, setLoadingBrief] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [objectiveDetail, setObjectiveDetail] = useState("");
  const [channelMix, setChannelMix] = useState<string[]>([]);
  const [mandatoryDeliverables, setMandatoryDeliverables] = useState("");
  const [culturalContext, setCulturalContext] = useState("");
  const [trendContext, setTrendContext] = useState("");
  const [competitiveContext, setCompetitiveContext] = useState("");
  const [kpiPreference, setKpiPreference] = useState("");
  const [toneDirection, setToneDirection] = useState("");

  const loadBrief = useCallback(async () => {
    setLoadingBrief(true);
    try {
      const b = await api<CampaignBrief>(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/brief`);
      setBrief(b);
      setObjectiveDetail(b.objectiveDetail ?? "");
      setChannelMix(b.channelMix ?? []);
      setMandatoryDeliverables((b.mandatoryDeliverables ?? []).join(", "));
      setCulturalContext(b.culturalContext ?? "");
      setTrendContext(b.trendContext ?? "");
      setCompetitiveContext(b.competitiveContext ?? "");
      setKpiPreference(b.kpiPreference ? JSON.stringify(b.kpiPreference) : "");
      setToneDirection(b.toneDirection ?? "");
    } catch {
      // No brief yet, keep defaults
      setBrief(null);
    } finally {
      setLoadingBrief(false);
    }
  }, [campaignId, workspaceId]);

  useEffect(() => { loadBrief(); }, [loadBrief]);

  const toggleChannel = (ch: string) => {
    setChannelMix((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  };

  const buildPayload = () => {
    let kpiParsed: Record<string, unknown> | undefined;
    if (kpiPreference.trim()) {
      try {
        kpiParsed = JSON.parse(kpiPreference.trim());
      } catch {
        // Treat as comma-separated keys
        const keys = kpiPreference.split(",").map((s) => s.trim()).filter(Boolean);
        kpiParsed = Object.fromEntries(keys.map((k) => [k, true]));
      }
    }
    return {
      objectiveDetail: objectiveDetail.trim() || undefined,
      channelMix: channelMix.length > 0 ? channelMix : undefined,
      mandatoryDeliverables: mandatoryDeliverables
        ? mandatoryDeliverables.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      culturalContext: culturalContext.trim() || undefined,
      trendContext: trendContext.trim() || undefined,
      competitiveContext: competitiveContext.trim() || undefined,
      kpiPreference: kpiParsed,
      toneDirection: toneDirection.trim() || undefined,
    };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const method = brief ? "PATCH" : "POST";
      const saved = await api<CampaignBrief>(
        `/api/workspaces/${workspaceId}/campaigns/${campaignId}/brief`,
        { method, body: JSON.stringify(buildPayload()) }
      );
      setBrief(saved);
      onToast("Brief saved", "success");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to save brief", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await api(`/api/workspaces/${workspaceId}/campaigns/${campaignId}/generate`, {
        method: "POST",
      });
      onToast("Strategy generation started", "info");
      onUpdated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to start generation", "error");
    } finally {
      setGenerating(false);
    }
  };

  if (loadingBrief) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Objective Detail</label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
          rows={3}
          placeholder="Detailed campaign objective..."
          value={objectiveDetail}
          onChange={(e) => setObjectiveDetail(e.target.value)}
        />
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Channel Mix</label>
        <div className="flex flex-wrap gap-3">
          {CHANNEL_OPTIONS.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={channelMix.includes(ch)}
                onChange={() => toggleChannel(ch)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{ch}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Mandatory Deliverables (comma-separated)</label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
          rows={2}
          placeholder="Social post, Story, Reel, Blog..."
          value={mandatoryDeliverables}
          onChange={(e) => setMandatoryDeliverables(e.target.value)}
        />
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Cultural Context</label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
          rows={2}
          placeholder="Cultural considerations..."
          value={culturalContext}
          onChange={(e) => setCulturalContext(e.target.value)}
        />
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Trend Context</label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
          rows={2}
          placeholder="Current trends to consider..."
          value={trendContext}
          onChange={(e) => setTrendContext(e.target.value)}
        />
      </div>

      <div className="w-full">
        <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Competitive Context</label>
        <textarea
          className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
          rows={2}
          placeholder="Competitor landscape..."
          value={competitiveContext}
          onChange={(e) => setCompetitiveContext(e.target.value)}
        />
      </div>

      <Input
        label="KPI Preferences (JSON or comma-separated)"
        value={kpiPreference}
        onChange={(e) => setKpiPreference(e.target.value)}
        placeholder='{"engagement_rate": "5%", "reach": "100K"} or reach, engagement, clicks'
      />

      <Input
        label="Tone Direction"
        value={toneDirection}
        onChange={(e) => setToneDirection(e.target.value)}
        placeholder="Bold, playful, inspiring..."
      />

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={handleSave} loading={saving}>
          Save Brief
        </Button>
        <Button onClick={handleGenerate} loading={generating}>
          Generate Strategy
        </Button>
      </div>
    </div>
  );
}

// ---- Enhanced Strategy Tab ----
interface StrategyTabProps {
  detail: Campaign | null;
  campaign: Campaign;
}

function StrategyTab({ detail, campaign }: StrategyTabProps) {
  const [activeSection, setActiveSection] = useState("overview");
  const outputs = detail?.outputs ?? campaign.outputs ?? [];
  const output = outputs[0];

  if (!output) {
    return (
      <div className="text-center py-8">
        {detail?.status === "generating" ? (
          <div className="flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-sm text-gray-500">Generating strategy...</p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No strategy generated. Use the Brief tab to generate one.</p>
        )}
      </div>
    );
  }

  const hasFunnel = output.funnelJourney && Object.keys(output.funnelJourney).length > 0;
  const hasChannelRoles = output.channelRoles && output.channelRoles.length > 0;
  const hasDeliverables = output.deliverables && output.deliverables.length > 0;

  const sectionTabs = [
    { key: "overview", label: "Overview" },
    ...(hasFunnel ? [{ key: "funnel", label: "Funnel Journey" }] : []),
    ...(hasChannelRoles ? [{ key: "channels", label: "Channel Roles" }] : []),
    ...(hasDeliverables ? [{ key: "deliverables", label: "Deliverables" }] : []),
    { key: "raw", label: "Raw JSON" },
  ];

  return (
    <div className="space-y-4 pt-2">
      <Tabs tabs={sectionTabs} activeTab={activeSection} onChange={setActiveSection} />

      {activeSection === "overview" && (
        <div className="space-y-4">
          {output.bigIdea && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Big Idea</p>
              <p className="text-sm text-gray-700">{output.bigIdea}</p>
            </div>
          )}
          {output.messagingPillars && output.messagingPillars.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Messaging Pillars</p>
              <ul className="list-disc list-inside space-y-1">
                {output.messagingPillars.map((pillar, i) => (
                  <li key={i} className="text-sm text-gray-700">{pillar}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {activeSection === "funnel" && hasFunnel && (
        <div className="space-y-4">
          {(["awareness", "consideration", "conversion", "loyalty"] as const).map((stage) => {
            const stageData = output.funnelJourney?.[stage];
            if (!stageData) return null;
            return (
              <div key={stage} className="border border-gray-200 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{stage}</p>
                {typeof stageData === "string" ? (
                  <p className="text-sm text-gray-700">{stageData}</p>
                ) : (
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-auto">
                    {JSON.stringify(stageData, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {/* Show any other keys not in the standard funnel */}
          {Object.entries(output.funnelJourney ?? {})
            .filter(([k]) => !["awareness", "consideration", "conversion", "loyalty"].includes(k))
            .map(([key, val]) => (
              <div key={key} className="border border-gray-200 rounded-md p-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{key}</p>
                {typeof val === "string" ? (
                  <p className="text-sm text-gray-700">{val}</p>
                ) : (
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-auto">
                    {JSON.stringify(val, null, 2)}
                  </pre>
                )}
              </div>
            ))}
        </div>
      )}

      {activeSection === "channels" && hasChannelRoles && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Priority</th>
              </tr>
            </thead>
            <tbody>
              {output.channelRoles!.map((cr, i) => (
                <tr key={cr.id ?? i} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-700">{cr.channelCode}</td>
                  <td className="px-3 py-2 text-gray-700">{cr.channelRole}</td>
                  <td className="px-3 py-2 text-gray-700">{cr.priorityOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === "deliverables" && hasDeliverables && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Funnel Stage</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500 uppercase">Qty</th>
              </tr>
            </thead>
            <tbody>
              {output.deliverables!.map((d, i) => (
                <tr key={d.id ?? i} className="border-b border-gray-50">
                  <td className="px-3 py-2 text-gray-700">{d.deliverableType}</td>
                  <td className="px-3 py-2 text-gray-700">{d.deliverableName}</td>
                  <td className="px-3 py-2 text-gray-700">{d.recommendedChannel ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-700">{d.funnelStage ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-700">{d.qtyRecommendation ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeSection === "raw" && (
        <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto max-h-96">
          {JSON.stringify(output, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---- Campaign Detail Modal ----
interface CampaignDetailModalProps {
  campaign: Campaign;
  workspaceId: string;
  onUpdated: () => void;
  onClose: () => void;
  onToast: (msg: string, type: "success" | "error" | "info") => void;
}

function CampaignDetailModal({ campaign, workspaceId, onUpdated, onClose, onToast }: CampaignDetailModalProps) {
  const [activeTab, setActiveTab] = useState("details");
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? "");
  const [objective, setObjective] = useState(campaign.objective ?? "");
  const [status, setStatus] = useState(campaign.status);
  const [saving, setSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    setLoadingDetail(true);
    try {
      const c = await api<Campaign>(`/api/workspaces/${workspaceId}/campaigns/${campaign.id}`);
      setDetail(c);
      setName(c.name);
      setDescription(c.description ?? "");
      setObjective(c.objective ?? "");
      setStatus(c.status);
    } catch {
      setDetail(campaign);
    } finally {
      setLoadingDetail(false);
    }
  }, [campaign, workspaceId]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api(`/api/workspaces/${workspaceId}/campaigns/${campaign.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          objective: objective.trim() || null,
          status,
        }),
      });
      onToast("Campaign updated", "success");
      onUpdated();
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Failed to update campaign", "error");
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: "details", label: "Details" },
    { key: "brief", label: "Brief" },
    { key: "strategy", label: "Strategy" },
  ];

  return (
    <Modal isOpen onClose={onClose} title={campaign.name}>
      <div className="space-y-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {loadingDetail && activeTab === "details" ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <>
            {activeTab === "details" && (
              <div className="space-y-4 pt-2">
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
                <div className="w-full">
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
                  <textarea
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black resize-none"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Input label="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} />
                <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} />
                <div className="flex justify-end pt-2">
                  <Button onClick={handleSave} loading={saving}>Save Changes</Button>
                </div>
              </div>
            )}

            {activeTab === "brief" && (
              <BriefTab
                campaignId={campaign.id}
                workspaceId={workspaceId}
                onToast={onToast}
                onUpdated={() => { onUpdated(); loadDetail(); }}
              />
            )}

            {activeTab === "strategy" && (
              <StrategyTab detail={detail} campaign={campaign} />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ---- Main Page ----
export function CampaignsPage() {
  const { activeWorkspace } = useWorkspace();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showUploadBrief, setShowUploadBrief] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const navigate = useNavigate();
  const [toast, setToast] = useState<ToastState>(null);

  const showToast = (message: string, type: "success" | "error" | "info") => {
    setToast({ message, type });
  };

  const loadData = useCallback(async () => {
    if (!activeWorkspace) return;
    setLoading(true);
    try {
      const [c, b] = await Promise.all([
        api<Campaign[]>(`/api/workspaces/${activeWorkspace.id}/campaigns`),
        api<Brand[]>(`/api/workspaces/${activeWorkspace.id}/brands`),
      ]);
      setCampaigns(c);
      setBrands(b);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load campaigns", "error");
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => { loadData(); }, [loadData]);

  useSSE((event) => {
    if (event.type === "campaign_complete") {
      loadData();
      return;
    }
    if (event.type === "campaign_pdf_complete") {
      loadData();
      return;
    }
    if (event.type === "campaign_pdf_failed") {
      const errMsg =
        typeof event.data.error === "string" && event.data.error
          ? event.data.error
          : "Campaign generation failed";
      const stage =
        typeof event.data.stage === "string" ? ` (${event.data.stage})` : "";
      showToast(`Campaign generation failed${stage}: ${errMsg}`, "error");
      loadData();
    }
  });

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Create a workspace first to manage campaigns.</p>
      </div>
    );
  }

  const getBrandName = (campaign: Campaign) =>
    campaign.brand?.name ?? brands.find((b) => b.id === campaign.brandId)?.name ?? "Unknown";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-black">Campaigns</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowCreate(true)}>
            Create Manually
          </Button>
          <Button onClick={() => setShowUploadBrief(true)}>
            <Sparkles size={14} className="mr-1.5" />
            Upload Brief (PDF)
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center space-y-4">
          <p className="text-sm text-gray-400">No campaigns yet. Start a new campaign.</p>
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={() => setShowCreate(true)}>
              Create Manually
            </Button>
            <Button onClick={() => setShowUploadBrief(true)}>
              <Sparkles size={14} className="mr-1.5" />
              Upload Brief (PDF)
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Brand</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="border-b border-gray-50 cursor-pointer hover:bg-gray-50"
                  onClick={() => navigate(`/campaigns/${campaign.id}`)}
                >
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{campaign.name}</td>
                  <td className="px-4 py-2.5 text-sm text-gray-700">{getBrandName(campaign)}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusBadgeVariant(campaign.status)}>{campaign.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-sm text-gray-500">
                    {new Date(campaign.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateCampaignModal
          workspaceId={activeWorkspace.id}
          brands={brands}
          onCreated={loadData}
          onClose={() => setShowCreate(false)}
          onToast={showToast}
        />
      )}

      {showUploadBrief && (
        <UploadBriefModal
          workspaceId={activeWorkspace.id}
          onClose={() => setShowUploadBrief(false)}
          onCreated={(campaignId) => {
            setShowUploadBrief(false);
            navigate(`/campaigns/${campaignId}`);
          }}
          onToast={showToast}
        />
      )}

      {selectedCampaign && (
        <CampaignDetailModal
          campaign={selectedCampaign}
          workspaceId={activeWorkspace.id}
          onUpdated={loadData}
          onClose={() => setSelectedCampaign(null)}
          onToast={showToast}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
