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
  placement?: "left" | "right";
  width?: string;
}

const slideIn = {
  left: "animate-slide-in-left",
  right: "animate-slide-in-right",
};

const position = {
  left: "justify-start",
  right: "justify-end",
};

export function Drawer({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  headerExtra,
  placement = "right",
  width = "w-full max-w-2xl",
}: DrawerProps) {
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
    <div className={`fixed inset-0 z-50 flex ${position[placement]}`}>
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative bg-surface ${width} h-full shadow-xl flex flex-col ${slideIn[placement]}`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-muted hover:text-foreground p-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {headerExtra}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
