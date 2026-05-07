import { X } from "lucide-react";
import { TopicsPage } from "../../pages/TopicsPage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" />

      {/* Slider panel */}
      <div
        className="relative flex h-full w-full max-w-[1100px] flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <h2 className="text-base font-semibold text-gray-900">
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
        <div className="flex-1 overflow-y-auto">
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
