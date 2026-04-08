import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  headerActions?: ReactNode;
  headerExtra?: ReactNode;
}

export function Drawer({ isOpen, onClose, title, subtitle, children, headerActions, headerExtra }: DrawerProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-2xl h-full shadow-xl flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-black">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button onClick={onClose} className="text-gray-400 hover:text-black p-1">
              <X size={18} />
            </button>
          </div>
        </div>
        {headerExtra}
        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
