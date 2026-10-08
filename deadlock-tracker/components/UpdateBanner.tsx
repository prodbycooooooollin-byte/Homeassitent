"use client";
import { useEffect, useState } from "react";
import { useUpdater } from "./useUpdater";

/** Dezentes Update-Banner unten rechts: Fortschritt, dann „Neu starten & installieren“. */
export function UpdateBanner() {
  const u = useUpdater();
  const [hidden, setHidden] = useState(false);
  const [updated, setUpdated] = useState(false);
  useEffect(() => { window.desktop?.wasUpdated?.().then((v) => { if (v) { setUpdated(true); setTimeout(() => setUpdated(false), 9000); } }).catch(() => null); }, []);
  if (u?.status === "installing") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-5 bg-[#05060a]/95 text-center backdrop-blur">
        <div className="h-14 w-14 animate-spin rounded-full border-[3px] border-white/10 border-t-amber" />
        <div className="display text-2xl font-extrabold">Update wird installiert</div>
        <p className="max-w-sm text-sm text-muted">Version {u.current} → <b className="text-white">{u.version}</b>. {u.message || "Die App schließt sich gleich, ein Installationsfenster zeigt den Fortschritt, danach startet Lockscope von selbst neu."}</p>
        {u.percent > 0 && u.percent < 100 && <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber to-[#fff1c9] transition-all" style={{ width: `${u.percent}%` }} /></div>}
      </div>
    );
  }
  if (updated) return <div className="surface toast-in fixed bottom-4 right-4 z-50 w-80 border-[#3ecf8e]/50 p-4 shadow-2xl"><div className="display font-bold text-[#3ecf8e]">Update installiert</div><div className="text-xs text-muted">Du nutzt jetzt Version {u?.current ?? ""}.</div></div>;
  if (!u || hidden || !["available", "downloading", "ready"].includes(u.status)) return null;
  const ready = u.status === "ready";
  return (
    <div className="surface toast-in fixed bottom-4 right-4 z-50 w-80 border-amber/40 p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className={ready ? "live-dot mt-1.5" : "mt-1 h-3 w-3 animate-spin rounded-full border-2 border-amber border-t-transparent"} />
        <div className="min-w-0 flex-1">
          <div className="display font-bold">{ready ? "Update bereit" : "Update wird geladen …"}</div>
          <div className="text-xs text-muted">Version {u.current} → <b className="text-white">{u.version}</b></div>
          {!ready && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber to-[#fff1c9] transition-all" style={{ width: `${Math.max(4, u.percent)}%` }} />
            </div>
          )}
          {ready && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => window.desktop?.installUpdate()} className="btn btn-gold !px-3 !py-1.5 text-xs">Neu starten & installieren</button>
              <button onClick={() => setHidden(true)} className="btn btn-ghost !px-3 !py-1.5 text-xs">Später</button>
            </div>
          )}
          {ready && <div className="mt-2 text-[11px] text-muted">Ohne Klick wird nichts installiert.</div>}
        </div>
      </div>
    </div>
  );
}
