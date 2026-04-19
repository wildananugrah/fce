import { useEffect } from "react";
import { X } from "lucide-react";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "info";
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = "info", onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const colors = {
    success: "bg-green-50 border-green-200 text-green-800",
    error: "bg-red-50 border-red-200 text-red-800",
    info: "bg-gray-50 border-gray-200 text-gray-800",
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg border shadow-md text-sm animate-slide-in-right ${colors[type]}`}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
}
