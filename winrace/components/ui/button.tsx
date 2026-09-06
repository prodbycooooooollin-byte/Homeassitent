import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type Size = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-glow-brand hover:bg-brand/90 active:bg-brand/80 disabled:hover:bg-brand",
  secondary: "bg-base-card-hover text-ink hover:bg-base-border border border-base-border-strong",
  outline: "bg-transparent border border-base-border-strong text-ink hover:bg-base-card-hover",
  ghost: "bg-transparent text-ink-muted hover:bg-base-card-hover hover:text-ink",
  danger: "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
  success: "bg-success/15 text-success border border-success/30 hover:bg-success/25",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
  icon: "h-10 w-10 shrink-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium transition-colors duration-150",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-2 focus-visible:outline-offset-2",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
