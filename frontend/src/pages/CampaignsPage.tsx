import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useSSE } from "../hooks/useSSE";
import { api } from "../services/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { Tabs } from "../components/ui/Tabs";
import { Spinner } from "../components/ui/Spinner";
import { Toast } from "../components/ui/Toast";

interface Brand {
  id: string;
  name: string;
}

interface CampaignOutput {
  bigIdea?: string;
  messagingPillars?: string[];
  funnelJourney?: Record<string, unknown>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandOptions = [{ value: "", label: "Select brand" }, ...brands.map((b) => ({ value: b.id, label: b.name }))];

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
        <Input label="Objective" value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Increase brand awareness" />
        <Input label="Budget" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="10000" type="number" />
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
    { key: "strategy", label: "Strategy" },
  ];

  const outputs = detail?.outputs ?? campaign.outputs ?? [];
  const output = outputs[0];

  return (
    <Modal isOpen onClose={onClose} title={campaign.name}>
      <div className="space-y-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {loadingDetail ? (
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

            {activeTab === "strategy" && (
              <div className="space-y-4 pt-2">
                {!output ? (
                  <div className="text-center py-8">
                    {detail?.status === "generating" ? (
                      <div className="flex flex-col items-center gap-3">
                        <Spinner />
                        <p className="text-sm text-gray-500">Generating strategy...</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">No strategy generated.</p>
                    )}
                  </div>
                ) : (
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
                    {output.funnelJourney && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Funnel Journey</p>
                        <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 overflow-auto">
                          {JSON.stringify(output.funnelJourney, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
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
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
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
        <Button onClick={() => setShowCreate(true)}>New Campaign</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : campaigns.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <p className="text-sm text-gray-400">No campaigns yet. Create your first campaign to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
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
                  onClick={() => setSelectedCampaign(campaign)}
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
