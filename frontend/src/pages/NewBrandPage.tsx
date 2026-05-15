import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useWorkspace } from "../hooks/useWorkspace";
import { useProject } from "../hooks/useProject";
import { BrandBrainForm } from "../components/brands/BrandBrainForm";

export function NewBrandPage() {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const { activeProject } = useProject();

  const [scrapingBanner, setScrapingBanner] = useState<ReactNode>(null);

  useEffect(() => {
    if (!activeProject) {
      navigate("/brands", { replace: true });
    }
  }, [activeProject, navigate]);

  if (!activeWorkspace) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500">Pick a workspace to create a brand.</p>
      </div>
    );
  }

  if (!activeProject) {
    return null;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
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

      {/* Scraping banner — BrandBrainForm pushes content here via callback */}
      {scrapingBanner}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden h-[calc(100vh-220px)] min-h-[560px]">
        <BrandBrainForm
          workspaceId={activeWorkspace.id}
          projectId={activeProject?.id}
          onSaved={() => navigate("/brands")}
          renderScrapingBanner={setScrapingBanner}
        />
      </div>
    </div>
  );
}
