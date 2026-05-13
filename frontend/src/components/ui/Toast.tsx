import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

const typeClasses = {
  success: "bg-surface border-success text-success",
  error: "bg-surface border-danger text-danger",
  info: "bg-surface border-border text-foreground",
};

export function Toast({ message, type = "info", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-md text-sm animate-slide-in-right ${typeClasses[type]}`}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      <button onClick={onClose} className="opacity-50 hover:opacity-100 focus:outline-none">
        <X size={14} />
      </button>
    </div>
  );
}
