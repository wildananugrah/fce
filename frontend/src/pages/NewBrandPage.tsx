import { useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { CoachMark } from "../components/onboarding/CoachMark";
import { HelpButton } from "../components/onboarding/HelpButton";
import {
  BrandBrainForm,
  type BrandBrainFormHandle,
} from "../components/brands/BrandBrainForm";

/**
 * Full-page create flow for a brand. Thin wrapper around BrandBrainForm
 * — this file only owns the page chrome (back button, title, top-right
 * Cancel / Save). Form logic lives in BrandBrainForm so the drawer
 * (edit) and this page (create) share one source of truth.
 */
export function NewBrandPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();

  const formRef = useRef<BrandBrainFormHandle>(null);
  const [saving, setSaving] = useState(false);
  const [scrapingBanner, setScrapingBanner] = useState<ReactNode>(null);

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
              Define the brand's DNA. The AI uses this for every topic and post it generates for{" "}
              <span className="font-medium text-gray-700">
                {activeProject?.name ?? "this project"}
              </span>
              .
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <HelpButton pageKey="brand-new" />
          <Button variant="secondary" onClick={() => navigate("/brands")} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => formRef.current?.save()} loading={saving}>
            <Save size={14} className="mr-1.5" />
            Save brand
          </Button>
        </div>
      </div>

      <CoachMark
        pageKey="brand-new"
        title="Create your first brand"
        body="Paste your website URL and click Auto-fill to pre-fill the brand from your site. Otherwise, work through the tabs manually — you can always refine it later."
      />

      {/* Scraping banner — BrandBrainForm pushes content here via callback */}
      {scrapingBanner}

      {/* Form shell — fixed height so the sidebar + content + footer can
          flex internally and the prev/next footer always sits at the bottom */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-[calc(100vh-220px)] min-h-[560px]">
        <BrandBrainForm
          ref={formRef}
          workspaceId={activeWorkspace.id}
          projectId={activeProject?.id}
          onSaved={() => navigate("/brands")}
          onSavingChange={setSaving}
          renderScrapingBanner={setScrapingBanner}
        />
      </div>
    </div>
  );
}
