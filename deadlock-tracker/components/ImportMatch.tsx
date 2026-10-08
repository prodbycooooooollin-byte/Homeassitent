"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { useTracker } from "./Providers";
import { NavLink } from "./NavLink";

/** Match per ID oder Link hinzufügen – Notlösung, wenn die Historie der API dem Spiel hinterherhinkt. */
export function ImportMatch() {
  const { syncNow } = useTracker();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; id?: number } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await (await fetch("/api/matches/import", { method: "POST", body: JSON.stringify({ input: v }) })).json();
      setMsg({ ok: !!r.ok, text: r.ok ? "Match hinzugefügt." : r.error ?? "Fehlgeschlagen", id: r.matchId });
      if (r.ok) { setV(""); await syncNow(); }
    } catch { setMsg({ ok: false, text: "Nicht erreichbar." }); }
    setBusy(false);
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="btn btn-ghost px-3 py-1.5 text-sm"><Icon name="plusSign" size={14} /> Match per ID</button>
      {open && (
        <div className="surface absolute right-0 z-20 mt-2 w-[360px] p-4 shadow-2xl">
          <p className="mb-2 text-xs text-muted">Fehlt ein Match, weil die API es noch nicht in deiner Historie führt? Füge die Match-ID oder den Link (z. B. von Statlocker) ein – die Details werden direkt geladen.</p>
          <div className="flex gap-2">
            <input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Enter" && v && go()} placeholder="Match-ID oder Link …" className="input flex-1" />
            <button onClick={go} disabled={busy || !v} className="btn btn-gold disabled:opacity-50">{busy ? "…" : "Laden"}</button>
          </div>
          {msg && <div className={`mt-2 text-xs ${msg.ok ? "text-win" : "text-loss"}`}>{msg.text} {msg.ok && msg.id && <NavLink href={`/match/${msg.id}`} className="underline">Öffnen</NavLink>}</div>}
        </div>
      )}
    </div>
  );
}
