import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink-muted", className)} {...props} />;
}

export function HelpText({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("mt-1.5 text-xs text-ink-faint", className)} {...props} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
      {children}
    </p>
  );
}

const fieldBase =
  "w-full rounded-lg border border-base-border-strong bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus-visible:border-brand disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, "min-h-24 resize-y", className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(fieldBase, "appearance-none", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
