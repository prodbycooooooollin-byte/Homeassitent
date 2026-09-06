"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function CopyButton({ value, label = "Kopieren", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard-API evtl. nicht verfügbar (z.B. unsicherer Kontext) – kein Absturz.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy} className={cn(className)}>
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Kopiert!" : label}
    </Button>
  );
}
