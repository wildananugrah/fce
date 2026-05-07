import { useEffect } from "react";
import { X } from "lucide-react";
import { TopicsPage } from "../../pages/TopicsPage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string | null;
  onSavedTopics?: () => void;
}

/**
 * Slider chrome that mounts the standalone TopicsPage in `embedded` mode.
 *
 * Used by the Planner page so users can generate topics in a slide-over
 * without leaving the calendar context. After a successful bulk save,
 * the slider auto-closes (TopicsPage fires onSavedTopics → handler calls
 * onSavedTopics?.() then onClose()).
 */
export function TopicGeneratorSlider({
  isOpen,
  onClose,
  initialDate,
  onSavedTopics,
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
        className="relative flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-generator-slider-title"
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <h2
            id="topic-generator-slider-title"
            className="text-base font-semibold text-gray-900"
          >
            Topic Generator
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <X size={18} />
          </button>
        </div>

        {/* Embedded TopicsPage */}
        <div className="flex-1 overflow-y-auto px-6">
          <TopicsPage
            embedded
            initialDate={initialDate}
            onSavedTopics={() => {
              onSavedTopics?.();
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
