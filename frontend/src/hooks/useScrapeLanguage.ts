import { useState, useEffect, useRef } from "react";
import { useAuth } from "./useAuth";
import type { ScrapeLanguage } from "../types";

export function useScrapeLanguage(): [ScrapeLanguage, (value: ScrapeLanguage) => void] {
  const { user } = useAuth();
  const [language, setLanguage] = useState<ScrapeLanguage>(
    user?.defaultScrapeLanguage ?? "indonesian",
  );
  const hydrated = useRef(user?.defaultScrapeLanguage !== undefined);

  useEffect(() => {
    if (!hydrated.current && user?.defaultScrapeLanguage) {
      setLanguage(user.defaultScrapeLanguage);
      hydrated.current = true;
    }
  }, [user?.defaultScrapeLanguage]);

  return [language, setLanguage];
}
