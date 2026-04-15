import { FileText, ExternalLink } from "lucide-react";

interface CampaignSummaryCardProps {
  summary: string;
  documentName?: string | null;
  documentUrl?: string | null;
}

export function CampaignSummaryCard({
  summary,
  documentName,
  documentUrl,
}: CampaignSummaryCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Document Summary</h2>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
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
