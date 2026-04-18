import { useEffect, useRef, useState } from "react";
import { api } from "../services/api";

export interface SkillSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
}

let cache: SkillSummary[] | null = null;
let inflight: Promise<SkillSummary[]> | null = null;

async function loadSkills(): Promise<SkillSummary[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api<SkillSummary[]>("/api/skills")
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

/**
 * Returns the full list of skills available for @-mention in the chat. Cached
 * across components for the page lifetime; cheap to call anywhere.
 */
export function useAvailableSkills(): {
  skills: SkillSummary[];
  loading: boolean;
} {
  const [skills, setSkills] = useState<SkillSummary[]>(cache ?? []);
  const [loading, setLoading] = useState(!cache);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (cache) {
      setSkills(cache);
      setLoading(false);
      return;
    }
    loadSkills().then((rows) => {
      if (!mountedRef.current) return;
      setSkills(rows);
      setLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { skills, loading };
}
