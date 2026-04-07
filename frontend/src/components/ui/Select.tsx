import type { SelectHTMLAttributes } from "react";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className = "", id, ...props }: SelectProps) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={selectId}
          className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1.5"
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-md focus:outline-none focus:border-black focus:ring-1 focus:ring-black ${className}`}
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
