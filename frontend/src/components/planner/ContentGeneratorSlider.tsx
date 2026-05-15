import { useEffect } from "react";
import { X } from "lucide-react";
import { GeneratePage } from "../../pages/GeneratePage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialBrandId?: string | null;
  initialTopicId?: string | null;
  initialProductIds?: string[];
  initialPlatform?: string | null;
  initialContentType?: string | null;
  initialObjective?: string | null;
  onSavedContent?: () => void;
}

/**
 * Slider chrome that mounts the standalone GeneratePage in `embedded` mode.
 *
 * Used by the Planner page so users can generate content for a topic in
 * a slide-over without leaving the calendar context. The slider does NOT
 * auto-close after a generation — users may want to regenerate. The
 * onSavedContent callback fires per generation so the host can refresh
 * its content map and the calendar's "View Content" affordance lights up.
 */
export function ContentGeneratorSlider({
  isOpen,
  onClose,
  initialBrandId,
  initialTopicId,
  initialProductIds,
  initialPlatform,
  initialContentType,
  initialObjective,
  onSavedContent,
}: Props) {
  // Lock body scroll + handle ESC while open. Single effect so the
  // listener and overflow lock share a lifecycle and can't drift.
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Slider panel */}
      <div
        className="relative flex h-full w-[50vw] flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-generator-slider-title"
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3 bg-surface shrink-0">
          <h2
            id="content-generator-slider-title"
            className="text-sm font-semibold text-foreground"
          >
            Content Generator
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted hover:bg-surface-secondary hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Embedded GeneratePage */}
        <div className="flex-1 min-h-0 flex">
          <GeneratePage
            embedded
            initialBrandId={initialBrandId}
            initialTopicId={initialTopicId}
            initialProductIds={initialProductIds}
            initialPlatform={initialPlatform}
            initialContentType={initialContentType}
            initialObjective={initialObjective}
            onSavedContent={onSavedContent}
          />
        </div>
      </div>
    </div>
  );
}
