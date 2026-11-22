"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="max-h-80 overflow-auto rounded-xl border border-white/[0.06] bg-ink-950 p-3 text-[12px] leading-relaxed text-fg-muted">{text}</pre>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
