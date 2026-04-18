import { FileText, ExternalLink } from "lucide-react";
import { SectionStatus } from "./SectionStatus";

interface CampaignSummaryCardProps {
  summary: string;
  documentName?: string | null;
  documentUrl?: string | null;
  updating?: boolean;
  justUpdated?: boolean;
}

export function CampaignSummaryCard({
  summary,
  documentName,
  documentUrl,
  updating,
  justUpdated,
}: CampaignSummaryCardProps) {
  return (
    <div
      className={`bg-white border rounded-lg p-6 space-y-3 transition-colors ${
        updating ? "border-indigo-300 ring-1 ring-indigo-100" : "border-gray-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Document Summary</h2>
        </div>
        <SectionStatus updating={updating} justUpdated={justUpdated} />
      </div>
      <p
        className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap transition-opacity ${
          updating ? "opacity-60" : ""
        }`}
      >
        {summary || "No summary available."}
      </p>
      {documentUrl && (
        <a
          href={documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          <ExternalLink size={12} />
          {documentName || "View original PDF"}
        </a>
      )}
    </div>
  );
}
