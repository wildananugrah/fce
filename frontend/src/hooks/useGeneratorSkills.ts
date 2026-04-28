import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export type GeneratorKey = "brand-brain" | "product-brain" | "topic" | "content";

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
}

const cache: Partial<Record<GeneratorKey, SkillSummary[]>> = {};
const inflight: Partial<Record<GeneratorKey, Promise<SkillSummary[]>>> = {};

async function load(generator: GeneratorKey): Promise<SkillSummary[]> {
  if (cache[generator]) return cache[generator] as SkillSummary[];
  const existing = inflight[generator];
  if (existing) return existing;
  const promise = api<{ data: SkillSummary[] }>(`/api/skills/${generator}`)
    .then((res) => {
      const rows = Array.isArray(res.data) ? res.data : [];
      cache[generator] = rows;
      return rows;
    })
    .catch(() => {
      // Cache empty so the strip silently renders nothing for the rest of the
      // session — matches the plan's "no error toast" requirement. Remove the
      // cache write here if a future spec requires retry on subsequent renders.
      cache[generator] = [];
      return [] as SkillSummary[];
    })
    .finally(() => {
      delete inflight[generator];
    });
  inflight[generator] = promise;
  return promise;
}

export function useGeneratorSkills(generator: GeneratorKey) {
  const [skills, setSkills] = useState<SkillSummary[]>(
    cache[generator] ?? []
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    load(generator).then((list) => {
      if (mounted.current) setSkills(list);
    });
    return () => {
      mounted.current = false;
    };
  }, [generator]);
  return { skills };
}
