import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField, Label, Input as HeroInput, FieldError, InputGroup } from "@heroui/react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, type, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const isPassword = type === "password";
    const [showPassword, setShowPassword] = useState(false);
    const effectiveType = isPassword && showPassword ? "text" : type;

    const inputEl = isPassword ? (
      <InputGroup>
        <InputGroup.Input
          ref={ref}
          id={inputId}
          type={effectiveType}
          className={className}
          {...(props as object)}
        />
        <InputGroup.Suffix>
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="px-3 text-muted hover:text-foreground focus:outline-none"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </InputGroup.Suffix>
      </InputGroup>
    ) : (
      <HeroInput
        ref={ref}
        id={inputId}
        type={effectiveType}
        className={`w-full ${className}`}
        {...(props as object)}
      />
    );

    return (
      <TextField isInvalid={!!error} className="w-full">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        {inputEl}
        {error && <FieldError>{error}</FieldError>}
      </TextField>
    );
  },
);

Input.displayName = "Input";
