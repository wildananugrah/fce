import type { ReactNode } from "react";
import { Card as HeroCard } from "@heroui/react";

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <HeroCard
      className={className}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <HeroCard.Content>{children}</HeroCard.Content>
    </HeroCard>
  );
}
