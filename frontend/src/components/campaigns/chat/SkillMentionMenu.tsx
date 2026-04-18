import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { SkillSummary } from "../../../hooks/useAvailableSkills";

interface SkillMentionMenuProps {
  skills: SkillSummary[];
  activeIndex: number;
  onSelect: (skill: SkillSummary) => void;
  onHoverIndex: (i: number) => void;
  position: { left: number; top: number };
}

export function SkillMentionMenu({
  skills,
  activeIndex,
  onSelect,
  onHoverIndex,
  position,
}: SkillMentionMenuProps) {
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (skills.length === 0) return null;

  return (
    <div
      className="absolute z-20 w-[280px] max-h-[220px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
      style={{ left: position.left, top: position.top }}
      role="listbox"
    >
      <div className="px-2.5 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 bg-gray-50">
        Skills
      </div>
      <ul ref={listRef} className="py-1">
        {skills.map((skill, i) => (
          <li key={skill.id} data-idx={i}>
            <button
              type="button"
              onMouseDown={(e) => {
                // mousedown instead of click so the textarea doesn't lose focus first
                e.preventDefault();
                onSelect(skill);
              }}
              onMouseEnter={() => onHoverIndex(i)}
              className={`w-full flex items-start gap-2 px-2.5 py-1.5 text-left text-xs ${
                i === activeIndex ? "bg-indigo-50" : "hover:bg-gray-50"
              }`}
              role="option"
              aria-selected={i === activeIndex}
            >
              <Sparkles
                size={12}
                className={`mt-0.5 shrink-0 ${
                  i === activeIndex ? "text-indigo-600" : "text-gray-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900 truncate">{skill.name}</p>
                {skill.description && (
                  <p className="text-[11px] text-gray-500 line-clamp-2 leading-snug">
                    {skill.description}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[10px] text-gray-400 mt-0.5">
                {skill.category}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
