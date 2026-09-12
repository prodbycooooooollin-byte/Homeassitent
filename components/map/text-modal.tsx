"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function TextModal({ onSave, onClose }: { onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-panel border border-line bg-surface p-5 shadow-panel">
        <h3 className="mb-3 text-sm font-semibold text-ink">Textnotiz</h3>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Text eingeben…"
          maxLength={200}
          className="w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Abbrechen
          </Button>
          <Button size="sm" disabled={!text.trim()} onClick={() => onSave(text.trim())}>
            Setzen
          </Button>
        </div>
      </div>
    </div>
  );
}
