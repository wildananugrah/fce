import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenRouterModels, type OpenRouterModel } from "../../hooks/useOpenRouterModels";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  category?: "image" | "video";
  disabled?: boolean;
}

function modalityFilter(m: OpenRouterModel, category: "image" | "video"): boolean {
  const inputs = m.architecture?.input_modalities ?? [];
  const outputs = m.architecture?.output_modalities ?? [];
  if (category === "image") return outputs.includes("image");
  if (category === "video") return inputs.includes("video");
  return true;
}

export function OpenRouterModelPicker({ value, onChange, placeholder, category, disabled }: Props) {
  const { models, loading, error, refresh } = useOpenRouterModels();
  const [open, setOpen] = useState(false);
  // committedValue tracks the last externally-set value so we can sync query without an effect.
  const [committedValue, setCommittedValue] = useState(value);
  const [query, setQuery] = useState(value);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Sync query to external value changes (React derived-state pattern — no effect needed).
  if (committedValue !== value) {
    setCommittedValue(value);
    setQuery(value);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!models) return [];
    const lc = query.toLowerCase();
    return models
      .filter((m) => (category ? modalityFilter(m, category) : true))
      .filter((m) => !lc || m.id.toLowerCase().includes(lc) || m.name.toLowerCase().includes(lc))
      .slice(0, 100);
  }, [models, query, category]);

  if (error) {
    // Fallback: free-text input.
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
        />
        <span className="text-xs text-amber-600">
          Couldn&apos;t load model list — type model id manually.{" "}
          <button type="button" onClick={refresh} className="underline">
            Retry
          </button>
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? (loading ? "Loading models…" : "Type or pick a model")}
        disabled={disabled || loading}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto text-sm">
          {filtered.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setQuery(m.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                <div className="font-mono text-xs">{m.id}</div>
                <div className="text-xs text-gray-500">{m.name}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && !loading && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg p-3 text-xs text-gray-500">
          No matching models. Free-text accepted.
        </div>
      )}
    </div>
  );
}
