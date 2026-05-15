import { useState, useEffect, useRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Label } from "@heroui/react";

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  label?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Search...",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = options.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q);
  });

  return (
    <div ref={ref} className="relative">
      {label && <Label>{label}</Label>}

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-field-bg text-foreground border border-border rounded-[--radius] text-left focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      >
        <span className={selectedOption ? "text-foreground" : "text-muted"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setSearch("");
              }}
              className="p-0.5 hover:bg-surface-secondary rounded"
            >
              <X size={14} className="text-muted" />
            </span>
          )}
          <ChevronDown size={14} className="text-muted" />
        </div>
      </button>

      {open && (
        <div className="absolute z-30 top-full mt-1 w-full bg-surface border border-border rounded-[--radius] shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search size={14} className="text-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={placeholder}
              className="w-full text-sm text-foreground bg-transparent outline-none placeholder:text-muted"
            />
          </div>

          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted text-center">No results found</div>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    option.value === value
                      ? "bg-accent/10 text-accent"
                      : "text-foreground hover:bg-surface-secondary"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="truncate font-medium">{option.label}</div>
                  {option.sublabel && (
                    <div className="text-xs text-muted truncate">{option.sublabel}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
