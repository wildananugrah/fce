import type { SelectHTMLAttributes } from "react";
import { Label } from "@heroui/react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className = "", id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && <Label htmlFor={selectId}>{label}</Label>}
      <select
        id={selectId}
        className={`w-full px-3 py-2 text-sm bg-field-bg text-foreground border border-border rounded-[--radius] focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
