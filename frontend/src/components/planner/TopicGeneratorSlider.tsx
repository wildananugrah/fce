import { useState, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { TopicsPage } from "../../pages/TopicsPage";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string | null;
  initialBrandId?: string | null;
  onSavedTopics?: () => void;
}

export function TopicGeneratorSlider({
  isOpen,
  onClose,
  initialDate,
  initialBrandId,
  onSavedTopics,
}: Props) {
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [headerSlot, setHeaderSlot] = useState<ReactNode>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

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
        className="relative flex h-full w-[50vw] flex-col bg-surface shadow-2xl animate-slide-in-right"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-generator-slider-title"
      >
        {/* Slider header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
          <h2
            id="topic-generator-slider-title"
            className="text-base font-semibold text-foreground"
          >
            Topic Generator
          </h2>
          <div className="flex items-center gap-2">
            {headerSlot}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 text-muted hover:text-foreground hover:bg-surface-secondary transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Embedded TopicsPage — each column scrolls independently */}
        <div className="flex-1 min-h-0 flex">
          <TopicsPage
            embedded
            initialDate={initialDate}
            initialBrandId={initialBrandId}
            onHeaderContent={setHeaderSlot}
            onSavedTopics={() => {
              onSavedTopics?.();
            }}
          />
        </div>
      </div>
    </div>
  );
}
