"use client";
import { useState } from "react";
import { PageTitle } from "@/components/ui";
import { useTracker } from "@/components/Providers";
import { INGEST_COLOR, useIngest } from "@/components/useIngest";
import { useUpdater } from "@/components/useUpdater";

interface Check { name: string; url: string; ok: boolean; status: number | string; ms: number; summary: string; limits?: string }
interface Diag {
  demo: boolean; base?: string; apiKey?: boolean; checks: Check[];
  store?: { players: number; matches: number; withDetails: number; pending: number; steamBudgetLeft: number; errors: { matchId: number; attempts: number; error?: string }[] };
  log?: { at: number; path: string; status: number | string; ms: number; note?: string }[];
}

export default function StatusPage() {
  const { status } = useTracker();
  const up = useUpdater();
  const ing = useIngest();
  const [d, setD] = useState<Diag | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setD(await (await fetch("/api/diagnose", { method: "POST" })).json()); } finally { setBusy(false); }
  };
  return (
    <>
      <PageTitle title="Diagnose" sub="Prüft von deinem Rechner aus, ob die Deadlock-API erreichbar ist und was sie liefert"
        right={<button onClick={run} disabled={busy} className="btn btn-gold disabled:opacity-50">{busy ? "Teste …" : "Verbindung testen"}</button>} />
      {up && (
        <section className="surface flex flex-wrap items-center gap-4 p-5">
          <div>
            <div className="label">Desktop-App</div>
            <div className="display text-2xl font-extrabold">Version {up.current}</div>
            <div className="text-sm text-muted">
              {up.status === "checking" && "Suche nach Updates …"}
              {up.status === "uptodate" && `Aktuell${up.lastCheck ? ` · geprüft ${new Date(up.lastCheck).toLocaleTimeString("de-DE")}` : ""}`}
              {up.status === "available" && `Update ${up.version} gefunden …`}
              {up.status === "downloading" && `Update ${up.version}: ${up.percent}%`}
              {up.status === "ready" && `Update ${up.version} ist bereit`}
              {up.status === "error" && `Update-Prüfung fehlgeschlagen: ${up.message}`}
              {up.status === "unsupported" && up.message}
              {up.status === "idle" && "Noch nicht geprüft"}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            {up.status === "ready" ? <button onClick={() => window.desktop?.installUpdate()} className="btn btn-gold">Neu starten & installieren</button>
              : up.status !== "unsupported" && <button onClick={() => window.desktop?.checkForUpdates()} className="btn btn-ghost">Nach Updates suchen</button>}
            {up.status === "unsupported" && <a className="btn btn-ghost" href={up.releasesUrl} target="_blank" rel="noreferrer">Release-Seite</a>}
          </div>
        </section>
      )}
      {ing && (
        <section className="surface p-5">
          <div className="flex items-center gap-3"><div className="label">Match-Daten-Helfer (deadlock-api-ingest)</div><span className="ml-auto flex items-center gap-1.5 text-sm"><i className="h-2.5 w-2.5 rounded-full" style={{ background: INGEST_COLOR[ing.state] }} />{ing.message}</span></div>
          <p className="mt-1 text-sm text-muted">Läuft im Hintergrund der Desktop-App und meldet Match-Salts aus dem Steam-Cache an die Deadlock-API. Ein- und ausschalten unter Einstellungen → Desktop-App.</p>
          {ing.lines.length > 0 && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted">{ing.lines.slice(-20).join("\n")}</pre>}
        </section>
      )}
      <section className="surface p-5">
        <div className="label mb-1">Ein Match fehlt?</div>
        <p className="text-sm text-muted">
          Die Deadlock-API bekommt Match-Daten nicht direkt von Valve, sondern über sogenannte Match-Salts: Spieler lassen das Open-Source-Programm{" "}
          <a className="underline text-white" href="https://github.com/deadlock-api/deadlock-api-ingest" target="_blank" rel="noreferrer">deadlock-api-ingest</a>{" "}
          auf ihrem PC laufen, das Salts aus dem Steam-Cache liest und an die API schickt; dazu kommen Steam-Konten der Betreiber mit begrenzten Abrufen pro Tag. Läuft in deinem Match niemand mit dem Tool, kann es Stunden dauern, bis es auftaucht.
          Installierst du das Tool selbst, stehen <b className="text-white">deine</b> Matches meist kurz nach dem Spiel bereit. Bis dahin hilft „Match per ID“ auf der Matches-Seite, sobald die API das Match kennt.
        </p>
      </section>
      {status?.demo && <div className="surface p-4 text-sm text-amber">Demo-Modus aktiv – es werden keine echten API-Aufrufe gemacht.</div>}
      {!d && <div className="surface p-8 text-center text-muted">Klicke „Verbindung testen“, um alle Endpunkte (Assets, Historie, Rang, Details, Live, Meta) zu prüfen.</div>}
      {d && d.checks.length > 0 && (
        <section className="surface overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-3 text-sm text-muted">Basis: {d.base} · API-Key: {d.apiKey ? "ja" : "nein (optional)"}</div>
          {d.checks.map((c) => (
            <div key={c.name} className="flex flex-wrap items-center gap-3 border-b border-white/[0.04] px-4 py-3">
              <span className={`h-2.5 w-2.5 rounded-full ${c.ok ? "bg-win" : "bg-loss"}`} />
              <div className="min-w-[200px]"><div className="font-semibold">{c.name}</div><div className="text-xs text-muted">{c.url}</div></div>
              <div className="num w-16 text-sm">{String(c.status)}</div>
              <div className="num w-20 text-sm text-muted">{c.ms} ms</div>
              <div className="min-w-0 flex-1 text-sm">{c.summary}{c.limits && <div className="text-[11px] text-muted">{c.limits}</div>}</div>
            </div>
          ))}
        </section>
      )}
      {d?.store && (
        <section className="surface p-5">
          <h2 className="label mb-3">Datenbestand</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[["Accounts", d.store.players], ["Matches", d.store.matches], ["mit Details", d.store.withDetails], ["warten auf Details", d.store.pending], ["Steam-Fallbacks frei/h", d.store.steamBudgetLeft]].map(([l, v]) => (
              <div key={String(l)}><div className="display num text-2xl font-extrabold">{v}</div><div className="text-xs text-muted">{l}</div></div>
            ))}
          </div>
          {d.store.errors.length > 0 && (
            <div className="mt-4 space-y-1 text-sm">{d.store.errors.map((e) => <div key={e.matchId} className="text-muted">#{e.matchId} · {e.attempts}× versucht · <span className="text-loss">{e.error}</span></div>)}</div>
          )}
        </section>
      )}
      {d?.log && d.log.length > 0 && (
        <section className="surface overflow-hidden">
          <h2 className="label px-4 pt-4">Letzte API-Aufrufe</h2>
          <div className="mt-2 max-h-96 overflow-y-auto">
            {d.log.map((l, i) => (
              <div key={i} className="num flex gap-3 border-t border-white/[0.04] px-4 py-1.5 text-xs">
                <span className="w-16 text-muted">{new Date(l.at).toLocaleTimeString("de-DE")}</span>
                <span className={`w-10 ${l.status === 200 ? "text-win" : "text-loss"}`}>{String(l.status)}</span>
                <span className="w-14 text-muted">{l.ms} ms</span>
                <span className="min-w-0 flex-1 truncate">{l.path}{l.note ? ` – ${l.note}` : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
