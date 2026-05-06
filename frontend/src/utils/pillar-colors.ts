// Lazily-assigned pillar → tailwind class mapping. Pillars get a color the
// first time they're seen (per session) and keep it for the rest of the
// session, so the same pillar reads identically across pages.

const PILLAR_COLORS: Record<string, string> = {};
const PILLAR_COLOR_POOL = [
  "bg-emerald-50 text-emerald-700",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-700",
  "bg-teal-50 text-teal-700",
  "bg-rose-50 text-rose-700",
  "bg-blue-50 text-blue-700",
  "bg-orange-50 text-orange-700",
  "bg-pink-50 text-pink-700",
];
let pillarColorIdx = 0;

export function getPillarColor(pillar: string): string {
  if (!PILLAR_COLORS[pillar]) {
    PILLAR_COLORS[pillar] = PILLAR_COLOR_POOL[pillarColorIdx % PILLAR_COLOR_POOL.length];
    pillarColorIdx++;
  }
  return PILLAR_COLORS[pillar];
}
