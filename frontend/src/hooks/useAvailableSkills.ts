import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export interface SkillSummary {
  slug: string;
  name: string;
  description: string;
}

let cache: SkillSummary[] | null = null;
let inflight: Promise<SkillSummary[]> | null = null;

async function loadSkills(): Promise<SkillSummary[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<SkillSummary[]>("/api/skills/chat")
    .then((rows) => {
      cache = Array.isArray(rows) ? rows : [];
      return cache;
    })
    .catch(() => {
      cache = [];
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAvailableSkills() {
  const [skills, setSkills] = useState<SkillSummary[]>(cache ?? []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    loadSkills().then((list) => {
      if (mounted.current) setSkills(list);
    });
    return () => {
      mounted.current = false;
    };
  }, []);
  return { skills };
}
