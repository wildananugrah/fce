export function TypingIndicator({ label = "Thinking" }: { label?: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[11px] text-gray-500"
      role="status"
      aria-live="polite"
    >
      <span className="flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-typing-dot [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-typing-dot [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-gray-400 animate-typing-dot [animation-delay:300ms]" />
      </span>
      <span>{label}…</span>
    </div>
  );
}
