import type { ScrapeLanguage } from "../../types";

interface ScrapeLanguageToggleProps {
  value: ScrapeLanguage;
  onChange: (value: ScrapeLanguage) => void;
  disabled?: boolean;
}

const OPTIONS: { value: ScrapeLanguage; label: string }[] = [
  { value: "indonesian", label: "ID" },
  { value: "english", label: "EN" },
];

export function ScrapeLanguageToggle({ value, onChange, disabled }: ScrapeLanguageToggleProps) {
  return (
    <div role="group" aria-label="Auto-fill output language" className="inline-flex bg-surface-secondary rounded-full p-0.5">
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-all disabled:opacity-50 disabled:pointer-events-none ${
              active
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
