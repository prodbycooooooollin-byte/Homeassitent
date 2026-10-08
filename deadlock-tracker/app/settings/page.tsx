"use client";
import { useEffect, useState } from "react";
import { PageTitle } from "@/components/ui";
import { Avatar } from "@/components/GameAssets";
import { Icon, type IconName } from "@/components/Icon";
import { NavLink } from "@/components/NavLink";
import { useSettings, useTracker } from "@/components/Providers";
import { useUpdater } from "@/components/useUpdater";
import type { DesktopSettings } from "@/lib/desktop";

export default function SettingsPage() {
  const { settings, update, steam, disconnectSteam } = useSettings();
  const { status, removePlayer, setAccount, setPrimary, primary, account } = useTracker();
  const up = useUpdater();
  const [desk, setDesk] = useState<DesktopSettings | null>(null);
  const [steamMsg, setSteamMsg] = useState<string | null>(null);
  useEffect(() => { window.desktop?.getDesktopSettings().then(setDesk).catch(() => {}); }, []);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("steam") === "error") setSteamMsg(q.get("reason") ?? "Anmeldung fehlgeschlagen");
  }, []);
  const setD = async (patch: Partial<DesktopSettings>) => { if (window.desktop) setDesk(await window.desktop.setDesktopSettings(patch)); };
  const cov = status?.coverage;
  const pct = cov && cov.total ? Math.round((cov.withDetails / cov.total) * 100) : 100;
  const linked = steam ? status?.players.find((p) => p.accountId === steam.accountId) : null;

  return (
    <>
      <PageTitle title="Einstellungen" sub="Steam-Verbindung, Tracking, Darstellung und Desktop-Verhalten" />

      <Card icon="steam" title="Steam-Konto">
        {steam ? (
          <div className="flex flex-wrap items-center gap-4">
            <Avatar src={linked?.avatar} name={linked?.name ?? "Steam"} size={64} ring="#3ecf8e" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="display text-xl font-bold">{linked?.name ?? `Account ${steam.accountId}`}</span><span className="chip !py-0 text-[11px] text-win"><Icon name="badge" size={12} />verifiziert</span></div>
              <div className="num text-xs text-muted">Steam-ID {steam.steamId} · verbunden am {new Date(steam.verifiedAt).toLocaleDateString("de-DE")}</div>
            </div>
            <button onClick={() => { setPrimary(steam.accountId); }} className="btn btn-ghost text-sm">Als meinen Account festlegen</button>
            <button onClick={disconnectSteam} className="btn btn-ghost text-sm text-loss">Trennen</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <p className="min-w-[260px] flex-1 text-sm text-muted">Melde dich über die offizielle Steam-Anmeldung an. Der Tracker erhält ausschließlich deine öffentliche Steam-ID (kein Passwort, keine Daten aus deinem Konto) und richtet dein Profil mit Name, Profilbild und Match-Historie automatisch ein.</p>
            <a href="/api/steam/login" className="btn btn-gold !px-5 !py-2.5"><Icon name="steam" size={18} />Mit Steam anmelden</a>
          </div>
        )}
        {steamMsg && <p className="mt-3 text-sm text-loss">Steam-Anmeldung fehlgeschlagen: {steamMsg}</p>}
        <div className="mt-5 border-t border-white/[0.07] pt-4">
          <div className="label mb-2">Getrackte Accounts</div>
          <div className="space-y-1.5">{status?.players.map((p) => (
            <div key={p.accountId} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
              <Avatar src={p.avatar} name={p.name} size={34} ring="#ffffff22" />
              <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{p.name}{p.accountId === primary && <span className="chip ml-2 !py-0 text-[10px] text-amber">Ich</span>}{p.accountId === account && p.accountId !== primary && <span className="chip ml-2 !py-0 text-[10px]">angezeigt</span>}</div><div className="text-[11px] text-muted">ID {p.accountId}</div></div>
              {p.accountId !== primary && <button onClick={() => setPrimary(p.accountId)} className="btn btn-ghost !px-2.5 !py-1 text-xs">Als Ich</button>}
              {p.accountId !== account && <button onClick={() => setAccount(p.accountId)} className="btn btn-ghost !px-2.5 !py-1 text-xs">Ansehen</button>}
              <button onClick={() => confirm(`${p.name} nicht mehr tracken?`) && removePlayer(p.accountId)} className="btn btn-ghost !px-2.5 !py-1 text-xs text-loss">Entfernen</button>
            </div>))}</div>
        </div>
      </Card>

      <Card icon="refresh" title="Tracking">
        <Row title="Abfrage-Takt" desc="Wie oft die Match-Historie geprüft wird. Kurz nach Spielende prüft der Tracker automatisch im 5-Sekunden-Takt.">
          <div className="flex w-56 items-center gap-3"><input type="range" min={10} max={120} step={5} value={settings.pollIntervalS} onChange={(e) => update({ pollIntervalS: Number(e.target.value) })} className="flex-1 accent-amber-400" /><span className="display num w-12 text-right font-bold">{settings.pollIntervalS}s</span></div>
        </Row>
        <Row title="Historie im Hintergrund vervollständigen" desc="Lädt Details (beide Teams, Ränge, Lane, Items) auch für ältere Matches nach – nötig für genaue Mitspieler-Listen, Analysen und alle Match-Tabs.">
          <div className="flex items-center gap-4">{cov && <div className="w-40"><div className="num mb-1 text-right text-xs text-muted">{cov.withDetails} / {cov.total} ({pct}%)</div><div className="h-1.5 rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-amber to-[#fff1c9] transition-all duration-700" style={{ width: `${pct}%` }} /></div></div>}<Switch on={settings.backfill} onChange={(v) => update({ backfill: v })} /></div>
        </Row>
        <Row title="Live-Match anzeigen" desc="Zeigt auf der Übersicht ein Banner, solange du in einem Match bist."><Switch on={settings.showLive} onChange={(v) => update({ showLive: v })} /></Row>
        <Row title="Benachrichtigung bei neuem Match" desc="Meldet dir, sobald ein Match erkannt wurde."><Switch on={settings.notifyNewMatch} onChange={(v) => update({ notifyNewMatch: v })} /></Row>
      </Card>

      <Card icon="sliders" title="Darstellung">
        <Row title="Effekte" desc="Aurora-Hintergrund, Übergänge und Animationen. „Reduziert“ lässt die Bewegung im Hintergrund weg, „Aus“ deaktiviert alle Animationen.">
          <Seg value={settings.effects} onChange={(v) => update({ effects: v })} options={[["full", "Voll"], ["reduced", "Reduziert"], ["off", "Aus"]]} />
        </Row>
        <Row title="Dichte" desc="Kompakter = weniger Abstände, mehr Inhalt pro Bildschirm."><Seg value={settings.density} onChange={(v) => update({ density: v })} options={[["comfortable", "Komfortabel"], ["compact", "Kompakt"]]} /></Row>
      </Card>

      {desk && (
        <Card icon="window" title="Desktop-App">
          <Row title="Im Hintergrund weiterlaufen" desc="Beim Schließen des Fensters bleibt der Tracker im Infobereich der Taskleiste aktiv und erkennt weiter neue Matches."><Switch on={desk.closeToTray} onChange={(v) => setD({ closeToTray: v })} /></Row>
          <Row title="Mit Windows starten" desc="Startet den Tracker automatisch bei der Anmeldung."><Switch on={desk.autoStart} onChange={(v) => setD({ autoStart: v })} /></Row>
          <Row title="Beim Autostart minimiert starten" desc="Nur im Infobereich starten, ohne das Fenster zu öffnen."><Switch on={desk.startMinimized} onChange={(v) => setD({ startMinimized: v })} disabled={!desk.autoStart} /></Row>
          <Row title="Windows-Benachrichtigungen" desc="Zeigt neue Matches als Systembenachrichtigung."><Switch on={desk.desktopNotifications} onChange={(v) => setD({ desktopNotifications: v })} /></Row>
          {up && (
            <Row title={`Version ${up.current}`} desc={up.status === "unsupported" ? up.message : up.status === "ready" ? `Update ${up.version} ist bereit.` : up.status === "downloading" ? `Update ${up.version} wird geladen (${up.percent}%).` : up.status === "error" ? `Update-Prüfung fehlgeschlagen: ${up.message}` : up.status === "checking" ? "Suche nach Updates …" : "Die App prüft automatisch auf Updates."}>
              {up.status === "ready" ? <button onClick={() => window.desktop?.installUpdate()} className="btn btn-gold text-sm">Neu starten & installieren</button> : up.status !== "unsupported" && <button onClick={() => window.desktop?.checkForUpdates()} className="btn btn-ghost text-sm">Nach Updates suchen</button>}
            </Row>
          )}
        </Card>
      )}

      <Card icon="info" title="Hilfe">
        <Row title="Verbindung prüfen" desc="Testet alle Schnittstellen und zeigt Fehler und Rate-Limits."><NavLink href="/status" className="btn btn-ghost text-sm">Diagnose öffnen</NavLink></Row>
      </Card>
    </>
  );
}

function Card({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return <section className="surface p-5"><h2 className="display mb-3 flex items-center gap-2 text-lg font-bold"><Icon name={icon} size={18} className="text-amber" />{title}</h2><div className="divide-y divide-white/[0.06]">{children}</div></section>;
}
function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 py-3.5 first:pt-0 last:pb-0"><div className="min-w-[260px] flex-1"><div className="font-semibold">{title}</div><div className="mt-0.5 text-xs leading-snug text-muted">{desc}</div></div>{children}</div>;
}
function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} className={`relative h-6 w-11 shrink-0 rounded-full border transition ${disabled ? "opacity-40" : ""} ${on ? "border-amber/60 bg-amber/30" : "border-white/15 bg-white/[0.06]"}`}>
      <span className="absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all" style={{ width: 18, height: 18, left: on ? 22 : 3, background: on ? "linear-gradient(180deg,#fff1c9,#f0b44c)" : "#8b94a8", boxShadow: on ? "0 0 10px #f0b44c" : undefined }} />
    </button>
  );
}
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">{options.map(([k, l]) => <button key={k} onClick={() => onChange(k)} className={`tab !py-1 ${value === k ? "tab-active" : ""}`}>{l}</button>)}</div>;
}
