import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-lg ${onClick ? "cursor-pointer hover:border-gray-300" : ""} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
