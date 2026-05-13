import { Spinner as HeroSpinner } from "@heroui/react";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return <HeroSpinner size={size} color="accent" className={className} />;
}
