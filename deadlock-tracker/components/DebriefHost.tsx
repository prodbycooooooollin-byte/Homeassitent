"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeroPortrait, RankEmblem, useHero, useHeroName, useImg } from "./GameAssets";
import { GradeBadge, GRADE_STYLE } from "./GradeBadge";
import { Icon } from "./Icon";
import { NavLink } from "./NavLink";
import { useSettings } from "./Providers";
import { buildDebrief, type DebriefRow } from "@/lib/debrief";
import { buildSample, type SampleKind } from "@/lib/debrief-sample";
import { teamAdvantage, turningPoint } from "@/lib/insights";
import { subOf } from "@/lib/grade";
import { fmtDuration } from "@/lib/format";
import { formatBadge } from "@/lib/ranks";
import type { Grade, MatchDetails, Rating } from "@/lib/types";

export interface DebriefRequest { matchId: number; account: number; test?: boolean; /** Beispiel-Match statt echter Daten */ sample?: SampleKind; n?: number }
export const DEBRIEF_BACK_KEY = "dl.debriefBack";
export const DEBRIEF_EVENT = "dl-debrief";
/** Öffnet den Debrief (aus beliebiger Stelle der App). */
export const openDebrief = (r: DebriefRequest) => window.dispatchEvent(new CustomEvent<DebriefRequest>(DEBRIEF_EVENT, { detail: r }));

interface Res { details: MatchDetails | null; ratings: Record<number, Rating | null>; lobbyBadge: number | null }

const PLACE = ["#f0b44c", "#c4ccda", "#cd7f32"];
const GRADES: Grade[] = ["F", "D", "C", "B", "A", "S"];

/** Vollbild-Debrief nach einem Match: Ergebnis, Note mit Skala, Platzierungen, stärkste/schwächste Seite und eine kurze Analyse. */
export function DebriefHost() {
  const [req, setReq] = useState<DebriefRequest | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReq({ ...(e as CustomEvent<DebriefRequest>).detail, n: Date.now() });
    window.addEventListener(DEBRIEF_EVENT, on);
    // Direktaufruf zum Testen: ?debrief=<Match-ID>&account=<ID>
    const q = new URLSearchParams(window.location.search);
    if (q.get("debrief") && q.get("account")) setReq({ matchId: Number(q.get("debrief")), account: Number(q.get("account")), test: true, n: 1 });
    return () => window.removeEventListener(DEBRIEF_EVENT, on);
  }, []);
  const close = useCallback(() => setReq(null), []);
  useEffect(() => {
    if (!req) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === "Enter") close(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [req, close]);
  if (!req) return null;
  return <Overlay key={req.matchId + (req.test ? "t" : "") + (req.sample ?? "") + (req.n ?? 0)} req={req} onClose={() => { try { sessionStorage.removeItem(DEBRIEF_BACK_KEY); } catch { /* egal */ } close(); }} onLeave={close} />;
}

/** Merkt sich den Debrief, damit man aus dem Match per „Zurück zum Debrief“ wieder hierher kommt, und schließt das Overlay. */
function keepBack(req: DebriefRequest, close: () => void) {
  try { sessionStorage.setItem(DEBRIEF_BACK_KEY, JSON.stringify({ matchId: req.matchId, account: req.account, test: req.test })); } catch { /* egal */ }
  window.dispatchEvent(new Event("dl-debrief-keep"));
  close();
}

/** Zahl, die beim Einblenden hochzählt (ohne Animationen sofort der Endwert). */
function useCountUp(target: number, delayMs = 0, ms = 1100): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("fx-off");
    if (reduced) { setV(target); return; }
    let raf = 0, t0 = 0;
    const tick = (t: number) => { if (!t0) t0 = t; const f = Math.min(1, (t - t0) / ms); setV(target * (1 - Math.pow(1 - f, 3))); if (f < 1) raf = requestAnimationFrame(tick); };
    const id = setTimeout(() => { raf = requestAnimationFrame(tick); }, delayMs);
    // Sicherheitsnetz: Läuft requestAnimationFrame nicht (Fenster im Hintergrund), steht der Endwert trotzdem da.
    const end = setTimeout(() => setV(target), delayMs + ms + 400);
    return () => { clearTimeout(id); clearTimeout(end); cancelAnimationFrame(raf); };
  }, [target, delayMs, ms]);
  return v;
}

