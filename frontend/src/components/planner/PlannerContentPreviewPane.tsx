import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getPreviewComponent } from "../library/previews/PreviewRegistry";

interface Section {
  id: string;
  sectionType: string;
  sectionOrder: number;
  contentText: string;
}

export interface PreviewItem {
  id: string;
  contentTitle?: string | null;
  content: Record<string, unknown>;
  status: string;
  sections: Section[];
  request: {
    platform: string;
    contentType: string;
    brand?: { id: string; name: string } | null;
    product?: { id: string; name: string } | null;
  };
}

interface PlannerContentPreviewPaneProps {
  item: PreviewItem;
  onCopied?: () => void;
  onError?: (msg: string) => void;
}

function getStatusStyle(status: string): string {
  if (status === "approved") return "bg-green-50 text-green-700 border-green-200";
  if (status === "rejected") return "bg-red-50 text-red-700 border-red-200";
  if (status === "in_review") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PlannerContentPreviewPane({ item, onCopied, onError }: PlannerContentPreviewPaneProps) {
  const [copied, setCopied] = useState(false);

  const PreviewComponent = getPreviewComponent(item.request.contentType);
  const brandName = item.request.brand?.name ?? "Brand";
  const productName = item.request.product?.name ?? undefined;

  const handleCopyAll = async () => {
    const parts: string[] = [];
    const sectionOrder = ["hook", "caption", "cta", "hashtag"];
    for (const type of sectionOrder) {
      const texts = item.sections
        .filter((s) => s.sectionType === type)
        .sort((a, b) => a.sectionOrder - b.sectionOrder)
        .map((s) => s.contentText);
      if (texts.length > 0) parts.push(texts.join("\n"));
    }
    if (parts.length === 0) {
      const c = item.content;
      if (c.hook) parts.push(String(c.hook));
      if (c.headline) parts.push(String(c.headline));
      if (c.caption) parts.push(String(c.caption));
      if (c.body) parts.push(String(c.body));
      if (c.cta) parts.push(String(c.cta));
      if (Array.isArray(c.hashtags)) parts.push((c.hashtags as string[]).join(" "));
    }
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onCopied?.();
    } catch {
      onError?.("Failed to copy");
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Title + Copy */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-900">
            {item.contentTitle ?? "Untitled content"}
          </h3>
          <p className="mt-0.5 text-xs capitalize text-gray-500">
            {item.request.platform} · {item.request.contentType.replace(/_/g, " ")}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCopyAll}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy All"}
        </button>
      </div>

      {/* Preview body */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-5">
        <PreviewComponent
          content={item.content}
          sections={item.sections}
          brandName={brandName}
          productName={productName}
          contentTitle={item.contentTitle ?? undefined}
          contentType={item.request.contentType}
          platform={item.request.platform}
        />
      </div>

      {/* Status footer */}
      <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-white px-5 py-3">
        <span className="text-xs font-medium text-gray-500">Status:</span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getStatusStyle(item.status)}`}
        >
          {statusLabel(item.status)}
        </span>
      </div>
    </div>
  );
}
