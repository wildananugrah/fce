import type { ScrapeLanguage } from "../../types";

export type { ScrapeLanguage };

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
    <div
      role="group"
      aria-label="Auto-fill output language"
      className="inline-flex rounded-md border border-gray-300 overflow-hidden"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`px-2.5 py-2 text-xs font-medium transition-colors ${
              active
                ? "bg-black text-white"
                : "bg-white text-gray-700 hover:bg-gray-50"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
