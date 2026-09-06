import { cn } from "@/lib/cn";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
}

export function Toggle({ checked, onChange, disabled, label, size = "md" }: ToggleProps) {
  const trackSize = size === "sm" ? "h-6 w-11" : "h-7 w-[3.25rem]";
  const knobSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const translate = size === "sm" ? (checked ? "translate-x-[1.375rem]" : "translate-x-1") : checked ? "translate-x-7" : "translate-x-1";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        "disabled:opacity-40 disabled:pointer-events-none",
        trackSize,
        checked ? "bg-accent shadow-glowAccent" : "bg-surface-raised border border-line",
      )}
    >
      <span
        className={cn(
          "inline-block rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
          knobSize,
          translate,
        )}
      />
    </button>
  );
}
