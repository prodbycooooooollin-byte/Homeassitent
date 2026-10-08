"use client";
import { useState } from "react";
import { PageTitle } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { NavLink } from "@/components/NavLink";
import { useTracker } from "@/components/Providers";
import { INGEST_COLOR, useIngest } from "@/components/useIngest";
import { useUpdater } from "@/components/useUpdater";
import { useEffect } from "react";

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
              : up.portable ? <button onClick={() => window.desktop?.runInstaller()} className="btn btn-gold text-sm">Mit Installer installieren</button> : up.status !== "unsupported" && <button onClick={() => window.desktop?.checkForUpdates()} className="btn btn-ghost">Nach Updates suchen</button>}
            {up.status === "unsupported" && <a className="btn btn-ghost" href={up.releasesUrl} target="_blank" rel="noreferrer">Release-Seite</a>}
          </div>
        </section>
      )}
      {ing && (
        <section className="surface p-5">
          <div className="flex items-center gap-3"><div className="label">Match-Daten-Helfer (deadlock-api-ingest)</div><span className="ml-auto flex items-center gap-1.5 text-sm"><i className="h-2.5 w-2.5 rounded-full" style={{ background: INGEST_COLOR[ing.state] }} />{ing.message}</span></div>
          <p className="mt-1 text-sm text-muted">Läuft im Hintergrund der Desktop-App und meldet Match-Salts aus dem Steam-Cache an die Deadlock-API. Ein- und ausschalten unter Einstellungen → Desktop-App.</p>
          <NavLink href="/ingest" className="btn btn-ghost mt-3 text-sm"><Icon name="window" size={15} />Konsole öffnen</NavLink>
          {ing.lines.length > 0 && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted">{ing.lines.slice(-20).map((l) => `${new Date(l.t).toLocaleTimeString("de-DE")} ${l.text}`).join("\n")}</pre>}
        </section>
      )}
      <Detection />
      <Recorder />
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

const ago = (t: number | null | undefined) => (t ? `vor ${Math.max(0, Math.round((Date.now() - t) / 1000))} s` : "–");

/** Zeigt, welche Wege der Match-Erkennung gerade arbeiten – damit klar ist, woran es hängt, wenn ein Match nicht erscheint. */
function Detection() {
  const { status, account } = useTracker();
  const ing = useIngest();
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(!!window.desktop), []);
  const [mw, setMw] = useState<{ dirs: string[]; last: { matchId: number; at: number } | null; error: string | null; watching: boolean } | null>(null);
  useEffect(() => {
    if (!window.desktop?.getMatchWatch) return;
    const load = () => window.desktop!.getMatchWatch().then(setMw).catch(() => null);
    load(); const t = setInterval(load, 4000); return () => clearInterval(t);
  }, []);
  const det = status?.detection;
  const me = status?.players.find((p) => p.accountId === account);
  const dot = (ok: boolean | null) => <i className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: ok === null ? "#8b94a8" : ok ? "#3ecf8e" : "#f0616d" }} />;
  return (
    <section className="surface p-5">
      <div className="label mb-2">Match-Erkennung</div>
      <ul className="space-y-1.5 text-sm">
        <li>{dot(det ? det.game.running : null)}<b>Spiel:</b> {!isDesktop ? "wird nur in der Desktop-App erkannt" : det?.game.running ? `Deadlock läuft seit ${det.game.since ? new Date(det.game.since).toLocaleTimeString("de-DE") : "?"} – Abfrage im schnellen Takt` : det?.game.endedAt ? `Deadlock beendet ${ago(det.game.endedAt)} – Abfrage bleibt 25 Minuten schnell` : "Deadlock läuft gerade nicht (Prozess project8.exe nicht gefunden)"}</li>
        <li>{dot(mw ? mw.watching : null)}<b>Steam-Cache:</b> {mw ? (mw.watching ? `beobachtet ${mw.dirs.length} Ordner${mw.last ? ` · zuletzt Match #${mw.last.matchId} (${ago(mw.last.at)})` : " · noch kein Match erkannt"}` : `nicht aktiv${mw.error ? ` (${mw.error})` : ""}`) : "nur in der Desktop-App"}</li>
        <li>{dot(ing ? ing.state === "running" || ing.state === "external" : null)}<b>Match-Daten-Helfer:</b> {ing ? `${ing.message} · ${ing.matches} Salt-Meldungen, ${ing.errors} Fehler` : "nur in der Desktop-App"}</li>
        <li>{dot(me ? me.lastSyncOk !== false : null)}<b>Historie:</b> {me ? `zuletzt abgefragt ${ago(me.lastSyncAt)}${me.lastError ? ` · Fehler: ${me.lastError}` : ""}` : "kein Account"}</li>
        <li>{dot(det ? det.liveFeed.ok : null)}<b>Live-Feed der API:</b> {det ? `${det.liveFeed.ok ? "erreichbar" : "nicht erreichbar"} · geprüft ${ago(det.liveFeed.checkedAt)}` : "–"}</li>
      </ul>
      {det && det.hints.length > 0 && (
        <div className="mt-3">
          <div className="label mb-1 !text-[10px]">Match-Hinweise (werden im Hintergrund geladen)</div>
          <ul className="space-y-0.5 text-xs text-muted">{det.hints.map((h) => <li key={h.matchId}>#{h.matchId} · {h.source} · {h.done === "ok" ? "geladen" : h.done === "fremd" ? "nicht dein Match" : h.done === "aufgegeben" ? "aufgegeben" : `Versuch ${h.tries}${h.last ? ` – ${h.last}` : ""}`}</li>)}</ul>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-muted">Die API bekommt Match-Daten erst, wenn das Spiel sie lädt: Das passiert nach Spielende und zuverlässig, wenn du im Spiel kurz den Match-Verlauf (Profil → Matches) öffnest. Der Helfer meldet die Daten dann sofort weiter, und das Match erscheint hier innerhalb von Sekunden bis wenigen Minuten. Echte Live-Daten gibt es nur für Matches, die die API im Zuschauer-Feed führt.</p>
    </section>
  );
}

/** Signal-Aufnahme: zeichnet während einer Runde lokal auf, welche Dateien/Prozesse/Verbindungen sich ändern – Grundlage, um die Lobby-Erkennung beim Ladebildschirm zu bauen. */
function Recorder() {
  const [st, setSt] = useState<{ running: boolean; startedAt: number | null; count: number; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!window.desktop?.recorder) return;
    const load = () => window.desktop!.recorder("status").then(setSt).catch(() => null);
    load(); const t = setInterval(load, 2000); return () => clearInterval(t);
  }, []);
  if (!st) return null;
  const act = (a: "start" | "stop" | "reset") => window.desktop!.recorder(a).then(setSt);
  const copy = () => { navigator.clipboard?.writeText(st.text.slice(-24000)); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div><div className="label">Signal-Aufnahme (Entwickler-Hilfe)</div><p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">Zeichnet lokal auf, was beim Spielen auf diesem PC passiert (neue Dateien, Logzeilen, Prozesse, Verbindungen). Starte sie vor dem Match, spiel bis zum Ladebildschirm und etwas darüber hinaus, beende sie und kopiere den Bericht – so finden wir heraus, wo das Spiel die Lobby schon beim Laden verrät. Es wird nichts hochgeladen.</p></div>
        <div className="ml-auto flex gap-2">
          {!st.running ? <button onClick={() => act("start")} className="btn btn-gold text-sm">Aufnahme starten</button> : <button onClick={() => act("stop")} className="btn btn-gold text-sm">Aufnahme beenden</button>}
          {st.count > 0 && <button onClick={copy} className="btn btn-ghost text-sm">{copied ? "Kopiert" : "Bericht kopieren"}</button>}
          {st.count > 0 && !st.running && <button onClick={() => act("reset")} className="btn btn-ghost text-sm">Verwerfen</button>}
        </div>
      </div>
      {st.running && <p className="mt-2 text-xs text-amber">● Aufnahme läuft · {st.count} Ereignisse</p>}
      {st.count > 0 && <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-black/30 p-3 text-[11px] leading-relaxed text-muted">{st.text.split("\n").slice(-60).join("\n")}</pre>}
    </section>
  );
}
