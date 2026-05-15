import type { ButtonHTMLAttributes, MouseEvent } from "react";
import { Button as HeroButton } from "@heroui/react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
}

const variantMap = {
  primary: "primary",
  secondary: "outline",
  danger: "danger",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  onClick,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <HeroButton
      variant={variantMap[variant]}
      size={size}
      isPending={loading}
      isDisabled={disabled || loading}
      onPress={onClick ? (e) => onClick(e as unknown as MouseEvent<HTMLButtonElement>) : undefined}
      className={className}
      type={type}
      {...(rest as object)}
    >
      {children}
    </HeroButton>
  );
}
