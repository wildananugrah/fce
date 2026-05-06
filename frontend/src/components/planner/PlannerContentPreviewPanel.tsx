import { useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "../ui/Button";
import { PlannerContentPreviewPane, type PreviewItem } from "./PlannerContentPreviewPane";

interface PlannerContentPreviewPanelProps {
  isOpen: boolean;
  item: PreviewItem | null;
  onClose: () => void;
  onRegenerate?: () => void;
  onSave?: () => void;
  onToast?: (msg: string, type: "success" | "error" | "info") => void;
}

// Slide 9 layout: standalone right-side panel showing the existing content
// for a topic. Calendar peeks through the left thanks to max-w-2xl.
export function PlannerContentPreviewPanel({
  isOpen,
  item,
  onClose,
  onRegenerate,
  onSave,
  onToast,
}: PlannerContentPreviewPanelProps) {
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col bg-white shadow-xl animate-slide-in-right">
        {/* Top close */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Content Preview</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Shared preview rendering */}
        <PlannerContentPreviewPane
          item={item}
          onCopied={() => onToast?.("Copied to clipboard", "success")}
          onError={(msg) => onToast?.(msg, "error")}
        />

        {/* Footer actions — slide 9 */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 bg-white px-5 py-3">
          {onRegenerate && (
            <Button variant="secondary" onClick={onRegenerate}>
              <Sparkles size={14} className="mr-1.5" />
              Regenerate
            </Button>
          )}
          {onSave && <Button onClick={onSave}>Save</Button>}
          {!onRegenerate && !onSave && (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
