import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { api } from "../services/api";
import { useSSE } from "../hooks/useSSE";
import { useWorkspace } from "../hooks/useWorkspace";
import { Button } from "../components/ui/Button";
import { Toast } from "../components/ui/Toast";
import { CampaignProgressPanel } from "../components/campaigns/CampaignProgressPanel";
import { CampaignSummaryCard } from "../components/campaigns/CampaignSummaryCard";
import { CampaignPlanCard } from "../components/campaigns/CampaignPlanCard";
import { CampaignTopicsList } from "../components/campaigns/CampaignTopicsList";
import { ChatPanel } from "../components/campaigns/chat/ChatPanel";

type Stage = "extracting" | "summarizing" | "planning" | "topics";

interface CampaignDetail {
  id: string;
  name: string;
  status: string;
  generationStage: Stage | null;
  errorMessage: string | null;
  brandId: string | null;
  productId: string | null;
  objective: string | null;
  audienceSegment: string | null;
  keyMessage: string | null;
  outputs: Array<{
    id: string;
    bigIdea: string | null;
    messagingPillars: Array<{ name: string; description: string }> | null;
  }>;
  briefs: Array<{
    id: string;
    documentSummary: string | null;
    documentUrl: string | null;
    documentName: string | null;
  }>;
}

interface Topic {
  id: string;
  title: string;
  description: string | null;
  pillar: string | null;
  platform: string | null;
  format: string | null;
  objective: string | null;
  brandId: string | null;
  products?: Array<{ product: { id: string } }>;
}

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { activeWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = useCallback(
    (message: string, type: "success" | "error" | "info") => {
      setToast({ message, type });
    },
    [],
  );

  const loadCampaign = useCallback(async () => {
    if (!activeWorkspace || !id) return;
    try {
      const data = await api<CampaignDetail>(
        `/api/workspaces/${activeWorkspace.id}/campaigns/${id}`,
      );
      setCampaign(data);

      const topicsData = await api<Topic[]>(
        `/api/workspaces/${activeWorkspace.id}/topics?campaignId=${id}`,
      ).catch(() => [] as Topic[]);
      setTopics(Array.isArray(topicsData) ? topicsData : []);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to load campaign",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, id, showToast]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  useSSE((event) => {
    if (!id) return;
    if (
      (event.type === "campaign_pdf_progress" ||
        event.type === "campaign_pdf_complete" ||
        event.type === "campaign_pdf_failed") &&
      event.data.campaignId === id
    ) {
      loadCampaign();
    }
  });

  const handleDelete = async () => {
    if (!activeWorkspace || !id) return;
    if (!confirm("Delete this campaign and its generated topics?")) return;
    try {
      await api<unknown>(
        `/api/workspaces/${activeWorkspace.id}/campaigns/${id}`,
        { method: "DELETE" },
      );
      navigate("/campaigns");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Delete failed",
        "error",
      );
    }
  };

  if (loading || !campaign || !activeWorkspace) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 size={24} className="text-gray-400 animate-spin" />
      </div>
    );
  }

  const output = campaign.outputs[0];
  const brief = campaign.briefs[0];
  const isGenerating =
    campaign.status === "generating" || campaign.status === "failed";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft size={14} className="mr-0.5" />
          Back to campaigns
        </button>
        <Button variant="secondary" onClick={handleDelete}>
          <Trash2 size={14} className="mr-1.5" />
          Delete
        </Button>
      </div>

      <h1 className="text-lg font-semibold text-gray-900">{campaign.name}</h1>

      {isGenerating ? (
        <CampaignProgressPanel
          status={campaign.status}
          currentStage={campaign.generationStage}
          errorMessage={campaign.errorMessage}
          onRetry={handleDelete}
        />
      ) : (
        <>
          {brief && (
            <CampaignSummaryCard
              summary={brief.documentSummary ?? ""}
              documentName={brief.documentName}
              documentUrl={brief.documentUrl}
            />
          )}
          <CampaignPlanCard
            workspaceId={activeWorkspace.id}
            campaignId={campaign.id}
            initial={{
              objective: campaign.objective ?? "",
              audienceSegment: campaign.audienceSegment ?? "",
              keyMessage: campaign.keyMessage ?? "",
              bigIdea: output?.bigIdea ?? "",
              messagingPillars: output?.messagingPillars ?? [],
            }}
            onToast={showToast}
          />
          <ChatPanel
            workspaceId={activeWorkspace.id}
            campaignId={campaign.id}
            brandId={campaign.brandId}
            onPlanEdit={() => loadCampaign()}
          />
          <CampaignTopicsList topics={topics} />
        </>
      )}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
