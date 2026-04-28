import { type GeneratorKey, useGeneratorSkills } from "../../hooks/useGeneratorSkills";

interface Props {
  generator: GeneratorKey;
  className?: string;
}

/**
 * Compact, read-only strip listing the marketing skills auto-injected into
 * prompts for a given generator. Renders nothing until the manifest loads
 * or if the manifest is empty.
 */
export function SkillsAppliedStrip({ generator, className }: Props) {
  const { skills } = useGeneratorSkills(generator);

  if (skills.length === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5 text-xs ${className ?? ""}`}
    >
      <span className="text-gray-500">Marketing skills applied:</span>
      {skills.map((s) => (
        <span
          key={s.slug}
          title={s.description}
          className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 cursor-help"
        >
          {s.name}
        </span>
      ))}
    </div>
  );
}
