"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  function handleClick() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-raised px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-accent",
        className,
      )}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Kopiert" : label ?? "Kopieren"}
    </button>
  );
}
