import { Fragment } from "react";
import { useAvailableSkills, type SkillSummary } from "../../../../hooks/useAvailableSkills";

interface MentionedTextProps {
  content: string;
  skillIds?: string[];
}

const TOKEN_RE = /@([A-Za-z0-9_-]+)/g;

/**
 * Renders a user message's plain text, turning `@Skill_Name` tokens into a
 * small pill when the token matches a known skill (by name with underscores
 * for spaces). Unknown tokens fall back to inline text so we don't eat real
 * `@username`-style strings the user might type.
 */
export function MentionedText({ content, skillIds }: MentionedTextProps) {
  const { skills } = useAvailableSkills();

  // Resolve skillIds (which now hold slugs) for this message to their skill rows
  // so we can name pills even if the token spelling doesn't exactly match.
  const explicitSkillsBySlug = new Map<string, SkillSummary>();
  for (const slug of skillIds ?? []) {
    const s = skills.find((x) => x.slug === slug);
    if (s) explicitSkillsBySlug.set(slug, s);
  }
  const byToken = new Map<string, SkillSummary>();
  for (const s of skills) {
    byToken.set(s.name.replace(/\s+/g, "_").toLowerCase(), s);
  }

  const parts: Array<{ kind: "text" | "pill"; value: string; skill?: SkillSummary }> = [];
  let lastIndex = 0;
  for (const match of content.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    const raw = match[1]; // without leading @
    const skill = byToken.get(raw.toLowerCase());
    if (!skill) continue; // unknown token → leave as-is inside the surrounding text slice
    if (start > lastIndex) parts.push({ kind: "text", value: content.slice(lastIndex, start) });
    parts.push({ kind: "pill", value: skill.name, skill });
    lastIndex = start + 1 + raw.length;
  }
  if (lastIndex < content.length) parts.push({ kind: "text", value: content.slice(lastIndex) });
  if (parts.length === 0) parts.push({ kind: "text", value: content });

  return (
    <div className="text-[12.5px] leading-[1.55] whitespace-pre-wrap break-words">
      {parts.map((p, i) => {
        if (p.kind === "text") return <Fragment key={i}>{p.value}</Fragment>;
        return (
          <span
            key={i}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 text-[11px] font-medium bg-white/20 text-white rounded border border-white/30 align-baseline"
            title={p.skill?.description || p.skill?.name}
          >
            @{p.value}
          </span>
        );
      })}
    </div>
  );
}
