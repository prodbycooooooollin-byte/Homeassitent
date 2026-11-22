"use client";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { actions, useStore } from "@/lib/client/store";
import { cn } from "@/lib/cn";

/** Blurs spoiler content until revealed (default from the device-level spoiler preference). */
export function Spoiler({ children, label = "Spoiler", className }: { children: ReactNode; label?: string; className?: string }) {
  const pref = useStore((s) => s.prefs.spoilers);
  const [revealed, setRevealed] = useState(false);
  const hidden = pref === "hide" && !revealed;
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden={hidden} className={cn("transition duration-300", hidden && "pointer-events-none select-none blur-md")}>
        {children}
      </div>
      {hidden ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-ink-950/40 text-sm font-medium text-fg"
        >
          <Eye className="h-4 w-4 text-violet-300" /> Reveal {label.toLowerCase()}
        </button>
      ) : null}
    </div>
  );
}

export function SpoilerToggle() {
  const pref = useStore((s) => s.prefs.spoilers);
  const hide = pref === "hide";
  return (
    <button
      type="button"
      onClick={() => actions.setPrefs({ spoilers: hide ? "show" : "hide" })}
      aria-pressed={!hide}
      className="chip text-xs"
      title="Spoiler preference (saved on this device)"
    >
      {hide ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {hide ? "Spoilers hidden" : "Spoilers shown"}
    </button>
  );
}
