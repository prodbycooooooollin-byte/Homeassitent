"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { INGEST_COLOR } from "./useIngest";
import type { IngestAction, IngestLine, IngestState } from "@/lib/desktop";

const STATE_LABEL: Record<IngestState["state"], string> = { running: "Läuft", downloading: "Lädt", external: "Extern", error: "Fehler", off: "Aus", unsupported: "Nicht verfügbar" };

type Tone = "err" | "warn" | "hit" | "sys" | "out";
const TONE_CLASS: Record<Tone, string> = { err: "text-[#f0616d]", warn: "text-[#f0b44c]", hit: "text-[#3fc7d9]", sys: "text-[#6b7488]", out: "text-[#c9d1e3]" };

/** Farbe nach Inhalt: Fehler rot, Warnung gelb, Match-/Salt-Meldungen cyan/grün, App-Meldungen grau. */
export function toneOf(l: IngestLine): Tone {
  if (/\b(error|fehler|panic|fatal|failed|fehlgeschlagen)\b/i.test(l.text) || (l.src === "stderr" && /\berr/i.test(l.text))) return "err";
  if (/\b(warn|warning|warnung|retry)\b/i.test(l.text)) return "warn";
  if (/\b(salt|match|ingest|submitted)/i.test(l.text) && l.src !== "app") return "hit";
  if (l.src === "app") return "sys";
  return "out";
}

export function fmtUptime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : m ? `${m} min ${String(r).padStart(2, "0")} s` : `${r} s`;
}

const stamp = (t: number) => new Date(t).toLocaleTimeString("de-DE");

export function IngestTerminal({ ing, control }: { ing: IngestState; control: (a: IngestAction) => Promise<unknown> }) {
  const [filter, setFilter] = useState("");
  const [follow, setFollow] = useState(true);
  const [busy, setBusy] = useState<IngestAction | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const lines = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? ing.lines.filter((l) => l.text.toLowerCase().includes(q)) : ing.lines;
  }, [ing.lines, filter]);
  useEffect(() => { if (follow && box.current) box.current.scrollTop = box.current.scrollHeight; }, [lines, follow]);

  const run = async (a: IngestAction) => { setBusy(a); try { await control(a); } finally { setBusy(null); } };
  const copy = async () => {
    const txt = ing.lines.map((l) => `${stamp(l.t)} [${l.src}] ${l.text}`).join("\n");
    try { await navigator.clipboard.writeText(txt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ohne Zwischenablage */ }
  };
  const running = ing.state === "running" && ing.pid !== null;
  const canStart = ing.state === "off" || ing.state === "error";
  const col = INGEST_COLOR[ing.state];
  const unsupported = ing.state === "unsupported";

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d14] shadow-[0_30px_80px_-40px_#000]">
      {/* Fensterleiste */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] bg-white/[0.03] px-4 py-2.5">
        <span className="flex gap-1.5"><i className="h-3 w-3 rounded-full bg-[#f0616d]" /><i className="h-3 w-3 rounded-full bg-[#f0b44c]" /><i className="h-3 w-3 rounded-full bg-[#3ecf8e]" /></span>
        <span className="num mx-auto text-xs text-muted">deadlock-api-ingest</span>
        <span className="w-12" />
      </div>

      {/* Kopfzeile */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-white/[0.06] px-4 py-3">
        <span className="chip !py-0.5 text-xs font-semibold" style={{ color: col, borderColor: `${col}55` }}>
          <i className={`h-2 w-2 rounded-full ${running ? "animate-pulse" : ""}`} style={{ background: col }} />{STATE_LABEL[ing.state]}
        </span>
        <Stat label="PID" value={ing.pid ? String(ing.pid) : "–"} />
        <Stat label="Laufzeit" value={running && ing.since ? fmtUptime(now - ing.since) : "–"} />
        <Stat label="Neustarts" value={String(ing.restarts)} />
        <Stat label="Erkannte Matches" value={String(ing.matches)} tone={ing.matches ? "#3ecf8e" : undefined} />
        <Stat label="Fehler" value={String(ing.errors)} tone={ing.errors ? "#f0616d" : undefined} />
        <span className="min-w-0 flex-1 truncate text-right text-xs text-muted" title={ing.message}>{ing.message}</span>
      </div>

      {/* Steuerung */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5">
        <Btn onClick={() => run("start")} disabled={!canStart || unsupported || busy !== null}>Start</Btn>
        <Btn onClick={() => run("stop")} disabled={ing.state === "off" || unsupported || busy !== null}>Stopp</Btn>
        <Btn onClick={() => run("restart")} disabled={unsupported || busy !== null}>Neustart</Btn>
        <span className="mx-1 h-5 w-px bg-white/10" />
        <Btn onClick={() => run("clear")}>Protokoll leeren</Btn>
        <Btn onClick={copy}><Icon name="copy" size={13} />{copied ? "Kopiert" : "Kopieren"}</Btn>
        <Btn onClick={() => run("openFolder")}>Ordner öffnen</Btn>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative"><Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtern …" className="num w-44 rounded-lg border border-white/10 bg-white/[0.04] py-1.5 pl-8 pr-2 text-xs outline-none focus:border-white/30" /></div>
          <button type="button" role="switch" aria-checked={follow} onClick={() => setFollow((f) => !f)} className={`chip text-xs ${follow ? "!border-[#3ecf8e]/50 text-[#3ecf8e]" : "text-muted"}`}>
            <Icon name="arrowRight" size={12} className="rotate-90" />{follow ? "Am Ende festgehalten" : "Scrollen frei"}
          </button>
        </div>
      </div>

      {/* Protokoll */}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24; if (!atEnd && follow) setFollow(false); }}
        className="num h-[460px] overflow-auto px-4 py-3 text-[12px] leading-[1.65]">
        {lines.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted">
            <Icon name="window" size={26} />
            <p className="max-w-sm text-sm">{ing.lines.length === 0 ? "Noch keine Ausgabe – der Helfer meldet sich, sobald Matches im Steam-Cache erkannt werden." : "Keine Zeile passt zum Filter."}</p>
          </div>
        ) : lines.map((l, i) => (
          <div key={`${l.t}-${i}`} className="flex gap-3 whitespace-pre-wrap break-all hover:bg-white/[0.03]">
            <span className="w-[62px] shrink-0 select-none text-[#4b5365]">{stamp(l.t)}</span>
            <span className={`w-[18px] shrink-0 select-none ${l.src === "stderr" ? "text-[#f0616d]" : "text-[#4b5365]"}`}>{l.src === "app" ? "#" : l.src === "stderr" ? "!" : ">"}</span>
            <span className={TONE_CLASS[toneOf(l)]}>{l.text}</span>
          </div>
        ))}
        {lines.length > 0 && (
          <div className="flex gap-3"><span className="w-[62px]" /><span className="w-[18px] text-[#3ecf8e]">$</span><span className="inline-block h-[14px] w-[7px] translate-y-[2px] animate-pulse bg-[#3ecf8e]" aria-hidden /></div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="leading-tight"><div className="label !text-[9px]">{label}</div><div className="num text-sm font-bold" style={tone ? { color: tone } : undefined}>{value}</div></div>;
}
function Btn({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...p} className="btn btn-ghost flex items-center gap-1.5 !px-3 !py-1.5 text-xs disabled:opacity-40">{children}</button>;
}
