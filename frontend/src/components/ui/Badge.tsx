import type { ReactNode } from "react";
import { Chip } from "@heroui/react";

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info";
  children: ReactNode;
}

const colorMap = {
  default: "default",
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "accent",
} as const;

export function Badge({ variant = "default", children }: BadgeProps) {
  return (
    <Chip color={colorMap[variant]} variant="soft" size="sm">
      {children}
    </Chip>
  );
}