const STAGE_W = 1360, STAGE_H = 770, CONTENT_W = 860;
/** Feste Bühne, die so skaliert wird, dass der Debrief ohne Scrollen genau in das Fenster passt (oben Titelleiste, unten Aktionsleiste). */
function useStage() {
  const calc = () => {
    const top = document.documentElement.classList.contains("desktop") ? 60 : 16, bottom = 84;
    const h = Math.max(200, window.innerHeight - top - bottom), w = Math.max(300, window.innerWidth - 32);
    return { k: Math.max(0.45, Math.min(1.6, w / STAGE_W, h / STAGE_H)), top, h };
  };
  const [st, setSt] = useState(calc);
  useEffect(() => { const on = () => setSt(calc()); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return st;
}

const SPARKS = Array.from({ length: 22 }, (_, i) => { const r = (k: number) => { const x = Math.sin(i * 91.7 + k * 17.3) * 9301.5; return x - Math.floor(x); }; return { x: r(1) * 100, s: 2 + r(2) * 3, d: 5 + r(3) * 7, l: -r(4) * 10 }; });

function Overlay({ req, onClose, onLeave }: { req: DebriefRequest; onClose: () => void; onLeave: () => void }) {
  const [res, setRes] = useState<Res | null>(null);
  const [tries, setTries] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    if (req.sample) { setRes({ ...buildSample(req.sample, req.account), lobbyBadge: null }); return () => { alive = false; }; }
    const load = async () => {
      try {
        const r = await (await fetch(`/api/matches/${req.matchId}?account=${req.account}`)).json();
        if (!alive) return;
        setRes(r);
        if (!r.details && tries < 60) setTimeout(() => alive && setTries((t) => t + 1), 6000);
      } catch { if (alive && tries < 60) setTimeout(() => alive && setTries((t) => t + 1), 6000); }
    };
    load();
    return () => { alive = false; };
  }, [req.matchId, req.account, tries]);

  const d = res?.details ?? null;
  const me = d?.players.find((p) => p.accountId === req.account) ?? null;
  const rating = res?.ratings?.[req.account] ?? null;
  const db = useMemo(() => (d && me ? buildDebrief(d, me, rating) : null), [d, me, rating]);
  const won = !!(d && me && d.winningTeam === me.team);
  const draw = !!d && d.winningTeam === null;
  const accent = draw ? "#8b94a8" : won ? "#3ecf8e" : "#f0616d";
  const heroName = useHeroName();
  const { hero, color } = useHero(me?.heroId);
  const art = useImg(hero?.art ?? hero?.portrait);
  const fig = useImg(hero?.figure);
  const stage = useStage();
  const noFx = useSettings().settings.effects === "off";
  const score = useCountUp(rating?.score ?? 0, 1100, 1300);
  const grade = rating?.grade ?? null;
  const celebrate = !!rating && (grade === "S" || grade === "A") && won;

  // Parallax: Held-Bild und Licht folgen der Maus
  const onMove = (e: React.MouseEvent) => {
    const el = root.current; if (!el) return;
    el.style.setProperty("--px", String((e.clientX / window.innerWidth - 0.5) * 2));
    el.style.setProperty("--py", String((e.clientY / window.innerHeight - 0.5) * 2));
  };

  return (
    <div ref={root} onMouseMove={onMove} className="debrief fixed inset-0 z-[120] overflow-hidden bg-[#05060a]" role="dialog" aria-modal="true" aria-label="Match-Debrief" style={{ ["--hc" as string]: color, ["--ac" as string]: accent }}>
      {/* Eröffnung: Lichtblitz in der Ergebnisfarbe */}
      <div className="debrief-flash pointer-events-none fixed inset-0" />
      {/* Hintergrund: Heldenfarbe, Raster, Funken */}
      <div className="debrief-bg pointer-events-none fixed inset-0" />
      <div className="debrief-grid pointer-events-none fixed inset-0" />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">{SPARKS.map((p, i) => <span key={i} className="debrief-spark" style={{ left: `${p.x}%`, width: p.s, height: p.s, animationDuration: `${p.d}s`, animationDelay: `${p.l}s` }} />)}</div>
      {celebrate && <div className="debrief-burst pointer-events-none fixed inset-0" />}

      {/* Held rechts: Illustration über die ganze rechte Seite, ohne Rahmen, weich in den Hintergrund verlaufend */}
      <div className="debrief-hero pointer-events-none fixed inset-y-0 right-0 hidden w-[62%] lg:block">
        <div className="absolute inset-0" style={{ background: `radial-gradient(70% 75% at 70% 45%, ${color}77, ${color}22 55%, transparent 80%)` }} />
        <div className="debrief-hero-img absolute -inset-[6%]">
          {art.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art.src} onError={art.onError} alt="" className="debrief-art-img absolute inset-0 h-full w-full object-cover" style={{ objectPosition: hero?.art ? "center" : "50% 20%" }} />
          ) : me ? (
            <div className="absolute inset-0 flex items-center justify-end pr-[8%]"><span className="display select-none text-[min(52vh,520px)] font-extrabold leading-none" style={{ color: `${color}40` }}>{heroName(me.heroId).slice(0, 1)}</span></div>
          ) : null}
        </div>
      </div>

      {/* Held als Figur: freigestellt, rechts unten, folgt der Maus */}
      {fig.src && (
        <div className="debrief-figure pointer-events-none fixed bottom-0 right-[2%] top-[4%] hidden w-[38%] lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fig.src} onError={fig.onError} alt="" className="debrief-figure-img absolute inset-0 h-full w-full object-contain object-bottom" style={{ filter: `drop-shadow(0 0 40px ${color}88) drop-shadow(0 12px 30px #000c)` }} />
        </div>
      )}

      <div className="absolute left-1/2 z-10" style={{ top: stage.top + stage.h / 2, width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${stage.k})` }}>
        <div className="flex h-full flex-col" style={{ width: CONTENT_W }}>
          <div className="flex h-[78px] shrink-0 items-start justify-between gap-6">
            <div className="min-w-0">
              <h1 className="debrief-title display text-5xl font-extrabold uppercase leading-none" style={{ color: accent }}>
                {(!d ? "Auswertung" : draw ? "Unentschieden" : won ? "Sieg" : "Niederlage").split("").map((ch, i) => <span key={i} className="debrief-letter" style={{ animationDelay: `${0.15 + i * 0.06}s` }}>{ch}</span>)}
              </h1>
              <div className="debrief-line mt-2 h-[3px] w-48 rounded-full" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
              {d && me && <div className="debrief-fade mt-2 flex flex-wrap items-center gap-x-3 text-xs uppercase tracking-widest text-muted" style={{ ["--d" as string]: "0.6s" }}><b className="text-white">{heroName(me.heroId)}</b><span>/ {fmtDuration(d.durationS)}</span>{d.matchMode && <span>/ {d.matchMode}</span>}{req.test && <span className="rounded bg-amber/20 px-2 py-0.5 text-[10px] font-bold text-amber">{req.sample ? "Beispiel" : "Testansicht"}</span>}{noFx && <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] normal-case tracking-normal">Effekte aus</span>}</div>}
            </div>
            {d && me?.badge && <div className="debrief-fade flex shrink-0 items-center gap-3 rounded-full border border-white/10 bg-black/40 py-1.5 pl-2 pr-5 backdrop-blur" style={{ ["--d" as string]: "0.9s" }}><RankEmblem badge={me.badge} size={34} /><span className="text-xs text-muted">Rang im Match<br /><b className="text-sm text-white">{formatBadge(me.badge)}</b>{res?.lobbyBadge ? <span> · Lobby-Ø <b className="text-white">{formatBadge(res.lobbyBadge)}</b></span> : null}</span></div>}
          </div>

          {d && !me ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div className="display text-xl font-bold">Dich in diesem Match nicht gefunden</div>
              <p className="max-w-md text-sm text-muted">Die Match-Details enthalten keinen Spieler mit deiner Account-ID und keinen eindeutig passenden Eintrag (Held, Team, K/D/A). Öffne das Match, um alle Spieler zu sehen.</p>
            </div>
          ) : !d || !me || !db ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <div className="h-12 w-12 animate-spin rounded-full border-2 border-white/10 border-t-amber" />
              <div className="display text-xl font-bold">Match-Daten werden vorbereitet …</div>
              <p className="max-w-md text-sm text-muted">Valve und die Deadlock-API liefern die Details meist wenige Minuten nach dem Ende. Dieses Fenster aktualisiert sich selbst.</p>
            </div>
          ) : (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3.5">
              <div className="grid h-[318px] shrink-0 grid-cols-[400px_minmax(0,1fr)] gap-6">
                <div className="relative min-w-0">
                  <div className="debrief-fade mb-1.5 grid grid-cols-[1fr_52px_52px] px-1 text-[10px] font-semibold uppercase tracking-widest text-muted" style={{ ["--d" as string]: "0.7s" }}><span>Tippe eine Zeile an</span><span className="text-center">Team</span><span className="text-center">Lobby</span></div>
                  <div className="space-y-1">{db.rows.map((r, i) => <Row key={r.label} r={r} i={i} d={d} me={me} accent={accent} />)}</div>
                </div>
                <div className="flex min-w-0 flex-col items-center justify-center">
                  <Gauge rating={rating} score={score} />
                  <p className="debrief-fade mt-1 max-w-[400px] text-center text-[14px] leading-snug text-white/90" style={{ ["--d" as string]: "2.2s" }}>{db.verdict}</p>
                </div>
              </div>
              <div className="grid h-[132px] shrink-0 grid-cols-3 gap-3">
                <Side title="Stärkste Seite" tone="#3ecf8e" icon="trendUp" item={db.best} delay={2.4} />
                <Side title="Schwächste Seite" tone="#f0616d" icon="trendDown" item={db.worst} delay={2.6} />
                <div className="debrief-fade debrief-card min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-3 backdrop-blur" style={{ ["--d" as string]: "2.8s" }}>
                  <div className="label mb-1 flex items-center gap-1.5"><Icon name="eye" size={13} />Analyse</div>
                  <ul className="space-y-0.5 text-[11.5px] leading-snug">
                    {db.good.slice(0, 1).map((t, i) => <li key={"g" + i} className="debrief-item flex gap-1.5" style={{ ["--d" as string]: `${3 + i * 0.15}s` }}><Icon name="check" size={12} className="mt-0.5 shrink-0 text-[#3ecf8e]" /><span className="line-clamp-2">{t}</span></li>)}
                    {db.bad.slice(0, 2).map((t, i) => <li key={"b" + i} className="debrief-item flex gap-1.5" style={{ ["--d" as string]: `${3.4 + i * 0.15}s` }}><Icon name="x" size={12} className="mt-0.5 shrink-0 text-[#f0616d]" /><span className="line-clamp-2">{t}</span></li>)}
                    {!db.good.length && !db.bad.length && <li className="text-muted">Keine auffälligen Stärken oder Schwächen.</li>}
                  </ul>
                </div>
              </div>
              <div className="min-h-0 flex-1"><MatchPulse d={d} me={me} accent={accent} /></div>
            </div>
          )}
        </div>
      </div>

      {/* Aktionsleiste unten: immer erreichbar, unabhängig von Fenstergröße und Titelleiste */}
      <div className="debrief-actions fixed inset-x-0 bottom-5 z-20 flex justify-center px-4">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-[#0b0e15]/90 p-1.5 shadow-2xl backdrop-blur">
          {d && me && !req.sample && <NavLink href={`/match/${req.matchId}?account=${req.account}`} onClick={() => keepBack(req, onLeave)} className="btn btn-gold !rounded-full px-5">Zum Match</NavLink>}
          {d && me && !req.sample && <NavLink href={`/match/${req.matchId}?account=${req.account}&tab=stats`} onClick={() => keepBack(req, onLeave)} className="btn btn-ghost !rounded-full px-4">Alle Statistiken</NavLink>}
          <button onClick={onClose} className="btn btn-ghost !rounded-full px-5" autoFocus>Schließen <span className="ml-1 text-[10px] text-muted">Esc</span></button>
        </div>
      </div>
    </div>
  );
}

/** Statistikzeile: Zahl zählt hoch, Platzierungs-Chips poppen auf; ein Klick zeigt, wo du im Feld aller 12 Spieler liegst. */
function Row({ r, i, d, me, accent }: { r: DebriefRow; i: number; d: MatchDetails; me: MatchDetails["players"][number]; accent: string }) {
  const [open, setOpen] = useState(false);
  const num = parseFloat(String(r.value).replace(/k$/i, "")) * (/k$/i.test(r.value) ? 1000 : 1);
  const shown = useCountUp(Number.isFinite(num) ? num : 0, 600 + i * 120, 900);
  const text = /k$/i.test(r.value) ? `${(shown / 1000).toFixed(num >= 10000 ? 0 : 1)}k` : String(Math.round(shown));
  const getter = DEFS[r.label];
  const vals = getter ? d.players.map((p) => ({ p, v: getter(p) })) : [];
  const lo = Math.min(...vals.map((x) => x.v)), hi = Math.max(...vals.map((x) => x.v));
  const pos = (v: number) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const chip = (place: number, of: number, k: number) => (
    <span className="debrief-pop mx-auto flex h-6 w-10 items-center justify-center rounded-md text-[11px] font-extrabold" style={{ background: place <= 3 ? PLACE[place - 1] : "rgba(255,255,255,.1)", color: place <= 3 ? "#1a1204" : "#c7cdd9", animationDelay: `${0.9 + i * 0.12 + k * 0.08}s`, boxShadow: place === 1 ? "0 0 14px #f0b44c88" : undefined }} title={`Platz ${place} von ${of}`}>{place}.</span>
  );
  return (
    <button type="button" onClick={() => setOpen((o) => !o)} className="debrief-row group block w-full rounded-lg border-b border-white/[0.06] px-1 py-1 text-left transition hover:bg-white/[0.05]" style={{ ["--d" as string]: `${0.6 + i * 0.12}s` }}>
      <div className="grid grid-cols-[1fr_52px_52px] items-center">
        <div className="flex items-baseline justify-between pr-5"><span className="text-xs font-semibold uppercase tracking-widest text-muted transition group-hover:text-white">{r.label}</span><span className="display num text-xl font-extrabold">{text}</span></div>
        {chip(r.team, r.teamSize, 0)}{chip(r.lobby, r.lobbySize, 1)}
      </div>
      <div className="grid transition-[grid-template-rows] duration-300" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="overflow-hidden">
          <div className="relative mx-2 mb-1 mt-3 h-8">
            <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded bg-white/10" />
            {vals.map(({ p, v }, k) => (
              <span key={k} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full" title={`${p.accountId === me.accountId ? "Du" : p.name ?? "Spieler"}: ${v >= 1000 ? (v / 1000).toFixed(1) + "k" : Math.round(v)}`}
                style={{ left: `${pos(v)}%`, width: p === me ? 16 : 9, height: p === me ? 16 : 9, background: p === me ? accent : p.team === me.team ? "#f0b44c" : "#4aa3ff", opacity: p === me ? 1 : 0.7, boxShadow: p === me ? `0 0 14px ${accent}` : undefined, zIndex: p === me ? 2 : 1 }} />
            ))}
          </div>
          <div className="mb-1 flex justify-between px-2 text-[10px] text-muted"><span>niedrigster Wert</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#f0b44c]" />Team <i className="ml-2 mr-1 inline-block h-2 w-2 rounded-full bg-[#4aa3ff]" />Gegner</span><span>höchster Wert</span></div>
        </div>
      </div>
    </button>
  );
}

const DEFS: Record<string, (p: MatchDetails["players"][number]) => number> = {
  Souls: (p) => p.netWorth, Kills: (p) => p.kills, Tode: (p) => p.deaths, Assists: (p) => p.assists,
  Heldenschaden: (p) => p.heroDamage, "Objective-Schaden": (p) => p.objectiveDamage, Heilung: (p) => p.healing,
};

function Side({ title, tone, icon, item, delay }: { title: string; tone: string; icon: "trendUp" | "trendDown"; item: { label: string; score: number; detail: string } | null; delay: number }) {
  return (
    <div className="debrief-fade debrief-card min-h-0 overflow-hidden rounded-2xl border p-3 backdrop-blur" style={{ borderColor: `${tone}55`, background: `linear-gradient(160deg, ${tone}14, rgba(0,0,0,.45))`, ["--d" as string]: `${delay}s` }}>
      <div className="label mb-1.5 flex items-center gap-1.5" style={{ color: tone }}><Icon name={icon} size={13} />{title}</div>
      {item ? <><div className="display truncate text-lg font-extrabold leading-tight">{item.label}</div><div className="num text-xs font-bold" style={{ color: tone }}>Score {item.score.toFixed(2)}</div><p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{item.detail}</p></> : <p className="text-sm text-muted">Nicht bewertbar.</p>}
    </div>
  );
}

/** Notenring wie im Spiel: Segmente F bis S, gefüllt bis zur erreichten Note, große Note in der Mitte (Score zählt hoch, Stoßwelle beim Einschlag). */
function Gauge({ rating, score }: { rating: Rating | null; score: number }) {
  const R = 118, C = 2 * Math.PI * R;
  const final = rating?.score ?? 0;
  const f = Math.max(0, Math.min(1, (final - 0.4) / 1.2));
  const grade = rating?.grade ?? null;
  const seg = C / GRADES.length;
  const col = grade ? GRADE_STYLE[grade].glow.replace(/,[^,]*\)$/, ",1)") : "#8b94a8";
  return (
    <div className="relative h-[236px] w-[236px]"><div className="absolute left-0 top-0 h-[300px] w-[300px] origin-top-left scale-[.787]">
      <div className="debrief-shock absolute inset-6 rounded-full" style={{ borderColor: col }} />
      <svg viewBox="0 0 300 300" className="absolute inset-0 -rotate-90">
        {GRADES.map((g, i) => <circle key={g} cx="150" cy="150" r={R} fill="none" stroke={GRADE_STYLE[g].glow.replace(/,[^,]*\)$/, ",.22)")} strokeWidth="14" strokeDasharray={`${seg - 6} ${C - seg + 6}`} strokeDashoffset={-i * seg} />)}
        <circle cx="150" cy="150" r={R} fill="none" stroke={col} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} className="debrief-ring" style={{ ["--c" as string]: C, ["--o" as string]: C * (1 - f), filter: `drop-shadow(0 0 8px ${col})` }} />
      </svg>
      {GRADES.map((g, i) => { const a = ((i + 0.5) / GRADES.length) * 2 * Math.PI - Math.PI / 2; return <span key={g} className="absolute text-xs font-bold text-muted" style={{ left: 150 + Math.cos(a) * 146 - 6, top: 150 + Math.sin(a) * 146 - 8 }}>{g}</span>; })}
      <div className="debrief-grade absolute inset-0 flex flex-col items-center justify-center">
        {grade ? <GradeBadge grade={grade} size="xl" sub={subOf(rating?.label)} /> : <div className="display text-6xl font-extrabold text-muted">–</div>}
        <div className="display num mt-3 text-3xl font-extrabold">{rating ? score.toFixed(2) : "0.0"}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted">Match-Note</div>
      </div>
    </div></div>
  );
}

/** Match-Puls: Souls-Vorsprung deines Teams über die Zeit; Tode, Kills und Gebäude liegen in eigenen Spuren darunter, der Wendepunkt ist hinterlegt. */
function MatchPulse({ d, me, accent }: { d: MatchDetails; me: MatchDetails["players"][number]; accent: string }) {
  const adv = useMemo(() => teamAdvantage(d).map((x) => ({ t: x.t, v: me.team === 0 ? x.diff : -x.diff })), [d, me.team]);
  const tp = useMemo(() => turningPoint(d, me), [d, me]);
  const [hover, setHover] = useState<number | null>(null);
  if (adv.length < 4) return null;
  const W = 840, CH = 70, LANE = 13, P = { l: 52, r: 12, t: 8 };
  const H = P.t + CH + 10 + LANE * 3 + 18;
  const end = adv[adv.length - 1].t || 1;
  const lim = Math.max(1500, ...adv.map((a) => Math.abs(a.v)));
  const nice = Math.ceil(lim / 1000) * 1000;
  const x = (t: number) => P.l + (t / end) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v + nice) / (2 * nice)) * CH;
  const zero = y(0);
  const pts = adv.map((a) => [x(a.t), y(a.v)] as const);
  // weiche Kurve (Catmull-Rom → Bézier)
  const path = pts.map((p, i) => {
    if (i === 0) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const p0 = pts[i - 2] ?? pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] ?? p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6], c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }).join("");
  const area = `${path}L${pts[pts.length - 1][0].toFixed(1)},${zero}L${pts[0][0].toFixed(1)},${zero}Z`;
  const kills: number[] = [];
  if (me.timeline) for (let i = 1; i < me.timeline.t.length; i++) { const n = me.timeline.k[i] - me.timeline.k[i - 1]; for (let j = 0; j < n; j++) kills.push((me.timeline.t[i] + me.timeline.t[i - 1]) / 2); }
  const deaths = (me.deathLog ?? []).map((q) => q.t);
  const objs = (d.objectives ?? []).map((o) => ({ t: o.t, mine: o.team !== me.team }));
  const mm = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  const k = (v: number) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) / 1000).toFixed(1)}k`;
  const hv = hover !== null ? adv[hover] : null;
  const near = (list: number[], t: number) => list.filter((q) => Math.abs(q - t) <= 45).length;
  const id = `pulse${me.accountId}`;
  const laneY = (i: number) => P.t + CH + 12 + i * LANE;
  const ticks = Array.from({ length: Math.floor(end / 300) + 1 }, (_, i) => i * 300);
  return (
    <div className="debrief-fade debrief-card h-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 backdrop-blur" style={{ ["--d" as string]: "3.2s" }}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <div className="label flex items-center gap-1.5"><Icon name="trendUp" size={13} />Match-Puls</div>
        <span className="text-[11px] text-muted">Souls-Vorsprung deines Teams im Verlauf</span>
        {tp && <span className="ml-auto text-[11px] text-muted">Wendepunkt <b style={{ color: tp.swing < 0 ? "#f0616d" : "#3ecf8e" }}>{mm(tp.from)}–{mm(tp.to)} ({k(tp.swing)})</b></span>}
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(adv.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (adv.length - 1))))); }}>
          <defs>
            <linearGradient id={`${id}g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#3ecf8e" stopOpacity=".42" /><stop offset="1" stopColor="#3ecf8e" stopOpacity="0" /></linearGradient>
            <linearGradient id={`${id}r`} x1="0" x2="0" y1="1" y2="0"><stop offset="0" stopColor="#f0616d" stopOpacity=".42" /><stop offset="1" stopColor="#f0616d" stopOpacity="0" /></linearGradient>
            <clipPath id={`${id}u`}><rect x={P.l} y={P.t} width={W} height={zero - P.t} /></clipPath>
            <clipPath id={`${id}d`}><rect x={P.l} y={zero} width={W} height={CH + P.t - zero} /></clipPath>
          </defs>
          {[nice, nice / 2, 0, -nice / 2, -nice].map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "rgba(255,255,255,.35)" : "rgba(255,255,255,.07)"} strokeDasharray={v === 0 ? "5 4" : undefined} /><text x={P.l - 8} y={y(v) + 3} textAnchor="end" className="fill-[#8b94a8] text-[10px]">{v === 0 ? "0" : k(v)}</text></g>)}
          {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={P.t} y2={P.t + CH} stroke="rgba(255,255,255,.04)" /><text x={x(t)} y={H - 6} textAnchor="middle" className="fill-[#8b94a8] text-[10px]">{t / 60}′</text></g>)}
          {tp && <rect x={x(tp.from)} y={P.t} width={x(tp.to) - x(tp.from)} height={CH} rx="4" fill={tp.swing < 0 ? "#f0616d" : "#3ecf8e"} opacity=".1" />}
          <g className="debrief-reveal">
            <path d={area} fill={`url(#${id}g)`} clipPath={`url(#${id}u)`} />
            <path d={area} fill={`url(#${id}r)`} clipPath={`url(#${id}d)`} />
            <path d={path} fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 6px ${accent}88)` }} />
          </g>
          {/* Spuren: Tode, Kills, Gebäude */}
          {["Tode", "Kills", "Gebäude"].map((l, i) => <g key={l}><line x1={P.l} x2={W - P.r} y1={laneY(i)} y2={laneY(i)} stroke="rgba(255,255,255,.05)" /><text x={P.l - 8} y={laneY(i) + 3} textAnchor="end" className="fill-[#8b94a8] text-[9px]">{l}</text></g>)}
          {deaths.map((t, i) => <g key={"d" + i} className="debrief-dot" style={{ animationDelay: `${3.8 + i * 0.08}s` }}><line x1={x(t)} x2={x(t)} y1={laneY(0) - 6} y2={laneY(0) + 6} stroke="#f0616d" strokeWidth="3" strokeLinecap="round" /><title>Tod {mm(t)}</title></g>)}
          {kills.map((t, i) => <g key={"k" + i} className="debrief-dot" style={{ animationDelay: `${3.6 + i * 0.06}s` }}><line x1={x(t)} x2={x(t)} y1={laneY(1) - 6} y2={laneY(1) + 6} stroke="#3ecf8e" strokeWidth="3" strokeLinecap="round" /><title>Kill ≈ {mm(t)}</title></g>)}
          {objs.map((o, i) => <rect key={"o" + i} x={x(o.t) - 4} y={laneY(2) - 4} width="8" height="8" transform={`rotate(45 ${x(o.t)} ${laneY(2)})`} fill={o.mine ? "#3ecf8e" : "#f0616d"} opacity=".9" className="debrief-dot" style={{ animationDelay: `${3.4 + i * 0.06}s` }}><title>{o.mine ? "Gegnerisches" : "Eigenes"} Gebäude gefallen {mm(o.t)}</title></rect>)}
          {hv && <g><line x1={x(hv.t)} x2={x(hv.t)} y1={P.t} y2={laneY(2) + 8} stroke="rgba(255,255,255,.4)" /><circle cx={x(hv.t)} cy={y(hv.v)} r="5" fill="#fff" stroke={accent} strokeWidth="2" /></g>}
        </svg>
        {hv && (
          <div className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-[#0b0e15]/95 px-2.5 py-1.5 text-[11px] shadow-xl" style={{ left: `${Math.min(88, Math.max(12, (x(hv.t) / W) * 100))}%` }}>
            <b className="text-white">{mm(hv.t)}</b> · Vorsprung <b style={{ color: hv.v >= 0 ? "#3ecf8e" : "#f0616d" }}>{k(hv.v)}</b>
            {(near(deaths, hv.t) > 0 || near(kills, hv.t) > 0) && <span className="ml-2 text-muted">{near(kills, hv.t) > 0 && <>{near(kills, hv.t)}× Kill </>}{near(deaths, hv.t) > 0 && <>{near(deaths, hv.t)}× Tod</>}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 text-[10px] text-muted">
        <span><i className="mr-1 inline-block h-2.5 w-[3px] rounded bg-[#f0616d] align-middle" />Tod</span>
        <span><i className="mr-1 inline-block h-2.5 w-[3px] rounded bg-[#3ecf8e] align-middle" />Kill</span>
        <span><i className="mr-1 inline-block h-2 w-2 rotate-45 bg-[#3ecf8e] align-middle" />gegnerisches Gebäude</span>
        <span><i className="mr-1 inline-block h-2 w-2 rotate-45 bg-[#f0616d] align-middle" />eigenes Gebäude</span>
      </div>
    </div>
  );
}
