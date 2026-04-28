import { useEffect, useRef, useState } from "react";
import { type GeneratorKey, useGeneratorSkills } from "../../hooks/useGeneratorSkills";

interface Props {
  generator: GeneratorKey;
  className?: string;
}

/**
 * Compact, read-only strip listing the marketing skills auto-injected into
 * prompts for a given generator. Clicking a chip opens a small popover with
 * the skill's description; clicking the × button, pressing Escape, or
 * clicking anywhere outside the popover dismisses it.
 *
 * Renders nothing until the manifest loads or if the manifest is empty.
 */
export function SkillsAppliedStrip({ generator, className }: Props) {
  const { skills } = useGeneratorSkills(generator);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openSlug) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpenSlug(null);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenSlug(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openSlug]);

  if (skills.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className ?? ""}`}
    >
      <span className="text-gray-500">Marketing skills applied:</span>
      {skills.map((s) => {
        const isOpen = openSlug === s.slug;
        return (
          <span key={s.slug} className="relative inline-flex">
            <button
              type="button"
              onClick={() => setOpenSlug((prev) => (prev === s.slug ? null : s.slug))}
              aria-expanded={isOpen}
              className={`inline-flex items-center px-2 py-0.5 rounded-full border transition-colors ${
                isOpen
                  ? "bg-slate-200 text-slate-900 border-slate-300"
                  : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
              }`}
            >
              {s.name}
            </button>
            {isOpen && (
              <div
                role="dialog"
                aria-label={`${s.name} description`}
                className="absolute z-50 top-full left-0 mt-1.5 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-lg shadow-lg p-3"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-semibold text-slate-900 text-sm leading-tight">
                    {s.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenSlug(null)}
                    aria-label="Close"
                    className="shrink-0 -mt-0.5 -mr-1 w-5 h-5 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    ×
                  </button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {s.description}
                </p>
              </div>
            )}
          </span>
        );
      })}
    </div>
  );
}
